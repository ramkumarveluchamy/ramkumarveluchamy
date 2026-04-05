const express = require('express');
const router = express.Router();
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Plaid client ────────────────────────────────────────────────────────────

function getPlaidClient() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in .env');
  }
  const env = process.env.PLAID_ENV || 'sandbox';
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(configuration);
}

// ─── Category mapping ────────────────────────────────────────────────────────

function mapPlaidCategory(primary) {
  if (!primary) return 'Miscellaneous';
  const map = {
    FOOD_AND_DRINK: 'Food',
    GROCERIES: 'Groceries',
    TRAVEL: 'Transport',
    TRANSPORTATION: 'Transport',
    SHOPPING: 'Shopping',
    ENTERTAINMENT: 'Entertainment',
    MEDICAL: 'Health',
    HEALTHCARE: 'Health',
    UTILITIES: 'Utilities',
    EDUCATION: 'Education',
    INCOME: 'Income',
    TRANSFER_IN: 'Income',
    RENT_AND_UTILITIES: 'Utilities',
    HOME_IMPROVEMENT: 'Miscellaneous',
    PERSONAL_CARE: 'Health',
    GENERAL_MERCHANDISE: 'Shopping',
    GENERAL_SERVICES: 'Miscellaneous',
    GOVERNMENT_AND_NON_PROFIT: 'Miscellaneous',
  };
  return map[primary.toUpperCase().replace(/ /g, '_')] || 'Miscellaneous';
}

// ─── POST /api/plaid/create-link-token ──────────────────────────────────────

router.post('/create-link-token', async (req, res) => {
  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'financeme-user-1' },
      client_name: 'FinanceMe',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Plaid link-token error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Failed to create link token' });
  }
});

// ─── POST /api/plaid/exchange-token ─────────────────────────────────────────

router.post('/exchange-token', async (req, res) => {
  const { public_token, institution } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token required' });

  try {
    const client = getPlaidClient();
    const exchangeResp = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResp.data;

    const accountsResp = await client.accountsGet({ access_token });
    const accounts = accountsResp.data.accounts;

    // Upsert item
    db.prepare(`
      INSERT OR REPLACE INTO plaid_items (access_token, item_id, institution_id, institution_name)
      VALUES (?, ?, ?, ?)
    `).run(
      access_token,
      item_id,
      institution?.institution_id || '',
      institution?.name || 'Unknown Bank'
    );

    // Upsert accounts
    const insertAccount = db.prepare(`
      INSERT OR REPLACE INTO plaid_accounts (item_id, account_id, name, official_name, type, subtype, mask)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const acct of accounts) {
      insertAccount.run(
        item_id,
        acct.account_id,
        acct.name,
        acct.official_name || '',
        acct.type,
        acct.subtype || '',
        acct.mask || ''
      );
    }

    res.json({
      success: true,
      institution: institution?.name || 'Bank',
      accounts: accounts.length,
    });
  } catch (err) {
    console.error('Plaid exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// ─── GET /api/plaid/accounts ─────────────────────────────────────────────────

router.get('/accounts', (req, res) => {
  const items = db.prepare('SELECT id, item_id, institution_id, institution_name, created_at FROM plaid_items ORDER BY created_at DESC').all();
  const getAccounts = db.prepare('SELECT * FROM plaid_accounts WHERE item_id = ?');
  const getCursor = db.prepare('SELECT last_synced FROM plaid_sync_cursor WHERE item_id = ?');

  const result = items.map(item => ({
    ...item,
    accounts: getAccounts.all(item.item_id),
    last_synced: getCursor.get(item.item_id)?.last_synced || null,
  }));

  res.json(result);
});

// ─── POST /api/plaid/sync ────────────────────────────────────────────────────

router.post('/sync', async (req, res) => {
  const { item_id } = req.body;

  const items = item_id
    ? [db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(item_id)]
    : db.prepare('SELECT * FROM plaid_items').all();

  if (!items.length || !items[0]) {
    return res.status(404).json({ error: 'No connected accounts found. Connect a bank first.' });
  }

  const insertExpense = db.prepare(
    'INSERT INTO expenses (amount, category, date, description, payment_method) VALUES (?, ?, ?, ?, ?)'
  );
  const insertIncome = db.prepare(
    'INSERT INTO income (amount, source, date, notes, is_recurring) VALUES (?, ?, ?, ?, 0)'
  );

  let totalAdded = 0;
  const errors = [];
  const client = getPlaidClient();

  for (const item of items) {
    if (!item) continue;
    try {
      const cursorRow = db.prepare('SELECT cursor FROM plaid_sync_cursor WHERE item_id = ?').get(item.item_id);
      let cursor = cursorRow?.cursor || undefined;
      let hasMore = true;
      let added = 0;

      while (hasMore) {
        const response = await client.transactionsSync({
          access_token: item.access_token,
          cursor,
        });
        const { added: newTxns, next_cursor, has_more } = response.data;

        const insertMany = db.transaction((txns) => {
          for (const t of txns) {
            if (t.pending) continue;
            const amt = Math.abs(t.amount);
            if (!amt) continue;
            const desc = t.merchant_name || t.name || '';
            const date = t.date;
            const category = mapPlaidCategory(t.personal_finance_category?.primary || t.category?.[0] || '');

            // Plaid: positive amount = money leaving account (expense)
            //        negative amount = money entering account (income/refund)
            if (t.amount > 0) {
              insertExpense.run(amt, category, date, desc, item.institution_name);
            } else {
              insertIncome.run(amt, item.institution_name, date, desc);
            }
            added++;
          }
        });

        insertMany(newTxns);
        cursor = next_cursor;
        hasMore = has_more;
      }

      db.prepare(`
        INSERT OR REPLACE INTO plaid_sync_cursor (item_id, cursor, last_synced)
        VALUES (?, ?, datetime('now'))
      `).run(item.item_id, cursor || '');

      totalAdded += added;
      console.log(`[plaid sync] ${item.institution_name}: +${added} transactions`);
    } catch (err) {
      const msg = err.response?.data?.error_message || err.message;
      console.error(`[plaid sync] ${item.institution_name} error:`, msg);
      errors.push(`${item.institution_name}: ${msg}`);
    }
  }

  res.json({ added: totalAdded, errors });
});

// ─── DELETE /api/plaid/accounts/:item_id ─────────────────────────────────────

router.delete('/accounts/:item_id', async (req, res) => {
  const { item_id } = req.params;
  const item = db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Account not found' });

  try {
    const client = getPlaidClient();
    await client.itemRemove({ access_token: item.access_token }).catch(() => {});
  } catch {}

  db.prepare('DELETE FROM plaid_items WHERE item_id = ?').run(item_id);
  res.json({ success: true });
});

module.exports = router;
