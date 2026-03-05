const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const { month, year, source } = req.query;
  let query = 'SELECT * FROM income WHERE 1=1';
  const params = [];

  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    query += ` AND date LIKE ?`;
    params.push(`${year}-${monthStr}%`);
  }
  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  query += ' ORDER BY date DESC';
  const rows = db.prepare(query).all(...params);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  res.json({ items: rows, total });
});

router.post('/', (req, res) => {
  const { amount, source, date, notes, is_recurring, frequency } = req.body;
  if (!amount || !source || !date) {
    return res.status(400).json({ error: 'Amount, source, and date are required' });
  }
  const result = db.prepare(
    'INSERT INTO income (amount, source, date, notes, is_recurring, frequency) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(amount, source, date, notes || null, is_recurring ? 1 : 0, frequency || null);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Income added' });
});

router.put('/:id', (req, res) => {
  const { amount, source, date, notes, is_recurring, frequency } = req.body;
  const { id } = req.params;
  db.prepare(
    'UPDATE income SET amount=?, source=?, date=?, notes=?, is_recurring=?, frequency=? WHERE id=?'
  ).run(amount, source, date, notes || null, is_recurring ? 1 : 0, frequency || null, id);
  res.json({ message: 'Income updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM income WHERE id = ?').run(req.params.id);
  res.json({ message: 'Income deleted' });
});

// Monthly totals for a year (for charts)
router.get('/yearly', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const rows = db.prepare(
    `SELECT strftime('%m', date) as month, SUM(amount) as total
     FROM income WHERE date LIKE ? GROUP BY month ORDER BY month`
  ).all(`${year}%`);
  res.json(rows);
});

module.exports = router;
