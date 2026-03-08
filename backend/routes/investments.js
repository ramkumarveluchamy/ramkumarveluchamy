const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Stocks ──────────────────────────────────────────────────────────────────

router.get('/stocks', (req, res) => {
  const stocks = db.prepare('SELECT * FROM stocks ORDER BY account_type, ticker').all();
  const totalValue = stocks.reduce((s, st) => s + st.shares * (st.current_price || st.purchase_price), 0);
  const totalCost = stocks.reduce((s, st) => s + st.shares * st.purchase_price, 0);
  res.json({ items: stocks, totalValue, totalCost, totalGain: totalValue - totalCost });
});

router.post('/stocks', (req, res) => {
  const { ticker, name, shares, purchase_price, current_price, purchase_date, account_type, notes } = req.body;
  if (!ticker || !shares || !purchase_price) {
    return res.status(400).json({ error: 'Ticker, shares, and purchase price are required' });
  }
  const result = db.prepare(
    `INSERT INTO stocks (ticker, name, shares, purchase_price, current_price, purchase_date, account_type, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ticker.toUpperCase(), name || null, shares, purchase_price,
    current_price || null, purchase_date || null,
    account_type || 'brokerage', notes || null
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/stocks/:id', (req, res) => {
  const { ticker, name, shares, purchase_price, current_price, purchase_date, account_type, notes } = req.body;
  db.prepare(
    `UPDATE stocks SET ticker=?, name=?, shares=?, purchase_price=?, current_price=?,
     purchase_date=?, account_type=?, notes=?, last_updated=datetime('now') WHERE id=?`
  ).run(ticker.toUpperCase(), name || null, shares, purchase_price, current_price || null,
    purchase_date || null, account_type, notes || null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/stocks/:id', (req, res) => {
  db.prepare('DELETE FROM stocks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Update current price only (quick price refresh)
router.patch('/stocks/:id/price', (req, res) => {
  const { current_price } = req.body;
  db.prepare("UPDATE stocks SET current_price=?, last_updated=datetime('now') WHERE id=?")
    .run(current_price, req.params.id);
  res.json({ message: 'Price updated' });
});

// ─── Retirement Accounts ──────────────────────────────────────────────────────

router.get('/retirement', (req, res) => {
  const accounts = db.prepare('SELECT * FROM retirement_accounts ORDER BY account_type').all();
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalContributions = accounts.reduce((s, a) => s + a.contribution_ytd, 0);
  const totalMatch = accounts.reduce((s, a) => s + a.employer_match_ytd, 0);
  res.json({ items: accounts, totalBalance, totalContributions, totalMatch });
});

router.post('/retirement', (req, res) => {
  const { account_type, institution, balance, contribution_ytd, employer_match_ytd, contribution_limit, notes } = req.body;
  if (!account_type || balance === undefined) {
    return res.status(400).json({ error: 'Account type and balance are required' });
  }
  const result = db.prepare(
    `INSERT INTO retirement_accounts (account_type, institution, balance, contribution_ytd, employer_match_ytd, contribution_limit, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(account_type, institution || null, balance, contribution_ytd || 0,
    employer_match_ytd || 0, contribution_limit || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/retirement/:id', (req, res) => {
  const { account_type, institution, balance, contribution_ytd, employer_match_ytd, contribution_limit, notes } = req.body;
  db.prepare(
    `UPDATE retirement_accounts SET account_type=?, institution=?, balance=?, contribution_ytd=?,
     employer_match_ytd=?, contribution_limit=?, notes=?, last_updated=datetime('now') WHERE id=?`
  ).run(account_type, institution || null, balance, contribution_ytd || 0,
    employer_match_ytd || 0, contribution_limit || null, notes || null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/retirement/:id', (req, res) => {
  db.prepare('DELETE FROM retirement_accounts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── HSA / FSA ────────────────────────────────────────────────────────────────

router.get('/hsa-fsa', (req, res) => {
  const accounts = db.prepare('SELECT * FROM health_savings_accounts ORDER BY account_type').all();
  const withTransactions = accounts.map(acct => {
    const txns = db.prepare(
      'SELECT * FROM health_savings_transactions WHERE account_id = ? ORDER BY date DESC LIMIT 20'
    ).all(acct.id);
    return { ...acct, transactions: txns };
  });
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  res.json({ items: withTransactions, totalBalance });
});

router.post('/hsa-fsa', (req, res) => {
  const { account_type, institution, balance, contribution_ytd, contribution_limit, notes } = req.body;
  if (!account_type) return res.status(400).json({ error: 'Account type required' });
  const result = db.prepare(
    `INSERT INTO health_savings_accounts (account_type, institution, balance, contribution_ytd, contribution_limit, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(account_type, institution || null, balance || 0,
    contribution_ytd || 0, contribution_limit || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/hsa-fsa/:id', (req, res) => {
  const { account_type, institution, balance, contribution_ytd, contribution_limit, notes } = req.body;
  db.prepare(
    `UPDATE health_savings_accounts SET account_type=?, institution=?, balance=?, contribution_ytd=?,
     contribution_limit=?, notes=?, last_updated=datetime('now') WHERE id=?`
  ).run(account_type, institution || null, balance, contribution_ytd || 0,
    contribution_limit || null, notes || null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/hsa-fsa/:id', (req, res) => {
  db.prepare('DELETE FROM health_savings_transactions WHERE account_id = ?').run(req.params.id);
  db.prepare('DELETE FROM health_savings_accounts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// HSA/FSA transactions
router.post('/hsa-fsa/:id/transactions', (req, res) => {
  const { amount, date, description, category } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'Amount and date required' });
  const result = db.prepare(
    'INSERT INTO health_savings_transactions (account_id, amount, date, description, category) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, amount, date, description || null, category || 'Medical');
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/hsa-fsa/transactions/:txnId', (req, res) => {
  db.prepare('DELETE FROM health_savings_transactions WHERE id = ?').run(req.params.txnId);
  res.json({ message: 'Deleted' });
});

// ─── Portfolio summary for net worth ─────────────────────────────────────────

router.get('/summary', (req, res) => {
  const stocks = db.prepare('SELECT * FROM stocks').all();
  const retirement = db.prepare('SELECT * FROM retirement_accounts').all();
  const hsaFsa = db.prepare('SELECT * FROM health_savings_accounts').all();
  const mortgage = db.prepare('SELECT remaining_balance FROM mortgage LIMIT 1').get();
  const debts = db.prepare('SELECT SUM(current_balance) as total FROM debts WHERE is_active=1').get();

  const stockValue = stocks.reduce((s, st) => s + st.shares * (st.current_price || st.purchase_price), 0);
  const retirementBalance = retirement.reduce((s, a) => s + a.balance, 0);
  const hsaBalance = hsaFsa.reduce((s, a) => s + a.balance, 0);
  const totalAssets = stockValue + retirementBalance + hsaBalance;
  const totalLiabilities = (mortgage?.remaining_balance || 0) + (debts?.total || 0);

  res.json({
    stockValue,
    retirementBalance,
    hsaBalance,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  });
});

module.exports = router;
