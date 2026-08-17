import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle,
  Plus, ChevronRight, Landmark, CreditCard, RefreshCw, AlertTriangle, Wallet,
} from 'lucide-react';
import api from '../api/client';
import { format, subMonths, addMonths, formatDistanceToNow } from 'date-fns';

const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d'];

const CATEGORY_COLORS = {
  Food: '#f97316', Transport: '#3b82f6', Shopping: '#8b5cf6',
  Entertainment: '#ec4899', Health: '#10b981', Miscellaneous: '#6b7280',
  Groceries: '#84cc16', Education: '#f59e0b', Utilities: '#0891b2',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeTime(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return null;
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

function MonthPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(subMonths(value, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">‹</button>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[110px] text-center">
        {format(value, 'MMMM yyyy')}
      </span>
      <button onClick={() => onChange(addMonths(value, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">›</button>
    </div>
  );
}

function StatCard({ title, amount, icon: Icon, color, subtitle }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className={`text-2xl font-bold ${amount < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
        {amount < 0 ? '-' : ''}${fmt(Math.abs(amount || 0))}
      </div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

function AccountCard({ account }) {
  const isCredit = account.type === 'credit';
  const isInvestment = account.type === 'investment';
  const balance = account.balance_current ?? 0;
  const limit = account.balance_limit;
  const utilization = isCredit && limit ? (balance / limit * 100) : null;

  const iconClass = isCredit
    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
    : isInvestment
      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600';

  const Icon = isCredit ? CreditCard : isInvestment ? Wallet : Landmark;

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate leading-tight">{account.name}</div>
          <div className="text-xs text-gray-400 truncate">{account.institution_name}{account.mask ? ` ••${account.mask}` : ''}</div>
        </div>
      </div>
      <div className={`text-base font-bold ${
        isCredit ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'
      }`}>
        ${fmt(balance)}
      </div>
      {isCredit && limit && (
        <div className="mt-1.5">
          <div className="h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                utilization > 80 ? 'bg-red-500' : utilization > 50 ? 'bg-yellow-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{utilization?.toFixed(0)}% of ${(limit).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
      )}
    </div>
  );
}

function AccountBalancesSection({ balances }) {
  if (!balances) return null;

  const allItems = balances;
  const reauthItems = allItems.filter(item => item.status === 'reauth_required');
  const activeItems = allItems.filter(item => item.status !== 'reauth_required');

  const allAccounts = activeItems.flatMap(inst =>
    inst.accounts.map(a => ({ ...a, institution_name: inst.institution_name }))
  );

  const lastSynced = allItems
    .map(i => i.last_synced)
    .filter(Boolean)
    .sort()
    .pop();

  const depositTotal = allAccounts
    .filter(a => a.type === 'depository')
    .reduce((s, a) => s + (a.balance_current || 0), 0);
  const creditTotal = allAccounts
    .filter(a => a.type === 'credit')
    .reduce((s, a) => s + (a.balance_current || 0), 0);
  const investmentTotal = allAccounts
    .filter(a => a.type === 'investment')
    .reduce((s, a) => s + (a.balance_current || 0), 0);

  if (allItems.length === 0) {
    return (
      <div className="card border border-dashed border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Connect Your Banks</div>
            <div className="text-xs text-gray-400 mt-0.5">Link accounts via Plaid for live balances and automatic transaction sync</div>
          </div>
          <Link to="/plaid" className="btn-primary text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            Connect
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="section-title mb-0">Live Balances</h2>
          {lastSynced && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <RefreshCw className="w-3 h-3" />
              {relativeTime(lastSynced)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reauthItems.length > 0 && (
            <Link to="/plaid" className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {reauthItems.length} bank{reauthItems.length > 1 ? 's' : ''} need reconnection
            </Link>
          )}
          <Link to="/plaid" className="text-xs text-blue-600 flex items-center gap-1">
            Manage <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {allAccounts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {allAccounts.map(acct => (
              <AccountCard key={acct.account_id} account={acct} />
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Cash & Savings</span>
              <span className="ml-2 font-semibold text-emerald-600">${fmt(depositTotal)}</span>
            </div>
            {creditTotal > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Credit Owed</span>
                <span className="ml-2 font-semibold text-orange-600">${fmt(creditTotal)}</span>
              </div>
            )}
            {investmentTotal > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Investments</span>
                <span className="ml-2 font-semibold text-purple-600">${fmt(investmentTotal)}</span>
              </div>
            )}
            <div className="ml-auto">
              <span className="text-gray-500 dark:text-gray-400">Net Position</span>
              <span className={`ml-2 font-semibold ${depositTotal + investmentTotal - creditTotal >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600'}`}>
                ${fmt(depositTotal + investmentTotal - creditTotal)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-400 text-center py-4">
          Sync your accounts to see live balances
        </div>
      )}

      {reauthItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-red-100 dark:border-red-900/30">
          {reauthItems.map(item => (
            <div key={item.item_id} className="flex items-center justify-between text-xs text-red-600 dark:text-red-400">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {item.institution_name} session expired — transactions not updating
              </span>
              <Link to="/plaid" className="font-medium underline underline-offset-2">Fix</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [date, setDate] = useState(new Date());
  const [summary, setSummary] = useState(null);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [recent, setRecent] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/summary?month=${month}&year=${year}`),
      api.get('/dashboard/upcoming-bills'),
      api.get('/dashboard/recent-transactions?limit=8'),
      api.get('/plaid/balances').catch(() => ({ data: [] })),
    ]).then(([s, b, r, bal]) => {
      setSummary(s.data);
      setUpcomingBills(b.data);
      setRecent(r.data);
      setBalances(bal.data);
    }).finally(() => setLoading(false));
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const pieData = (summary?.expensesByCategory || [])
    .filter(c => c.total > 0)
    .map(c => ({ name: c.category, value: parseFloat(c.total.toFixed(2)) }));

  const budgetBadge = {
    on_track: { label: 'On Track', class: 'badge-green', icon: CheckCircle },
    over_budget: { label: 'Over Budget', class: 'badge-red', icon: AlertCircle },
    no_budget: { label: 'No Budget Set', class: 'badge-gray', icon: AlertCircle },
  }[summary?.budgetHealth || 'no_budget'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-header">Dashboard</h1>
        <MonthPicker value={date} onChange={setDate} />
      </div>

      {/* Live account balances */}
      <AccountBalancesSection balances={balances} />

      {/* Monthly stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Income" amount={summary?.income} icon={TrendingUp}
          color="bg-green-100 dark:bg-green-900/30 text-green-600" />
        <StatCard title="Expenses" amount={summary?.expenses} icon={TrendingDown}
          color="bg-red-100 dark:bg-red-900/30 text-red-600" />
        <StatCard title="Net Savings" amount={summary?.savings} icon={DollarSign}
          color="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
          subtitle={`${summary?.savingsRate || 0}% savings rate`} />
        <div className="card flex flex-col gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Budget Health</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={budgetBadge.class}>
              {budgetBadge.label}
            </span>
          </div>
          {summary?.totalBudget > 0 && (
            <div className="text-xs text-gray-400">
              ${(summary?.expenses || 0).toFixed(0)} / ${summary?.totalBudget.toFixed(0)} budgeted
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Spending breakdown chart */}
        <div className="card">
          <h2 className="section-title">Spending Breakdown</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={v => [`$${v.toFixed(2)}`, '']} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No expenses recorded yet
            </div>
          )}
        </div>

        {/* Upcoming bills */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Upcoming Bills</h2>
            <Link to="/bills" className="text-xs text-blue-600 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {upcomingBills.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-8">No bills due in the next 7 days</div>
          ) : (
            <div className="space-y-3">
              {upcomingBills.map(bill => (
                <div key={bill.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white text-sm">{bill.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Due in {bill.daysUntilDue === 0 ? 'today' : `${bill.daysUntilDue} day${bill.daysUntilDue > 1 ? 's' : ''}`}
                      {bill.daysUntilDue <= 3 && <span className="ml-2 text-red-500 font-medium">⚠ Soon</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">${bill.amount.toFixed(2)}</div>
                    <span className={bill.status === 'paid' ? 'badge-green text-xs' : 'badge-yellow text-xs badge'}>
                      {bill.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Recent Transactions</h2>
          <div className="flex gap-2">
            <Link to="/income" className="text-xs text-blue-600 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Income
            </Link>
            <Link to="/expenses" className="text-xs text-blue-600 flex items-center gap-1 ml-3">
              <Plus className="w-3 h-3" /> Expense
            </Link>
          </div>
        </div>
        {recent.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-8">No transactions yet. Start by adding income or expenses.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recent.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                    ${t.type === 'income' ? 'bg-green-100 text-green-700 dark:bg-green-900/40' : 'bg-red-100 text-red-700 dark:bg-red-900/40'}`}>
                    {t.type === 'income' ? '+' : '-'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{t.description}</div>
                    <div className="text-xs text-gray-400">{t.date}</div>
                  </div>
                </div>
                <div className={`font-semibold text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
