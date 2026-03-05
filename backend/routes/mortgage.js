const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Mortgage
router.get('/', (req, res) => {
  const mortgage = db.prepare('SELECT * FROM mortgage LIMIT 1').get();
  res.json(mortgage || null);
});

router.post('/', (req, res) => {
  const { principal, rate, monthly_payment, start_date, remaining_balance, notes } = req.body;
  const existing = db.prepare('SELECT id FROM mortgage LIMIT 1').get();
  if (existing) {
    db.prepare(
      'UPDATE mortgage SET principal=?, rate=?, monthly_payment=?, start_date=?, remaining_balance=?, notes=? WHERE id=?'
    ).run(principal, rate, monthly_payment, start_date, remaining_balance, notes, existing.id);
    return res.json({ message: 'Mortgage updated' });
  }
  const result = db.prepare(
    'INSERT INTO mortgage (principal, rate, monthly_payment, start_date, remaining_balance, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(principal, rate, monthly_payment, start_date, remaining_balance, notes);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Home Maintenance
router.get('/maintenance', (req, res) => {
  const rows = db.prepare('SELECT * FROM home_maintenance ORDER BY date DESC').all();
  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  res.json({ items: rows, total });
});

router.post('/maintenance', (req, res) => {
  const { date, description, cost } = req.body;
  if (!date || !description || !cost) {
    return res.status(400).json({ error: 'Date, description, and cost are required' });
  }
  const result = db.prepare(
    'INSERT INTO home_maintenance (date, description, cost) VALUES (?, ?, ?)'
  ).run(date, description, cost);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/maintenance/:id', (req, res) => {
  db.prepare('DELETE FROM home_maintenance WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Utilities
router.get('/utilities', (req, res) => {
  const { month, year } = req.query;
  let query = 'SELECT * FROM utilities WHERE 1=1';
  const params = [];
  if (month) { query += ' AND month = ?'; params.push(month); }
  if (year) { query += ' AND year = ?'; params.push(year); }
  query += ' ORDER BY year DESC, month DESC, type ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.post('/utilities', (req, res) => {
  const { type, month, year, amount } = req.body;
  if (!type || !month || !year || !amount) {
    return res.status(400).json({ error: 'Type, month, year, and amount are required' });
  }
  const existing = db.prepare(
    'SELECT id FROM utilities WHERE type=? AND month=? AND year=?'
  ).get(type, month, year);

  if (existing) {
    db.prepare('UPDATE utilities SET amount=? WHERE id=?').run(amount, existing.id);
    return res.json({ message: 'Updated', id: existing.id });
  }
  const result = db.prepare(
    'INSERT INTO utilities (type, month, year, amount) VALUES (?, ?, ?, ?)'
  ).run(type, month, year, amount);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/utilities/:id', (req, res) => {
  db.prepare('DELETE FROM utilities WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Utility trends (last 6 months)
router.get('/utilities/trends', (req, res) => {
  const rows = db.prepare(
    `SELECT type, month, year, amount FROM utilities
     ORDER BY year DESC, month DESC, type ASC LIMIT 60`
  ).all();
  res.json(rows);
});

module.exports = router;
