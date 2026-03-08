const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Debts ────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { active_only } = req.query;
  let query = 'SELECT * FROM debts';
  if (active_only !== 'false') query += ' WHERE is_active = 1';
  query += ' ORDER BY interest_rate DESC, current_balance DESC';

  const debts = db.prepare(query).all();

  const withStats = debts.map(debt => {
    const payments = db.prepare(
      'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date DESC LIMIT 12'
    ).all(debt.id);

    const totalPaid = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM debt_payments WHERE debt_id = ?'
    ).get(debt.id).total;

    // Months to payoff at minimum payment (ignoring interest for simplicity)
    const monthsToPayoff = debt.minimum_payment > 0
      ? Math.ceil(debt.current_balance / debt.minimum_payment)
      : null;

    const paidOffPercent = debt.original_amount > 0
      ? ((debt.original_amount - debt.current_balance) / debt.original_amount) * 100
      : 0;

    return {
      ...debt,
      recentPayments: payments,
      totalPaid,
      monthsToPayoff,
      paidOffPercent: Math.max(0, Math.min(100, paidOffPercent)),
    };
  });

  const totalDebt = debts.reduce((s, d) => s + d.current_balance, 0);
  const totalMinimum = debts.reduce((s, d) => s + d.minimum_payment, 0);
  const totalInterestRate = debts.length > 0
    ? debts.reduce((s, d) => s + d.interest_rate, 0) / debts.length
    : 0;

  res.json({
    items: withStats,
    summary: { totalDebt, totalMinimum, avgInterestRate: totalInterestRate },
  });
});

router.post('/', (req, res) => {
  const { name, debt_type, original_amount, current_balance, interest_rate, minimum_payment, due_day, institution, notes } = req.body;
  if (!name || !debt_type || original_amount === undefined || current_balance === undefined) {
    return res.status(400).json({ error: 'Name, type, original amount, and current balance are required' });
  }
  const result = db.prepare(
    `INSERT INTO debts (name, debt_type, original_amount, current_balance, interest_rate, minimum_payment, due_day, institution, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, debt_type, original_amount, current_balance,
    interest_rate || 0, minimum_payment || 0,
    due_day || null, institution || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, debt_type, original_amount, current_balance, interest_rate, minimum_payment, due_day, institution, notes, is_active } = req.body;
  db.prepare(
    `UPDATE debts SET name=?, debt_type=?, original_amount=?, current_balance=?, interest_rate=?,
     minimum_payment=?, due_day=?, institution=?, notes=?, is_active=? WHERE id=?`
  ).run(name, debt_type, original_amount, current_balance,
    interest_rate || 0, minimum_payment || 0,
    due_day || null, institution || null, notes || null,
    is_active !== undefined ? is_active : 1, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM debt_payments WHERE debt_id = ?').run(req.params.id);
  db.prepare('DELETE FROM debts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Mark debt as paid off (set is_active = 0)
router.post('/:id/payoff', (req, res) => {
  db.prepare('UPDATE debts SET is_active = 0, current_balance = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Marked as paid off' });
});

// ─── Debt Payments ────────────────────────────────────────────────────────────

router.post('/:id/payments', (req, res) => {
  const { amount, date, notes } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'Amount and date required' });

  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
  if (!debt) return res.status(404).json({ error: 'Debt not found' });

  db.prepare('INSERT INTO debt_payments (debt_id, amount, date, notes) VALUES (?, ?, ?, ?)')
    .run(req.params.id, amount, date, notes || null);

  // Update current balance
  const newBalance = Math.max(0, debt.current_balance - parseFloat(amount));
  db.prepare('UPDATE debts SET current_balance = ?, is_active = ? WHERE id = ?')
    .run(newBalance, newBalance > 0 ? 1 : 0, req.params.id);

  res.status(201).json({ message: 'Payment recorded', newBalance });
});

router.get('/:id/payments', (req, res) => {
  const payments = db.prepare(
    'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date DESC'
  ).all(req.params.id);
  res.json(payments);
});

router.delete('/payments/:paymentId', (req, res) => {
  db.prepare('DELETE FROM debt_payments WHERE id = ?').run(req.params.paymentId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
