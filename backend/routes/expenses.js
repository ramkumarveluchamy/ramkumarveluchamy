const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const { month, year, category, startDate, endDate } = req.query;
  let query = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];

  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    query += ' AND date LIKE ?';
    params.push(`${year}-${monthStr}%`);
  }
  if (startDate) { query += ' AND date >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND date <= ?'; params.push(endDate); }
  if (category) { query += ' AND category = ?'; params.push(category); }

  query += ' ORDER BY date DESC';
  const rows = db.prepare(query).all(...params);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  res.json({ items: rows, total });
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
