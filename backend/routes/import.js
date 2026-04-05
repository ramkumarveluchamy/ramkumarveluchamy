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

// ─── Known CSV format detection ─────────────────────────────────────────────

function detectAndParseCSV(buffer) {
  const text = buffer.toString('utf-8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  if (!records.length) return [];
  const headers = Object.keys(records[0]).map(h => h.trim());
  const headerStr = headers.join('|').toLowerCase();

  // ── Chase Credit Card ──
  // Headers: Transaction Date, Post Date, Description, Category, Type, Amount
  // Type values: Sale, Return, Payment, Adjustment
  if (headers.includes('Transaction Date') && headers.includes('Category') && headers.includes('Type') && headers.includes('Amount')) {
    return {
      bank: 'Chase Credit Card',
      transactions: records
        .filter(r => r['Type'] !== 'Payment')
        .map(r => {
          const amt = parseFloat(r['Amount']) || 0;
          // Charges are negative on Chase CC, credits/returns are positive
          const type = r['Type'] === 'Return' || amt > 0 ? 'credit' : 'expense';
          return {
            date: normalizeDate(r['Transaction Date']),
            description: r['Description'].trim(),
            amount: Math.abs(amt),
            type,
            suggested_category: mapChaseCategory(r['Category'] || ''),
          };
        })
        .filter(r => r.amount > 0),
    };
  }

  // ── Chase Checking ──
  // Headers: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
  if (headers.includes('Details') && headers.includes('Posting Date') && headers.includes('Balance')) {
    return {
      bank: 'Chase Checking',
      transactions: records
        .map(r => {
          const amt = parseFloat(r['Amount']) || 0;
          return {
            date: normalizeDate(r['Posting Date']),
            description: r['Description'].trim(),
            amount: Math.abs(amt),
            type: amt >= 0 ? 'income' : 'expense',
            suggested_category: amt >= 0 ? 'Income' : categorizeChecking(r['Description']),
          };
        })
        .filter(r => r.amount > 0),
    };
  }

  // ── Discover ──
  // Headers: Trans. Date, Post Date, Description, Amount, Category
  if (headerStr.includes('trans. date') || (headers.includes('Trans. Date') && headers.includes('Category'))) {
    const dateCol = headers.find(h => /trans.*date/i.test(h)) || headers.find(h => /date/i.test(h));
    const catCol = headers.find(h => /category/i.test(h));
    return {
      bank: 'Discover',
      transactions: records
        .map(r => {
          const amt = parseFloat(r['Amount']) || 0;
          const desc = r['Description'].trim();
          // Discover: charges are negative, credits/refunds are positive
          const type = amt > 0 ? (isStatementCredit(desc) ? 'credit' : 'credit') : 'expense';
          return {
            date: normalizeDate(r[dateCol]),
            description: desc,
            amount: Math.abs(amt),
            type,
            suggested_category: mapDiscoverCategory(catCol ? r[catCol] : ''),
          };
        })
        .filter(r => r.amount > 0),
    };
  }

  // ── American Express ──
  // Format 1: Date, Description, Amount (simple)
  // Format 2: Date, Reference, Description, Card Member, Account #, Amount
  // Format 3: Date, Receipt, Description, Amount
  // Amex: charges are positive, statement credits/refunds are negative OR have credit keywords in description
  if (headerStr.includes('reference') && headers.includes('Amount') && headers.includes('Description')) {
    return {
      bank: 'American Express',
      transactions: records
        .map(r => {
          const raw = parseFloat(r['Amount']) || 0;
          const desc = r['Description'].trim();
          if (isCardPayment(desc)) return null;
          const isCredit = raw < 0 || isStatementCredit(desc);
          return {
            date: normalizeDate(r['Date']),
            description: desc,
            amount: Math.abs(raw),
            type: isCredit ? 'credit' : 'expense',
            suggested_category: mapAmexCategory(r['Category'] || desc),
          };
        })
        .filter(r => r && r.amount > 0),
    };
  }
  // Amex simple format (up to 6 columns: Date, Description, Card Member, Account #, Amount + optional extra)
  if (headers.includes('Date') && headers.includes('Description') && headers.includes('Amount')
      && !headers.includes('Debit') && !headers.includes('Payee') && !headers.includes('Balance')
      && !headers.includes('Transaction Date') && !headers.includes('Details')) {
    return {
      bank: 'American Express',
      transactions: records
        .map(r => {
          const raw = parseFloat(r['Amount']) || 0;
          const desc = r['Description'].trim();
          if (isCardPayment(desc)) return null;
          const isCredit = raw < 0 || isStatementCredit(desc);
          return {
            date: normalizeDate(r['Date']),
            description: desc,
            amount: Math.abs(raw),
            type: isCredit ? 'credit' : 'expense',
            suggested_category: mapAmexCategory(desc),
          };
        })
        .filter(r => r && r.amount > 0),
    };
  }

  // ── Citi / Citi Costco ──
  // Headers: Status, Date, Description, Debit, Credit
  if (headers.includes('Date') && headers.includes('Description') && headers.includes('Debit') && headers.includes('Credit')) {
    return {
      bank: 'Citi',
      transactions: records
        .filter(r => r['Debit'] && parseFloat(r['Debit']) > 0)
        .map(r => ({
          date: normalizeDate(r['Date']),
          description: r['Description'].trim(),
          amount: Math.abs(parseFloat(r['Debit']) || 0),
          type: 'expense',
          suggested_category: 'Miscellaneous',
        }))
        .filter(r => r.amount > 0),
    };
  }

  // ── Fifth Third (53) ──
  // Format: Date, Description, Amount or Date, Description, Debit, Credit, Balance
  if (headerStr.includes('fifth') || (headers.includes('Date') && headers.includes('Description') && headers.includes('Balance')
      && !headers.includes('Payee') && !headers.includes('Category'))) {
    const debitCol = headers.find(h => /debit|withdrawal/i.test(h));
    const creditCol = headers.find(h => /credit|deposit/i.test(h));
    const amtCol = headers.find(h => /^amount$/i.test(h));

    return {
      bank: 'Fifth Third',
      transactions: records
        .map(r => {
          let amt, type;
          if (debitCol && creditCol) {
            const debit = parseFloat((r[debitCol] || '').replace(/[$,]/g, '')) || 0;
            const credit = parseFloat((r[creditCol] || '').replace(/[$,]/g, '')) || 0;
            amt = debit || credit;
            type = debit > 0 ? 'expense' : 'income';
          } else if (amtCol) {
            const raw = parseFloat((r[amtCol] || '').replace(/[$,]/g, '')) || 0;
            amt = Math.abs(raw);
            type = raw < 0 ? 'expense' : 'income';
          } else {
            return null;
          }
          return {
            date: normalizeDate(r['Date']),
            description: (r['Description'] || '').trim(),
            amount: amt,
            type,
            suggested_category: type === 'income' ? 'Income' : categorizeChecking(r['Description']),
          };
        })
        .filter(r => r && r.amount > 0),
    };
  }

  // ── Trustco ──
  // Format: Date, Description, Amount, Balance or Date, Description, Debit, Credit, Balance
  if (headerStr.includes('trustco') || (headers.includes('Date') && headers.includes('Description')
      && headers.includes('Balance') && headers.length <= 5)) {
    const debitCol = headers.find(h => /debit|withdrawal/i.test(h));
    const creditCol = headers.find(h => /credit|deposit/i.test(h));
    const amtCol = headers.find(h => /^amount$/i.test(h));

    return {
      bank: 'Trustco',
      transactions: records
        .map(r => {
          let amt, type;
          if (debitCol && creditCol) {
            const debit = parseFloat((r[debitCol] || '').replace(/[$,]/g, '')) || 0;
            const credit = parseFloat((r[creditCol] || '').replace(/[$,]/g, '')) || 0;
            amt = debit || credit;
            type = debit > 0 ? 'expense' : 'income';
          } else if (amtCol) {
            const raw = parseFloat((r[amtCol] || '').replace(/[$,]/g, '')) || 0;
            amt = Math.abs(raw);
            type = raw < 0 ? 'expense' : 'income';
          } else {
            return null;
          }
          return {
            date: normalizeDate(r['Date']),
            description: (r['Description'] || '').trim(),
            amount: amt,
            type,
            suggested_category: type === 'income' ? 'Income' : categorizeChecking(r['Description']),
          };
        })
        .filter(r => r && r.amount > 0),
    };
  }

  // ── Capital One ──
  if (headers.includes('Transaction Date') && headers.includes('Description') && headers.includes('Debit')) {
    return {
      bank: 'Capital One',
      transactions: records
        .filter(r => r['Debit'] && parseFloat(r['Debit']) > 0)
        .map(r => ({
          date: normalizeDate(r['Transaction Date']),
          description: r['Description'].trim(),
          amount: Math.abs(parseFloat(r['Debit']) || 0),
          type: 'expense',
          suggested_category: mapCapOneCategory(r['Category'] || ''),
        }))
        .filter(r => r.amount > 0),
    };
  }

  // ── Bank of America ──
  if (headers.includes('Date') && headers.includes('Payee') && headers.includes('Amount')) {
    return {
      bank: 'Bank of America',
      transactions: records
        .map(r => {
          const amt = parseFloat(r['Amount']) || 0;
          return {
            date: normalizeDate(r['Date']),
            description: (r['Payee'] || r['Description'] || '').trim(),
            amount: Math.abs(amt),
            type: amt < 0 ? 'expense' : 'income',
            suggested_category: amt < 0 ? 'Miscellaneous' : 'Income',
          };
        })
        .filter(r => r.amount > 0),
    };
  }

  // ── Generic fallback — try to find date/description/amount columns ──
  const dateCol = headers.find(h => /date/i.test(h));
  const descCol = headers.find(h => /desc|merchant|payee|name/i.test(h));
  const amtCol = headers.find(h => /amount|debit|charge/i.test(h));

  if (dateCol && descCol && amtCol) {
    return {
      bank: 'Unknown',
      transactions: records
        .map(r => {
          const raw = parseFloat((r[amtCol] || '').replace(/[$,]/g, '')) || 0;
          const desc = (r[descCol] || '').trim();
          // Skip card payments entirely
          if (isCardPayment(desc)) return null;
          // Check description for credits/refunds before using amount sign
          let type;
          if (isStatementCredit(desc)) {
            type = 'credit';
          } else {
            // Negative = expense for most formats (checking/Amex); positive = income
            type = raw < 0 ? 'expense' : 'income';
          }
          return {
            date: normalizeDate(r[dateCol]),
            description: desc,
            amount: Math.abs(raw),
            type,
            suggested_category: type === 'income' ? 'Income' : mapAmexCategory(desc),
          };
        })
        .filter(r => r && r.amount > 0 && r.description),
    };
  }

  return null; // Unknown format — will fall through to Claude
}

// ─── Date normalization ─────────────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0];
  raw = raw.trim();
  // Handle MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Handle MM/DD/YY
  const mdy2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdy2) {
    const yr = parseInt(mdy2[3]) > 50 ? `19${mdy2[3]}` : `20${mdy2[3]}`;
    return `${yr}-${mdy2[1].padStart(2,'0')}-${mdy2[2].padStart(2,'0')}`;
  }
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  // Handle Month DD, YYYY (e.g., "Jan 15, 2026")
  const mdy3 = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy3) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const m = months[mdy3[1].toLowerCase().substring(0,3)];
    if (m) return `${mdy3[3]}-${String(m).padStart(2,'0')}-${mdy3[2].padStart(2,'0')}`;
  }
  return raw;
}

