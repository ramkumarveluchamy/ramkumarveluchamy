const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const { month, year, category, startDate, endDate, needs_review } = req.query;
  let query = 'SELECT * FROM expenses WHERE (is_transfer IS NULL OR is_transfer = 0)';
  const params = [];

  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    query += ' AND date LIKE ?';
    params.push(`${year}-${monthStr}%`);
  }
  if (startDate) { query += ' AND date >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND date <= ?'; params.push(endDate); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (needs_review === '1') { query += " AND source = 'plaid' AND (is_reviewed IS NULL OR is_reviewed = 0)"; }

  query += ' ORDER BY date DESC';
  const rows = db.prepare(query).all(...params);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const unreviewedCount = db.prepare(
    "SELECT COUNT(*) as n FROM expenses WHERE source='plaid' AND (is_reviewed IS NULL OR is_reviewed=0) AND (is_transfer IS NULL OR is_transfer=0)"
  ).get().n;
  res.json({ items: rows, total, unreviewedCount });
});

router.post('/', (req, res) => {
  const { amount, category, date, description, payment_method } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required' });
  }
  const result = db.prepare(
    'INSERT INTO expenses (amount, category, date, description, payment_method) VALUES (?, ?, ?, ?, ?)'
  ).run(amount, category, date, description || null, payment_method || null);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Expense added' });
});

router.put('/:id', (req, res) => {
  const { amount, category, date, description, payment_method } = req.body;
  db.prepare(
    'UPDATE expenses SET amount=?, category=?, date=?, description=?, payment_method=? WHERE id=?'
  ).run(amount, category, date, description || null, payment_method || null, req.params.id);
  res.json({ message: 'Expense updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Expense deleted' });
});

// Yearly monthly breakdown for charts
router.get('/yearly', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const rows = db.prepare(
    `SELECT strftime('%m', date) as month, SUM(amount) as total
     FROM expenses WHERE date LIKE ? GROUP BY month ORDER BY month`
  ).all(`${year}%`);
  res.json(rows);
});

// Groceries routes nested here for simplicity
router.get('/groceries', (req, res) => {
  const { month, year } = req.query;
  let query = 'SELECT * FROM groceries WHERE 1=1';
  const params = [];
  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    query += ' AND date LIKE ?';
    params.push(`${year}-${monthStr}%`);
  }
  query += ' ORDER BY date DESC';
  const rows = db.prepare(query).all(...params);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  res.json({ items: rows, total });
});

// Inline recategorize (sets user_category_override=1 so sync won't overwrite)
router.patch('/:id/category', (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'category required' });
  db.prepare(
    'UPDATE expenses SET category=?, user_category_override=1 WHERE id=?'
  ).run(category, req.params.id);
  res.json({ category });
});

// Toggle reviewed status
router.patch('/:id/review', (req, res) => {
  const row = db.prepare('SELECT is_reviewed FROM expenses WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const next = row.is_reviewed ? 0 : 1;
  db.prepare('UPDATE expenses SET is_reviewed=? WHERE id=?').run(next, req.params.id);
  res.json({ is_reviewed: next });
});

router.post('/groceries', (req, res) => {
  const { amount, store, date, notes } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'Amount and date are required' });
  const result = db.prepare(
    'INSERT INTO groceries (amount, store, date, notes) VALUES (?, ?, ?, ?)'
  ).run(amount, store || null, date, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/groceries/:id', (req, res) => {
  db.prepare('DELETE FROM groceries WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
