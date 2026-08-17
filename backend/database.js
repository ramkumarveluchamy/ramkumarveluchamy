const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'finance.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      source TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      is_recurring INTEGER DEFAULT 0,
      frequency TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      payment_method TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER NOT NULL,
      category TEXT NOT NULL,
      is_autopay INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      paid_on TEXT,
      status TEXT DEFAULT 'unpaid',
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mortgage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal REAL NOT NULL,
      rate REAL NOT NULL,
      monthly_payment REAL NOT NULL,
      start_date TEXT NOT NULL,
      remaining_balance REAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS home_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      UNIQUE(type, month, year)
    );

    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dob TEXT
    );

    CREATE TABLE IF NOT EXISTS education_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      UNIQUE(category, month, year)
    );

    CREATE TABLE IF NOT EXISTS groceries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      store TEXT,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lawn maintenance (separate from home repairs)
    CREATE TABLE IF NOT EXISTS lawn_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      service_type TEXT NOT NULL,
      provider TEXT,
      cost REAL NOT NULL,
      notes TEXT,
      is_recurring INTEGER DEFAULT 0,
      frequency TEXT
    );

    -- Stock / brokerage holdings (manual entry)
    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      name TEXT,
      shares REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price REAL,
      purchase_date TEXT,
      account_type TEXT DEFAULT 'brokerage',
      notes TEXT,
      last_updated TEXT DEFAULT (datetime('now'))
    );

    -- Retirement accounts: 401k, Roth IRA, Traditional IRA, 403b, pension
    CREATE TABLE IF NOT EXISTS retirement_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      institution TEXT,
      balance REAL NOT NULL DEFAULT 0,
      contribution_ytd REAL DEFAULT 0,
      employer_match_ytd REAL DEFAULT 0,
      contribution_limit REAL,
      notes TEXT,
      last_updated TEXT DEFAULT (datetime('now'))
    );

    -- HSA / FSA accounts
    CREATE TABLE IF NOT EXISTS health_savings_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      institution TEXT,
      balance REAL NOT NULL DEFAULT 0,
      contribution_ytd REAL DEFAULT 0,
      contribution_limit REAL,
      notes TEXT,
      last_updated TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS health_savings_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Medical',
      FOREIGN KEY (account_id) REFERENCES health_savings_accounts(id) ON DELETE CASCADE
    );

    -- Debt tracking (credit cards, student loans, auto, personal, medical, etc.)
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      debt_type TEXT NOT NULL,
      original_amount REAL NOT NULL,
      current_balance REAL NOT NULL,
      interest_rate REAL DEFAULT 0,
      minimum_payment REAL DEFAULT 0,
      due_day INTEGER,
      institution TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );

    -- Plaid connected bank accounts
    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT NOT NULL,
      item_id TEXT NOT NULL UNIQUE,
      institution_id TEXT,
      institution_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plaid_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      account_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      official_name TEXT,
      type TEXT,
      subtype TEXT,
      mask TEXT,
      FOREIGN KEY (item_id) REFERENCES plaid_items(item_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plaid_sync_cursor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL UNIQUE,
      cursor TEXT,
      last_synced TEXT,
      FOREIGN KEY (item_id) REFERENCES plaid_items(item_id) ON DELETE CASCADE
    );
  `);

  // Migrate home_maintenance columns
  const hmCols = db.prepare('PRAGMA table_info(home_maintenance)').all().map(c => c.name);
  if (!hmCols.includes('category')) {
    db.exec("ALTER TABLE home_maintenance ADD COLUMN category TEXT DEFAULT 'General'");
  }
  if (!hmCols.includes('urgency')) {
    db.exec("ALTER TABLE home_maintenance ADD COLUMN urgency TEXT DEFAULT 'routine'");
  }

  // Migrate expenses — add Plaid deduplication and source tracking columns
  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
  if (!expenseCols.includes('plaid_transaction_id')) {
    db.exec("ALTER TABLE expenses ADD COLUMN plaid_transaction_id TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_plaid_txn ON expenses(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL");
  }
  if (!expenseCols.includes('source')) {
    db.exec("ALTER TABLE expenses ADD COLUMN source TEXT DEFAULT 'manual'");
  }
  if (!expenseCols.includes('is_transfer')) {
    db.exec("ALTER TABLE expenses ADD COLUMN is_transfer INTEGER DEFAULT 0");
  }
  if (!expenseCols.includes('merchant_name')) {
    db.exec("ALTER TABLE expenses ADD COLUMN merchant_name TEXT");
  }
  if (!expenseCols.includes('user_category_override')) {
    db.exec("ALTER TABLE expenses ADD COLUMN user_category_override INTEGER DEFAULT 0");
  }
  if (!expenseCols.includes('original_plaid_category')) {
    db.exec("ALTER TABLE expenses ADD COLUMN original_plaid_category TEXT");
  }

  // Migrate income — same deduplication columns
  const incomeCols = db.prepare('PRAGMA table_info(income)').all().map(c => c.name);
  if (!incomeCols.includes('plaid_transaction_id')) {
    db.exec("ALTER TABLE income ADD COLUMN plaid_transaction_id TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_income_plaid_txn ON income(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL");
  }
  if (!incomeCols.includes('source')) {
    db.exec("ALTER TABLE income ADD COLUMN source TEXT DEFAULT 'manual'");
  }
  if (!incomeCols.includes('user_category_override')) {
    db.exec("ALTER TABLE income ADD COLUMN user_category_override INTEGER DEFAULT 0");
  }
  if (!incomeCols.includes('original_plaid_category')) {
    db.exec("ALTER TABLE income ADD COLUMN original_plaid_category TEXT");
  }

  // Migrate plaid_items — add connection status tracking
  const plaidItemCols = db.prepare('PRAGMA table_info(plaid_items)').all().map(c => c.name);
  if (!plaidItemCols.includes('status')) {
    db.exec("ALTER TABLE plaid_items ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!plaidItemCols.includes('error_code')) {
    db.exec("ALTER TABLE plaid_items ADD COLUMN error_code TEXT");
  }
  if (!plaidItemCols.includes('error_message')) {
    db.exec("ALTER TABLE plaid_items ADD COLUMN error_message TEXT");
  }

  // Migrate plaid_accounts — add live balance columns
  const plaidAcctCols = db.prepare('PRAGMA table_info(plaid_accounts)').all().map(c => c.name);
  if (!plaidAcctCols.includes('balance_available')) {
    db.exec("ALTER TABLE plaid_accounts ADD COLUMN balance_available REAL");
  }
  if (!plaidAcctCols.includes('balance_current')) {
    db.exec("ALTER TABLE plaid_accounts ADD COLUMN balance_current REAL");
  }
  if (!plaidAcctCols.includes('balance_limit')) {
    db.exec("ALTER TABLE plaid_accounts ADD COLUMN balance_limit REAL");
  }
  if (!plaidAcctCols.includes('balance_last_updated')) {
    db.exec("ALTER TABLE plaid_accounts ADD COLUMN balance_last_updated TEXT");
  }

  // Sync history log
  db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      synced_at TEXT DEFAULT (datetime('now')),
      trigger TEXT DEFAULT 'manual',
      transactions_added INTEGER DEFAULT 0,
      transactions_modified INTEGER DEFAULT 0,
      transactions_removed INTEGER DEFAULT 0,
      errors TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (item_id) REFERENCES plaid_items(item_id) ON DELETE CASCADE
    )
  `);
}

initializeDatabase();

module.exports = db;
