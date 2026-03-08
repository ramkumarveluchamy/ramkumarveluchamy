const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}%`;

  const budgets = db.prepare(
    'SELECT * FROM budgets WHERE month = ? AND year = ?'
  ).all(month, year);

  // Calculate actual spending per category
  const result = budgets.map(budget => {
    let actual = 0;
    if (budget.category === 'Groceries') {
      const g = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM groceries WHERE date LIKE ?').get(prefix);
      actual = g.total;
    } else if (budget.category === 'Education') {
      const e = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM education_expenses WHERE date LIKE ?').get(prefix);
      actual = e.total;
    } else {
      const e = db.prepare(
        'SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE category = ? AND date LIKE ?'
      ).get(budget.category, prefix);
      actual = e.total;
    }
    return {
      ...budget,
      actual,
      remaining: budget.monthly_limit - actual,
      percentage: budget.monthly_limit > 0 ? Math.min((actual / budget.monthly_limit) * 100, 100) : 0,
      isOver: actual > budget.monthly_limit,
    };
  });

  res.json(result);
});

router.post('/', (req, res) => {
  const { category, monthly_limit, month, year } = req.body;
  if (!category || !monthly_limit || !month || !year) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const existing = db.prepare(
    'SELECT id FROM budgets WHERE category=? AND month=? AND year=?'
  ).get(category, month, year);

  if (existing) {
    db.prepare('UPDATE budgets SET monthly_limit=? WHERE id=?').run(monthly_limit, existing.id);
    return res.json({ id: existing.id, message: 'Budget updated' });
  }
  const result = db.prepare(
    'INSERT INTO budgets (category, monthly_limit, month, year) VALUES (?, ?, ?, ?)'
  ).run(category, monthly_limit, month, year);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { monthly_limit } = req.body;
  db.prepare('UPDATE budgets SET monthly_limit=? WHERE id=?').run(monthly_limit, req.params.id);
  res.json({ message: 'Budget updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Budget deleted' });
});

module.exports = router;