// ─── Credit/refund detection ─────────────────────────────────────────────────
// Detects statement credits, benefit credits, refunds, and returns by description keyword.
// Covers Amex Platinum perks (airline fee, hotel credit, digital entertainment, Walmart+,
// Uber Cash, Saks credit, etc.) and generic merchant refunds.
function isStatementCredit(desc) {
  if (!desc) return false;
  // Match standalone "credit", "refund", "return" etc. OR compound Amex benefit phrases
  return /\b(credit|refund|return|reversal|adjustment|cashback|cash back|reward|rebate|reimbursement)\b/i.test(desc)
    || /platinum\s+\w.*credit|statement credit|benefit credit|travel credit|airline fee|hotel credit|dining credit|entertainment credit|digital credit|walmart\+|uber cash|saks/i.test(desc);
}

// Detects credit card payments (not purchases) — should be excluded from import
function isCardPayment(desc) {
  if (!desc) return false;
  return /\b(payment|autopay|auto\s*pay)\b/i.test(desc)
    || /mobile payment|online payment|thank you|ach payment|electronic payment|bill payment/i.test(desc);
}

// ─── Category mapping ───────────────────────────────────────────────────────

function mapChaseCategory(cat) {
  const map = {
    'Food & Drink': 'Food', 'Groceries': 'Groceries', 'Gas': 'Transport',
    'Travel': 'Transport', 'Health & Wellness': 'Health',
    'Shopping': 'Shopping', 'Entertainment': 'Entertainment',
    'Bills & Utilities': 'Utilities', 'Professional Services': 'Miscellaneous',
    'Personal': 'Miscellaneous', 'Home': 'Utilities',
    'Automotive': 'Transport', 'Education': 'Education',
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

function mapDiscoverCategory(cat) {
  if (!cat) return 'Miscellaneous';
  const map = {
    'Restaurants': 'Food', 'Gasoline': 'Transport', 'Merchandise': 'Shopping',
    'Supermarkets': 'Groceries', 'Travel/ Entertainment': 'Entertainment',
    'Services': 'Miscellaneous', 'Medical Services': 'Health',
    'Education': 'Education', 'Wholesale Clubs': 'Groceries',
    'Department Stores': 'Shopping', 'Automotive': 'Transport',
    'Home Improvement': 'Utilities',
  };
  return map[cat] || 'Miscellaneous';
}

function mapAmexCategory(desc) {
  if (!desc) return 'Miscellaneous';
  const d = desc.toLowerCase();
  if (/restaurant|mcdonald|starbucks|chipotle|subway|burger|pizza|taco|dine|cafe|coffee|grubhub|doordash|uber\s?eat/i.test(d)) return 'Food';
  if (/walmart|target|costco|kroger|publix|aldi|whole foods|trader joe|safeway|grocery|market/i.test(d)) return 'Groceries';
  if (/gas|shell|exxon|chevron|bp|fuel|speedway|marathon|wawa/i.test(d)) return 'Transport';
  if (/amazon|ebay|best buy|apple|etsy|nordstrom|macy|kohls/i.test(d)) return 'Shopping';
  if (/netflix|hulu|spotify|disney|hbo|youtube|cinema|movie|theater/i.test(d)) return 'Entertainment';
  if (/pharmacy|cvs|walgreens|doctor|hospital|dental|medical|health/i.test(d)) return 'Health';
  if (/electric|water|gas bill|internet|phone|verizon|at&t|t-mobile|comcast|spectrum/i.test(d)) return 'Utilities';
  return 'Miscellaneous';
}

function categorizeChecking(desc) {
  if (!desc) return 'Miscellaneous';
  return mapAmexCategory(desc); // reuse description-based categorization
}

// ─── Claude AI parser (PDF + unknown CSV) ────────────────────────────────────

async function parseWithClaude(content, isPDF, buffer) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured. Add it to your .env file.');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const EXTRACTION_PROMPT = `Extract ALL transactions from this bank/credit card statement.

Return ONLY a valid JSON array. Each element must have exactly these fields:
- "date": transaction date in YYYY-MM-DD format
- "description": clean merchant name (remove location codes, transaction IDs)
- "amount": positive number (the absolute amount)
- "type": "expense" for charges/debits/purchases, "income" for deposits/credits/refunds
- "suggested_category": one of: Food, Transport, Shopping, Entertainment, Health, Groceries, Utilities, Education, Income, Miscellaneous

Rules:
- Include ALL transactions (both debits and credits)
- Mark payments TO the card or deposits as type "income"
- Mark purchases, charges, and debits as type "expense"
- Round amounts to 2 decimal places
- Return ONLY the JSON array, no markdown, no explanation`;

  let messages;

  if (isPDF) {
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
    messages = [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nCSV Content:\n${content}`,
    }];
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages,
  });

  const text = response.content.find(b => b.type === 'text')?.text || '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');

  const transactions = JSON.parse(jsonMatch[0]);
  return {
    bank: 'AI Detected',
    transactions: transactions.map(t => ({
      date: t.date,
      description: String(t.description || '').trim(),
      amount: Math.abs(parseFloat(t.amount) || 0),
      type: t.type || 'expense',
      suggested_category: t.suggested_category || 'Miscellaneous',
    })).filter(t => t.amount > 0),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/import/credit-card  — parse uploaded statement, return preview
router.post('/credit-card', upload.single('statement'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const isPDF = req.file.originalname.toLowerCase().endsWith('.pdf');
  let result = { bank: 'Unknown', transactions: [] };

  try {
    if (!isPDF) {
      const parsed = detectAndParseCSV(req.file.buffer);
      if (parsed && parsed.transactions && parsed.transactions.length > 0) {
        result = parsed;
      } else {
        result = await parseWithClaude(
          req.file.buffer.toString('utf-8'), false, req.file.buffer
        );
      }
    } else {
      result = await parseWithClaude(null, true, req.file.buffer);
    }

    res.json({
      count: result.transactions.length,
      transactions: result.transactions,
      bank: result.bank,
      source: isPDF ? 'claude_ai' : (result.bank === 'AI Detected' ? 'claude_ai' : 'parsed'),
      message: `Found ${result.transactions.length} transaction${result.transactions.length !== 1 ? 's' : ''} from ${result.bank}`,
    });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to parse statement' });
  }
});

// POST /api/import/confirm  — bulk insert reviewed transactions
router.post('/confirm', (req, res) => {
  const { transactions, source_bank } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'No transactions to import' });
  }

  const insertExpense = db.prepare(
    'INSERT INTO expenses (amount, category, date, description, payment_method) VALUES (?, ?, ?, ?, ?)'
  );
  const insertIncome = db.prepare(
    'INSERT INTO income (amount, source, date, description, is_recurring) VALUES (?, ?, ?, ?, 0)'
  );

  const importMany = db.transaction((txns) => {
    let expenseCount = 0;
    let incomeCount = 0;
    const bank = source_bank || 'Bank Import';

    for (const t of txns) {
      if (!t.amount || !t.date) continue;
      if (t.type === 'credit') continue; // refunds/statement credits — skip

      if (t.type === 'income') {
        insertIncome.run(t.amount, bank, t.date, t.description || '');
        incomeCount++;
      } else {
        insertExpense.run(t.amount, t.category || 'Miscellaneous', t.date, t.description || '', bank);
        expenseCount++;
      }
    }
    return { expenseCount, incomeCount };
  });

  const { expenseCount, incomeCount } = importMany(transactions);
  res.json({
    message: `Imported ${expenseCount} expenses and ${incomeCount} income entries`,
    count: expenseCount + incomeCount,
    expenseCount,
    incomeCount,
  });
});

module.exports = router;
