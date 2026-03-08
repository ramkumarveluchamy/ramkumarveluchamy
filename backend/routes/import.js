const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Multer: store uploads in memory (max 10MB — covers typical CC statements)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.pdf'].includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and PDF files are supported'));
  },
});

// ─── Known CC CSV format detection ───────────────────────────────────────────

function detectAndParseCSV(buffer) {
  const text = buffer.toString('utf-8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (!records.length) return [];
  const headers = Object.keys(records[0]).map(h => h.trim());

  // Chase
  if (headers.includes('Transaction Date') && headers.includes('Description') && headers.includes('Amount')) {
    return records
      .filter(r => r['Type'] !== 'Payment' && r['Type'] !== 'Credit')
      .map(r => ({
        date: normalizeDate(r['Transaction Date']),
        description: r['Description'].trim(),
        amount: Math.abs(parseFloat(r['Amount']) || 0),
        suggested_category: mapChaseCategory(r['Category'] || ''),
      }))
      .filter(r => r.amount > 0);
  }

  // Citi
  if (headers.includes('Date') && headers.includes('Description') && headers.includes('Debit')) {
    return records
      .filter(r => r['Debit'] && parseFloat(r['Debit']) > 0)
      .map(r => ({
        date: normalizeDate(r['Date']),
        description: r['Description'].trim(),
        amount: Math.abs(parseFloat(r['Debit']) || 0),
        suggested_category: 'Miscellaneous',
      }))
      .filter(r => r.amount > 0);
  }

  // Capital One
  if (headers.includes('Transaction Date') && headers.includes('Description') && headers.includes('Debit')) {
    return records
      .filter(r => r['Debit'] && parseFloat(r['Debit']) > 0)
      .map(r => ({
        date: normalizeDate(r['Transaction Date']),
        description: r['Description'].trim(),
        amount: Math.abs(parseFloat(r['Debit']) || 0),
        suggested_category: mapCapOneCategory(r['Category'] || ''),
      }))
      .filter(r => r.amount > 0);
  }

  // Bank of America
  if (headers.includes('Date') && headers.includes('Payee') && headers.includes('Amount')) {
    return records
      .filter(r => parseFloat(r['Amount']) < 0)
      .map(r => ({
        date: normalizeDate(r['Date']),
        description: (r['Payee'] || r['Description'] || '').trim(),
        amount: Math.abs(parseFloat(r['Amount']) || 0),
        suggested_category: 'Miscellaneous',
      }))
      .filter(r => r.amount > 0);
  }

  // Generic fallback — try to find date/description/amount columns
  const dateCol = headers.find(h => /date/i.test(h));
  const descCol = headers.find(h => /desc|merchant|payee|name/i.test(h));
  const amtCol = headers.find(h => /amount|debit|charge/i.test(h));

  if (dateCol && descCol && amtCol) {
    return records
      .map(r => ({
        date: normalizeDate(r[dateCol]),
        description: (r[descCol] || '').trim(),
        amount: Math.abs(parseFloat((r[amtCol] || '').replace(/[$,]/g, '')) || 0),
        suggested_category: 'Miscellaneous',
      }))
      .filter(r => r.amount > 0 && r.description);
  }

  return null; // Unknown format — will fall through to Claude
}

function normalizeDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0];
  // Handle MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  return raw;
}

function mapChaseCategory(cat) {
  const map = {
    'Food & Drink': 'Food', 'Groceries': 'Groceries', 'Gas': 'Transport',
    'Travel': 'Transport', 'Health & Wellness': 'Health',
    'Shopping': 'Shopping', 'Entertainment': 'Entertainment',
    'Bills & Utilities': 'Utilities',
  };
  return map[cat] || 'Miscellaneous';
}

function mapCapOneCategory(cat) {
  const map = {
    'Dining': 'Food', 'Groceries': 'Groceries', 'Gas': 'Transport',
    'Travel': 'Transport', 'Health Care': 'Health', 'Shopping': 'Shopping',
    'Entertainment': 'Entertainment', 'Utilities': 'Utilities',
  };
  return map[cat] || 'Miscellaneous';
}

// ─── Claude AI parser (PDF + unknown CSV) ────────────────────────────────────

async function parseWithClaude(content, isPDF, buffer) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured. Add it to your .env file.');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const EXTRACTION_PROMPT = `Extract ALL credit card charges/transactions from this statement.

Return ONLY a valid JSON array. Each element must have exactly these fields:
- "date": transaction date in YYYY-MM-DD format
- "description": clean merchant name (remove location codes, transaction IDs)
- "amount": positive number (charges only — exclude payments, credits, balance transfers)
- "suggested_category": one of: Food, Transport, Shopping, Entertainment, Health, Groceries, Utilities, Education, Miscellaneous

Rules:
- Exclude payments made TO the card
- Exclude balance transfers and credits
- Round amounts to 2 decimal places
- Return ONLY the JSON array, no markdown, no explanation`;

  let messages;

  if (isPDF) {
    // Send PDF directly to Claude — Claude supports PDF documents natively
    const base64 = buffer.toString('base64');
    messages = [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }];
  } else {
    // Unknown CSV format — send as text
    messages = [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nCSV Content:\n${content}`,
    }];
  }

  // Use claude-haiku-4-5 for cost efficiency (~$0.001-0.01 per statement)
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages,
  });

  const text = response.content.find(b => b.type === 'text')?.text || '[]';

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');

  const transactions = JSON.parse(jsonMatch[0]);
  return transactions.map(t => ({
    date: t.date,
    description: String(t.description || '').trim(),
    amount: Math.abs(parseFloat(t.amount) || 0),
    suggested_category: t.suggested_category || 'Miscellaneous',
  })).filter(t => t.amount > 0);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/import/credit-card  — parse uploaded statement, return preview
router.post('/credit-card', upload.single('statement'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const isPDF = req.file.originalname.toLowerCase().endsWith('.pdf');
  let transactions = [];

  try {
    if (!isPDF) {
      // Try programmatic CSV parse first (free, instant)
      const parsed = detectAndParseCSV(req.file.buffer);
      if (parsed && parsed.length > 0) {
        transactions = parsed;
      } else {
        // Unknown CSV format → use Claude
        transactions = await parseWithClaude(
          req.file.buffer.toString('utf-8'), false, req.file.buffer
        );
      }
    } else {
      // PDF → always use Claude
      transactions = await parseWithClaude(null, true, req.file.buffer);
    }

    res.json({
      count: transactions.length,
      transactions,
      source: isPDF ? 'claude_ai' : 'parsed',
      message: `Found ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`,
    });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to parse statement' });
  }
});

// POST /api/import/confirm  — bulk insert reviewed transactions into expenses
router.post('/confirm', (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'No transactions to import' });
  }

  const insert = db.prepare(
    'INSERT INTO expenses (amount, category, date, description, payment_method) VALUES (?, ?, ?, ?, ?)'
  );

  const importMany = db.transaction((txns) => {
    let count = 0;
    for (const t of txns) {
      if (!t.amount || !t.date || !t.category) continue;
      insert.run(t.amount, t.category, t.date, t.description || '', 'Credit Card');
      count++;
    }
    return count;
  });

  const count = importMany(transactions);
  res.json({ message: `Imported ${count} transactions`, count });
});

module.exports = router;
