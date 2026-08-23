const express = require('express');
const router = express.Router();
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

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

// ─── Transaction classification ──────────────────────────────────────────────

function classifyTransaction(t) {
  const primary = (t.personal_finance_category?.primary || '').toUpperCase();
  const detailed = (t.personal_finance_category?.detailed || '').toUpperCase();
  const name = (t.merchant_name || t.name || '').toUpperCase();

  // Internal money movements — store in expenses with is_transfer=1 so they are
  // preserved for history but excluded from spending totals
  if (primary === 'TRANSFER_OUT' || primary === 'TRANSFER_IN') {
    return { module: 'expense', isTransfer: true, category: 'Transfer' };
  }
  // Credit card payments, student loan payments, etc.
  if (primary === 'LOAN_PAYMENTS') {
    return { module: 'expense', isTransfer: true, category: 'Transfer' };
  }

  // Plaid: negative amount = money entering the account (income/credit)
  if (t.amount < 0) {
    return { module: 'income', isTransfer: false, category: mapIncomeCategory(detailed) };
  }

  // Positive amount = money leaving the account (expense)
  return { module: 'expense', isTransfer: false, category: mapExpenseCategory(primary, detailed, name) };
}

function mapIncomeCategory(detailed) {
  if (detailed.includes('WAGES') || detailed.includes('SALARY')) return 'Wages';
  if (detailed.includes('DIVIDEND')) return 'Dividends';
  if (detailed.includes('INTEREST')) return 'Interest';
  if (detailed.includes('TAX_REFUND') || detailed.includes('TAX REFUND')) return 'Tax Refund';
  return 'Income';
}

function mapExpenseCategory(primary, detailed, name) {
  switch (primary) {
    case 'FOOD_AND_DRINK':
      if (detailed.includes('GROCERY') || detailed.includes('SUPERMARKET')) return 'Groceries';
      return 'Food';
    case 'GENERAL_MERCHANDISE':
      if (
        detailed.includes('SUPERSTORE') ||
        name.includes('WALMART') || name.includes('COSTCO') || name.includes('TARGET')
      ) return 'Groceries';
      return 'Shopping';
    case 'GROCERIES': return 'Groceries';
    case 'TRAVEL':
    case 'TRANSPORTATION': return 'Transport';
    case 'MEDICAL':
    case 'HEALTHCARE':
    case 'PERSONAL_CARE': return 'Health';
    case 'ENTERTAINMENT': return 'Entertainment';
    case 'EDUCATION': return 'Education';
    case 'RENT_AND_UTILITIES':
      return detailed.includes('RENT') ? 'Utilities' : 'Utilities';
    case 'HOME_IMPROVEMENT': return 'Home Maintenance';
    case 'SHOPPING': return 'Shopping';
    case 'UTILITIES': return 'Utilities';
    case 'BANK_FEES':
    case 'GOVERNMENT_AND_NON_PROFIT':
    case 'GENERAL_SERVICES':
    default: return 'Miscellaneous';
  }
}

// ─── Balance refresh ─────────────────────────────────────────────────────────

async function refreshAccountBalances(client, item) {
  try {
    const resp = await client.accountsGet({ access_token: item.access_token });
    const updateBalance = db.prepare(`
      UPDATE plaid_accounts
      SET balance_available = ?, balance_current = ?, balance_limit = ?,
          balance_last_updated = datetime('now')
      WHERE account_id = ?
    `);
    const updateMany = db.transaction((accounts) => {
      for (const acct of accounts) {
        updateBalance.run(
          acct.balances.available,
          acct.balances.current,
          acct.balances.limit,
          acct.account_id
        );
      }
    });
    updateMany(resp.data.accounts);
  } catch (err) {
    console.error(`[plaid] balance refresh failed for ${item.institution_name}:`, err.message);
  }
}

// ─── Core sync function ──────────────────────────────────────────────────────

