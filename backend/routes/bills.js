const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get all bills with payment status for a given month/year
router.get('/', (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const bills = db.prepare('SELECT * FROM bills ORDER BY due_day ASC').all();
  const result = bills.map(bill => {
    const payment = db.prepare(
      'SELECT * FROM bill_payments WHERE bill_id = ? AND month = ? AND year = ?'
    ).get(bill.id, month, year);
    return { ...bill, payment: payment || null, status: payment ? payment.status : 'unpaid' };
  });

  res.json(result);
});

router.post('/', (req, res) => {
  const { name, amount, due_day, category, is_autopay, merchant_pattern } = req.body;
  if (!name || !amount || !due_day || !category) {
    return res.status(400).json({ error: 'Name, amount, due_day, and category are required' });
  }
  const result = db.prepare(
    'INSERT INTO bills (name, amount, due_day, category, is_autopay, merchant_pattern) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, amount, due_day, category, is_autopay ? 1 : 0, merchant_pattern || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, amount, due_day, category, is_autopay, merchant_pattern } = req.body;
  db.prepare(
    'UPDATE bills SET name=?, amount=?, due_day=?, category=?, is_autopay=?, merchant_pattern=? WHERE id=?'
  ).run(name, amount, due_day, category, is_autopay ? 1 : 0, merchant_pattern || null, req.params.id);
  res.json({ message: 'Bill updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bill_payments WHERE bill_id = ?').run(req.params.id);
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  res.json({ message: 'Bill deleted' });
});

// Toggle payment status
router.post('/:id/payment', (req, res) => {
  const { month, year, status } = req.body;
  const billId = req.params.id;

  const existing = db.prepare(
    'SELECT * FROM bill_payments WHERE bill_id = ? AND month = ? AND year = ?'
  ).get(billId, month, year);

  if (existing) {
    const newStatus = status || (existing.status === 'paid' ? 'unpaid' : 'paid');
    db.prepare(
      'UPDATE bill_payments SET status=?, paid_on=? WHERE id=?'
    ).run(newStatus, newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null, existing.id);
    res.json({ status: newStatus });
  } else {
    db.prepare(
      'INSERT INTO bill_payments (bill_id, month, year, status, paid_on) VALUES (?, ?, ?, ?, ?)'
    ).run(billId, month, year, 'paid', new Date().toISOString().split('T')[0]);
    res.json({ status: 'paid' });
  }
});

// Run auto-match for a given month
router.post('/auto-match', (req, res) => {
  const month = parseInt(req.body.month) || new Date().getMonth() + 1;
  const year = parseInt(req.body.year) || new Date().getFullYear();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  const bills = db.prepare("SELECT * FROM bills WHERE merchant_pattern IS NOT NULL AND merchant_pattern != ''").all();
  let matched = 0;

  for (const bill of bills) {
    const pattern = `%${bill.merchant_pattern.toLowerCase()}%`;
    const expense = db.prepare(`
      SELECT id FROM expenses
      WHERE (LOWER(merchant_name) LIKE ? OR LOWER(description) LIKE ?)
        AND date LIKE ?
        AND (is_transfer IS NULL OR is_transfer = 0)
      LIMIT 1
    `).get(pattern, pattern, `${prefix}%`);

    if (!expense) continue;

    const existing = db.prepare(
      'SELECT id, source FROM bill_payments WHERE bill_id = ? AND month = ? AND year = ?'
    ).get(bill.id, month, year);

    if (!existing) {
      db.prepare(`
        INSERT INTO bill_payments (bill_id, month, year, status, paid_on, source)
        VALUES (?, ?, ?, 'paid', ?, 'plaid')
      `).run(bill.id, month, year, `${prefix}-01`);
      matched++;
    }
  }

  res.json({ matched, month, year });
});

// Get bill payment history
router.get('/:id/history', (req, res) => {
  const payments = db.prepare(
    'SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY year DESC, month DESC LIMIT 12'
  ).all(req.params.id);
  res.json(payments);
});

module.exports = router;
