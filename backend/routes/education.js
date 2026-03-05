const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Children
router.get('/children', (req, res) => {
  const children = db.prepare('SELECT * FROM children ORDER BY name ASC').all();
  res.json(children);
});

router.post('/children', (req, res) => {
  const { name, dob } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO children (name, dob) VALUES (?, ?)').run(name, dob || null);
  res.status(201).json({ id: result.lastInsertRowid, name, dob });
});

router.put('/children/:id', (req, res) => {
  const { name, dob } = req.body;
  db.prepare('UPDATE children SET name=?, dob=? WHERE id=?').run(name, dob || null, req.params.id);
  res.json({ message: 'Child updated' });
});

router.delete('/children/:id', (req, res) => {
  db.prepare('DELETE FROM education_expenses WHERE child_id = ?').run(req.params.id);
  db.prepare('DELETE FROM children WHERE id = ?').run(req.params.id);
  res.json({ message: 'Child removed' });
});

// Education expenses
router.get('/expenses', (req, res) => {
  const { child_id, month, year } = req.query;
  let query = `SELECT e.*, c.name as child_name FROM education_expenses e
               JOIN children c ON e.child_id = c.id WHERE 1=1`;
  const params = [];
  if (child_id) { query += ' AND e.child_id = ?'; params.push(child_id); }
  if (month && year) {
    const monthStr = String(month).padStart(2, '0');
    query += ' AND e.date LIKE ?';
    params.push(`${year}-${monthStr}%`);
  }
  if (year && !month) {
    query += ' AND e.date LIKE ?';
    params.push(`${year}%`);
  }
  query += ' ORDER BY e.date DESC';
  const rows = db.prepare(query).all(...params);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  res.json({ items: rows, total });
});

router.post('/expenses', (req, res) => {
  const { child_id, category, amount, date, notes } = req.body;
  if (!child_id || !category || !amount || !date) {
    return res.status(400).json({ error: 'child_id, category, amount, and date are required' });
  }
  const result = db.prepare(
    'INSERT INTO education_expenses (child_id, category, amount, date, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(child_id, category, amount, date, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/expenses/:id', (req, res) => {
  const { child_id, category, amount, date, notes } = req.body;
  db.prepare(
    'UPDATE education_expenses SET child_id=?, category=?, amount=?, date=?, notes=? WHERE id=?'
  ).run(child_id, category, amount, date, notes || null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM education_expenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Annual budget vs actual
router.get('/annual-summary', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const byChild = db.prepare(
    `SELECT c.id, c.name, COALESCE(SUM(e.amount), 0) as total_spent
     FROM children c LEFT JOIN education_expenses e
     ON c.id = e.child_id AND e.date LIKE ?
     GROUP BY c.id`
  ).all(`${year}%`);
  res.json(byChild);
});

module.exports = router;
