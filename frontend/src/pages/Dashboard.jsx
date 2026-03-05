import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle, Plus, ChevronRight } from 'lucide-react';
import api from '../api/client';
import { format, subMonths, addMonths } from 'date-fns';

const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d'];

const CATEGORY_COLORS = {
  Food: '#f97316', Transport: '#3b82f6', Shopping: '#8b5cf6',
  Entertainment: '#ec4899', Health: '#10b981', Miscellaneous: '#6b7280',
  Groceries: '#84cc16', Education: '#f59e0b',
};

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
        {amount < 0 ? '-' : ''}${Math.abs(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [date, setDate] = useState(new Date());
  const [summary, setSummary] = useState(null);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/summary?month=${month}&year=${year}`),
      api.get('/dashboard/upcoming-bills'),
      api.get('/dashboard/recent-transactions?limit=8'),
    ]).then(([s, b, r]) => {
      setSummary(s.data);
      setUpcomingBills(b.data);
      setRecent(r.data);
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

      {/* Stats */}
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
        {/* Expense breakdown chart */}
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