async function syncItem(client, item, trigger) {
  const startTime = Date.now();
  let totalAdded = 0, totalModified = 0, totalRemoved = 0;
  let syncError = null;

  try {
    const cursorRow = db.prepare('SELECT cursor FROM plaid_sync_cursor WHERE item_id = ?').get(item.item_id);
    let cursor = cursorRow?.cursor || undefined;
    let hasMore = true;

    const insertExpense = db.prepare(`
      INSERT OR IGNORE INTO expenses
        (amount, category, date, description, merchant_name, payment_method,
         source, plaid_transaction_id, is_transfer, original_plaid_category)
      VALUES (?, ?, ?, ?, ?, ?, 'plaid', ?, ?, ?)
    `);
    const insertIncome = db.prepare(`
      INSERT OR IGNORE INTO income
        (amount, source, date, notes, is_recurring, plaid_transaction_id, original_plaid_category)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    // Preserve user's category choice (user_category_override=1) on modified events
    const updateExpense = db.prepare(`
      UPDATE expenses
      SET amount = ?, date = ?, description = ?, merchant_name = ?,
          category = CASE WHEN user_category_override = 1 THEN category ELSE ? END
      WHERE plaid_transaction_id = ?
    `);
    const updateIncome = db.prepare(`
      UPDATE income SET amount = ?, date = ?, notes = ?
      WHERE plaid_transaction_id = ?
    `);
    const deleteByPlaidId = db.prepare(`
      DELETE FROM expenses WHERE plaid_transaction_id = ?
    `);
    const deleteIncomeByPlaidId = db.prepare(`
      DELETE FROM income WHERE plaid_transaction_id = ?
    `);

    while (hasMore) {
      const response = await client.transactionsSync({
        access_token: item.access_token,
        cursor,
      });
      const { added, modified, removed, next_cursor, has_more } = response.data;

      const processBatch = db.transaction(() => {
        for (const t of added) {
          if (t.pending) continue;
          const amt = Math.abs(t.amount);
          if (!amt) continue;

          const { module, isTransfer, category } = classifyTransaction(t);
          const desc = t.name || '';
          const merchant = t.merchant_name || null;
          const plaidPrimary = t.personal_finance_category?.primary || '';

          if (module === 'income') {
            insertIncome.run(amt, item.institution_name, t.date, desc, t.transaction_id, plaidPrimary);
          } else {
            insertExpense.run(amt, category, t.date, desc, merchant, item.institution_name, t.transaction_id, isTransfer ? 1 : 0, plaidPrimary);
          }
          totalAdded++;
        }

        for (const t of modified) {
          if (t.pending) continue;
          const amt = Math.abs(t.amount);
          const { module, category } = classifyTransaction(t);
          const desc = t.name || '';
          const merchant = t.merchant_name || null;

          if (module === 'income') {
            updateIncome.run(amt, t.date, desc, t.transaction_id);
          } else {
            updateExpense.run(amt, t.date, desc, merchant, category, t.transaction_id);
          }
          totalModified++;
        }

        for (const t of removed) {
          deleteByPlaidId.run(t.transaction_id);
          deleteIncomeByPlaidId.run(t.transaction_id);
          totalRemoved++;
        }
      });

      processBatch();
      cursor = next_cursor;
      hasMore = has_more;
    }

    db.prepare(`
      INSERT OR REPLACE INTO plaid_sync_cursor (item_id, cursor, last_synced)
      VALUES (?, ?, datetime('now'))
    `).run(item.item_id, cursor || '');

    db.prepare(`
      UPDATE plaid_items SET status = 'active', error_code = NULL, error_message = NULL
      WHERE item_id = ?
    `).run(item.item_id);

    await refreshAccountBalances(client, item);

    console.log(`[plaid sync] ${item.institution_name}: +${totalAdded} added, ~${totalModified} modified, -${totalRemoved} removed`);
  } catch (err) {
    const errorCode = err.response?.data?.error_code;
    const errorMsg = err.response?.data?.error_message || err.message;

    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
      db.prepare(`
        UPDATE plaid_items SET status = 'reauth_required', error_code = ?, error_message = ?
        WHERE item_id = ?
      `).run(errorCode, errorMsg, item.item_id);
      console.error(`[plaid sync] ${item.institution_name}: re-authentication required`);
    } else {
      db.prepare(`
        UPDATE plaid_items SET status = 'error', error_code = ?, error_message = ?
        WHERE item_id = ?
      `).run(errorCode || 'UNKNOWN', errorMsg, item.item_id);
      console.error(`[plaid sync] ${item.institution_name}:`, errorMsg);
    }
    syncError = errorMsg;
  }

  db.prepare(`
    INSERT INTO plaid_sync_log
      (item_id, trigger, transactions_added, transactions_modified, transactions_removed, errors, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.item_id, trigger, totalAdded, totalModified, totalRemoved, syncError, Date.now() - startTime);

  return { added: totalAdded, modified: totalModified, removed: totalRemoved, error: syncError };
}

// ─── POST /api/plaid/webhook (no auth — called directly by Plaid) ────────────

router.post('/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id, error } = req.body;
  res.json({ received: true }); // Respond immediately; Plaid requires <10s

  try {
    if (webhook_type === 'TRANSACTIONS') {
      if (webhook_code === 'SYNC_UPDATES_AVAILABLE' || webhook_code === 'DEFAULT_UPDATE') {
        const item = db.prepare("SELECT * FROM plaid_items WHERE item_id = ? AND status != 'reauth_required'").get(item_id);
        if (item) {
          const client = getPlaidClient();
          await syncItem(client, item, 'webhook').catch(err =>
            console.error('[webhook sync]', item.institution_name, err.message)
          );
        }
      }
    } else if (webhook_type === 'ITEM') {
      if (webhook_code === 'ERROR' && error?.error_code === 'ITEM_LOGIN_REQUIRED') {
        db.prepare(`
          UPDATE plaid_items SET status = 'reauth_required', error_code = ?, error_message = ?
          WHERE item_id = ?
        `).run(error.error_code, error.error_message || 'Login required', item_id);
        console.log('[webhook] reauth required for item:', item_id);
      }
    }
  } catch (err) {
    console.error('[webhook]', err.message);
  }
});

// ─── Auth middleware for all routes below ────────────────────────────────────

router.use(authenticate);

// ─── POST /api/plaid/create-link-token ──────────────────────────────────────

router.post('/create-link-token', async (req, res) => {
  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'financeme-user-1' },
      client_name: 'FinanceMe',
      products: [Products.Transactions],
      additional_consented_products: [Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
      transactions: { days_requested: 730 },
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

    db.prepare(`
      INSERT OR REPLACE INTO plaid_items (access_token, item_id, institution_id, institution_name, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(access_token, item_id, institution?.institution_id || '', institution?.name || 'Unknown Bank');

    const insertAccount = db.prepare(`
      INSERT OR REPLACE INTO plaid_accounts
        (item_id, account_id, name, official_name, type, subtype, mask,
         balance_available, balance_current, balance_limit, balance_last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const acct of accounts) {
      insertAccount.run(
        item_id, acct.account_id, acct.name, acct.official_name || '',
        acct.type, acct.subtype || '', acct.mask || '',
        acct.balances.available, acct.balances.current, acct.balances.limit
      );
    }

    res.json({ success: true, institution: institution?.name || 'Bank', accounts: accounts.length });
  } catch (err) {
    console.error('Plaid exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// ─── GET /api/plaid/accounts ─────────────────────────────────────────────────

router.get('/accounts', (req, res) => {
  const items = db.prepare(
    'SELECT id, item_id, institution_id, institution_name, status, error_code, error_message, created_at FROM plaid_items ORDER BY created_at DESC'
  ).all();
  const getAccounts = db.prepare('SELECT * FROM plaid_accounts WHERE item_id = ?');
  const getCursor = db.prepare('SELECT last_synced FROM plaid_sync_cursor WHERE item_id = ?');

  const result = items.map(item => ({
    ...item,
    accounts: getAccounts.all(item.item_id),
    last_synced: getCursor.get(item.item_id)?.last_synced || null,
  }));

  res.json(result);
});

// ─── GET /api/plaid/balances ─────────────────────────────────────────────────

router.get('/balances', (req, res) => {
  const items = db.prepare(
    'SELECT item_id, institution_name, status, error_message FROM plaid_items ORDER BY created_at DESC'
  ).all();
  const getAccounts = db.prepare(`
    SELECT account_id, name, type, subtype, mask,
           balance_available, balance_current, balance_limit, balance_last_updated
    FROM plaid_accounts WHERE item_id = ?
  `);
  const getCursor = db.prepare('SELECT last_synced FROM plaid_sync_cursor WHERE item_id = ?');

  const result = items.map(item => ({
    item_id: item.item_id,
    institution_name: item.institution_name,
    status: item.status || 'active',
    error_message: item.error_message,
    last_synced: getCursor.get(item.item_id)?.last_synced || null,
    accounts: getAccounts.all(item.item_id),
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

  const client = getPlaidClient();
  const results = [];

  for (const item of items) {
    if (!item) continue;
    const result = await syncItem(client, item, 'manual');
    results.push({ institution: item.institution_name, ...result });
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalModified = results.reduce((s, r) => s + r.modified, 0);
  const totalRemoved = results.reduce((s, r) => s + r.removed, 0);
  const errors = results.filter(r => r.error).map(r => `${r.institution}: ${r.error}`);

  res.json({ added: totalAdded, modified: totalModified, removed: totalRemoved, errors });
});

// ─── POST /api/plaid/reauth/:item_id ─────────────────────────────────────────

router.post('/reauth/:item_id', async (req, res) => {
  const item = db.prepare('SELECT * FROM plaid_items WHERE item_id = ?').get(req.params.item_id);
  if (!item) return res.status(404).json({ error: 'Account not found' });

  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'financeme-user-1' },
      client_name: 'FinanceMe',
      access_token: item.access_token,
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Plaid reauth error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
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

// ─── Exported helper for scheduled / login-triggered sync ────────────────────

async function syncAllActiveItems(trigger = 'scheduled') {
  const items = db.prepare("SELECT * FROM plaid_items WHERE status != 'reauth_required'").all();
  if (!items.length) return;
  try {
    const client = getPlaidClient();
    for (const item of items) {
      await syncItem(client, item, trigger).catch(err =>
        console.error(`[sync:${trigger}] ${item.institution_name}:`, err.message)
      );
    }
    console.log(`[sync:${trigger}] completed for ${items.length} item(s)`);
  } catch (err) {
    console.error(`[sync:${trigger}] client error:`, err.message);
  }
}

module.exports = router;
module.exports.syncAllActiveItems = syncAllActiveItems;
