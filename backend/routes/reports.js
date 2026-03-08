const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Monthly summary report
router.get('/monthly', (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}%`;

  const income = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM income WHERE date LIKE ?').get(prefix);
  const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date LIKE ?').get(prefix);
  const groceries = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM groceries WHERE date LIKE ?').get(prefix);
  const education = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM education_expenses WHERE date LIKE ?').get(prefix);
  const maintenance = db.prepare('SELECT COALESCE(SUM(cost),0) as total FROM home_maintenance WHERE date LIKE ?').get(prefix);

  const billsTotal = db.prepare(`
    SELECT COALESCE(SUM(b.amount),0) as total FROM bills b
    JOIN bill_payments bp ON b.id = bp.bill_id
    WHERE bp.month=? AND bp.year=? AND bp.status='paid'
  `).get(month, year);

  const expensesByCategory = db.prepare(
    'SELECT category, SUM(amount) as total FROM expenses WHERE date LIKE ? GROUP BY category'
  ).all(prefix);

  const incomeBySource = db.prepare(
    'SELECT source, SUM(amount) as total FROM income WHERE date LIKE ? GROUP BY source'
  ).all(prefix);

  const totalExpenses = expenses.total + groceries.total + education.total + maintenance.total + billsTotal.total;
  const savings = income.total - totalExpenses;

  res.json({
    month, year,
    income: income.total,
    totalExpenses,
    expenseBreakdown: {
      regularExpenses: expenses.total,
      groceries: groceries.total,
      education: education.total,
      maintenance: maintenance.total,
      bills: billsTotal.total,
    },
    savings,
    savingsRate: income.total > 0 ? ((savings / income.total) * 100).toFixed(1) : 0,
    expensesByCategory,
    incomeBySource,
  });
});

// Year-to-date report
router.get('/ytd', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const monthlyData = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, '0');
    const prefix = `${year}-${monthStr}%`;

    const income = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM income WHERE date LIKE ?').get(prefix);
    const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date LIKE ?').get(prefix);
    const groceries = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM groceries WHERE date LIKE ?').get(prefix);

    monthlyData.push({
      month: m,
      income: income.total,
      expenses: expenses.total + groceries.total,
      savings: income.total - expenses.total - groceries.total,
    });
  }

  const ytdIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
  const ytdExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);

  res.json({
    year,
    monthlyData,
    totals: {
      income: ytdIncome,
      expenses: ytdExpenses,
      savings: ytdIncome - ytdExpenses,
      savingsRate: ytdIncome > 0 ? (((ytdIncome - ytdExpenses) / ytdIncome) * 100).toFixed(1) : 0,
    },
  });
});

// Category drill-down
router.get('/category/:category', (req, res) => {
  const { category } = req.params;
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, '0');
    const prefix = `${year}-${monthStr}%`;
    const result = db.prepare(
      'SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE category=? AND date LIKE ?'
    ).get(category, prefix);
    monthly.push({ month: m, total: result.total });
  }

  const items = db.prepare(
    `SELECT * FROM expenses WHERE category=? AND date LIKE ? ORDER BY date DESC LIMIT 50`
  ).all(category, `${year}%`);

  res.json({ category, year, monthly, items });
});

// Export CSV
router.get('/export', (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}%`;

  const income = db.prepare('SELECT date, source as category, amount, notes as description FROM income WHERE date LIKE ?').all(prefix);
  const expenses = db.prepare('SELECT date, category, amount, description FROM expenses WHERE date LIKE ?').all(prefix);
  const groceries = db.prepare("SELECT date, 'Groceries' as category, amount, notes as description FROM groceries WHERE date LIKE ?").all(prefix);

  const rows = [
    ['Date', 'Type', 'Category/Source', 'Amount', 'Description'],
    ...income.map(r => [r.date, 'Income', r.category, r.amount, r.description || '']),
    ...expenses.map(r => [r.date, 'Expense', r.category, -r.amount, r.description || '']),
    ...groceries.map(r => [r.date, 'Expense', r.category, -r.amount, r.description || '']),
  ].sort((a, b) => a[0] > b[0] ? -1 : 1);

  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="finance-${year}-${monthStr}.csv"`);
  res.send(csv);
});

module.exports = router;
