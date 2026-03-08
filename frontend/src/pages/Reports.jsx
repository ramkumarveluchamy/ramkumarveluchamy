import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { Download, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import api from '../api/client';
import { format, subMonths, addMonths } from 'date-fns';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#f43f5e'];

function StatCard({ title, value, sub, color = 'text-gray-900' }) {
  return (
    <div className="card">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Reports() {
  const [view, setView] = useState('monthly'); // monthly | ytd
  const [date, setDate] = useState(new Date());
  const [monthly, setMonthly] = useState(null);
  const [ytd, setYtd] = useState(null);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  useEffect(() => {
    setLoading(true);
    if (view === 'monthly') {
      api.get(`/reports/monthly?month=${month}&year=${year}`)
        .then(r => setMonthly(r.data))
        .finally(() => setLoading(false));
    } else {
      api.get(`/reports/ytd?year=${year}`)
        .then(r => setYtd(r.data))
        .finally(() => setLoading(false));
    }
  }, [view, month, year]);

  const handleExport = () => {
    window.open(`/api/reports/export?month=${month}&year=${year}`, '_blank');
  };

  const ytdChartData = ytd?.monthlyData.map(m => ({
    name: MONTH_NAMES[m.month - 1],
    Income: m.income,
    Expenses: m.expenses,
    Savings: m.savings,
  })) || [];

  const pieData = monthly?.expensesByCategory.filter(c => c.total > 0).map(c => ({
    name: c.category, value: parseFloat(c.total.toFixed(2))
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Reports</h1>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {['monthly', 'ytd'].map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === v ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'
            }`}
          >
            {v === 'monthly' ? 'Monthly' : 'Year-to-Date'}
          </button>
        ))}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        {view === 'monthly' ? (
          <>
            <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="font-medium">{format(date, 'MMMM yyyy')}</span>
            <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
          </>
        ) : (
          <>
            <button onClick={() => setDate(d => new Date(d.getFullYear() - 1, d.getMonth()))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="font-medium">{year}</span>
            <button onClick={() => setDate(d => new Date(d.getFullYear() + 1, d.getMonth()))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : view === 'monthly' && monthly ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Income" value={`$${monthly.income.toFixed(2)}`} color="text-green-600" />
            <StatCard title="Total Expenses" value={`$${monthly.totalExpenses.toFixed(2)}`} color="text-red-600" />
            <StatCard title="Net Savings" value={`$${monthly.savings.toFixed(2)}`}
              color={monthly.savings >= 0 ? 'text-blue-600' : 'text-red-600'}
              sub={`${monthly.savingsRate}% savings rate`} />
            <div className="card">
              <div className="text-sm text-gray-500 mb-2">Expense Breakdown</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Regular</span><span>${monthly.expenseBreakdown.regularExpenses.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Groceries</span><span>${monthly.expenseBreakdown.groceries.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Bills</span><span>${monthly.expenseBreakdown.bills.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Education</span><span>${monthly.expenseBreakdown.education.toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          {/* Income by source */}
          {monthly.incomeBySource.length > 0 && (
            <div className="card">
              <h3 className="section-title">Income by Source</h3>
              <div className="space-y-3">
                {monthly.incomeBySource.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-medium">{s.source}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${s.total.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">
                        {monthly.income > 0 ? ((s.total / monthly.income) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense by category chart + pie */}
          {pieData.length > 0 && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="section-title">Expenses by Category</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pieData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={v => `$${v.toFixed(2)}`} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h3 className="section-title">Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => `$${v.toFixed(2)}`} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : ytd ? (
        <div className="space-y-6">
          {/* YTD Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="YTD Income" value={`$${ytd.totals.income.toFixed(2)}`} color="text-green-600" />
            <StatCard title="YTD Expenses" value={`$${ytd.totals.expenses.toFixed(2)}`} color="text-red-600" />
            <StatCard title="YTD Savings" value={`$${ytd.totals.savings.toFixed(2)}`}
              color={ytd.totals.savings >= 0 ? 'text-blue-600' : 'text-red-600'}
              sub={`${ytd.totals.savingsRate}% savings rate`} />
            <StatCard title="Avg Monthly Savings"
              value={`$${(ytd.totals.savings / 12).toFixed(2)}`}
              color="text-purple-600" />
          </div>

          {/* Monthly trend chart */}
          <div className="card">
            <h3 className="section-title">Monthly Trend — {year}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ytdChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `$${v.toFixed(2)}`} />
                <Legend />
                <Bar dataKey="Income" fill="#16a34a" radius={[4,4,0,0]} />
                <Bar dataKey="Expenses" fill="#dc2626" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Savings trend */}
          <div className="card">
            <h3 className="section-title">Monthly Savings Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ytdChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `$${v.toFixed(2)}`} />
                <Line type="monotone" dataKey="Savings" stroke="#2563eb" strokeWidth={2}
                  dot={{ fill: '#2563eb', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
