const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Monthly summary
router.get('/summary', (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}`;

  const totalIncome = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM income WHERE date LIKE ?`
  ).get(`${prefix}%`);

  const totalExpenses = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ?`
  ).get(`${prefix}%`);

  const totalGroceries = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM groceries WHERE date LIKE ?`
  ).get(`${prefix}%`);

  const expensesByCategory = db.prepare(
    `SELECT category, SUM(amount) as total FROM expenses WHERE date LIKE ? GROUP BY category`
  ).all(`${prefix}%`);

  // Add groceries as a category
  if (totalGroceries.total > 0) {
    expensesByCategory.push({ category: 'Groceries', total: totalGroceries.total });
  }

  const budgets = db.prepare(
    `SELECT category, monthly_limit FROM budgets WHERE month = ? AND year = ?`
  ).all(month, year);

  // Budget health
  const totalBudget = budgets.reduce((sum, b) => sum + b.monthly_limit, 0);
  const combinedExpenses = totalExpenses.total + totalGroceries.total;
  const budgetHealth = totalBudget > 0
    ? (combinedExpenses / totalBudget) <= 1 ? 'on_track' : 'over_budget'
    : 'no_budget';

  res.json({
    income: totalIncome.total,
    expenses: combinedExpenses,
    savings: totalIncome.total - combinedExpenses,
    savingsRate: totalIncome.total > 0
      ? ((totalIncome.total - combinedExpenses) / totalIncome.total * 100).toFixed(1)
      : 0,
    expensesByCategory,
    budgetHealth,
    totalBudget,
  });
});

// Upcoming bills (next 7 days)
router.get('/upcoming-bills', (req, res) => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const bills = db.prepare('SELECT * FROM bills ORDER BY due_day ASC').all();

  const upcoming = bills.filter(bill => {
    const daysUntilDue = bill.due_day - currentDay;
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  }).map(bill => {
    const payment = db.prepare(
      'SELECT * FROM bill_payments WHERE bill_id = ? AND month = ? AND year = ?'
    ).get(bill.id, currentMonth, currentYear);
    return {
      ...bill,
      status: payment ? payment.status : 'unpaid',
      daysUntilDue: bill.due_day - currentDay,
    };
  });

  res.json(upcoming);
});

// Recent transactions (combined income + expenses)
router.get('/recent-transactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const income = db.prepare(
    `SELECT id, amount, source as description, date, 'income' as type FROM income ORDER BY date DESC LIMIT ?`
  ).all(limit);

  const expenses = db.prepare(
    `SELECT id, amount, COALESCE(description, category) as description, date, 'expense' as type FROM expenses ORDER BY date DESC LIMIT ?`
  ).all(limit);

  const combined = [...income, ...expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);

  res.json(combined);
});

module.exports = router;
