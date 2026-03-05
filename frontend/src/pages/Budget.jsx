import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const ALL_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Miscellaneous', 'Groceries', 'Education', 'Utilities', 'Savings'];

function BudgetForm({ existing, onSave, onClose, month, year }) {
  const existingCats = existing.map(b => b.category);
  const available = ALL_CATEGORIES.filter(c => !existingCats.includes(c));

  const [form, setForm] = useState({ category: available[0] || ALL_CATEGORIES[0], monthly_limit: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, month, year }); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="label">Category</label>
        <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {ALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div><label className="label">Monthly Limit ($)</label>
        <input type="number" step="0.01" className="input" value={form.monthly_limit}
          onChange={e => setForm(f => ({ ...f, monthly_limit: e.target.value }))} placeholder="0.00" required /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Set Budget'}</button>
      </div>
    </form>
  );
}

export default function Budget() {
  const [date, setDate] = useState(new Date());
  const [budgets, setBudgets] = useState([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const load = () => {
    setLoading(true);
    api.get(`/budgets?month=${month}&year=${year}`)
      .then(r => setBudgets(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [month, year]);

  const handleSave = async (form) => {
    await api.post('/budgets', form);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this budget?')) return;
    await api.delete(`/budgets/${id}`);
    load();
  };

  const handleInlineEdit = async (id) => {
    if (!editValue) return;
    await api.put(`/budgets/${id}`, { monthly_limit: parseFloat(editValue) });
    setEditingId(null);
    load();
  };

  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalActual = budgets.reduce((s, b) => s + b.actual, 0);
  const overBudget = budgets.filter(b => b.isOver);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Budget Planner</h1>
        <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Set Budget
        </button>
      </div>

      {/* Month picker + overview */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
          <span className="font-medium text-gray-700 dark:text-gray-300">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <div className="text-gray-500">Total Budget</div>
            <div className="font-bold text-gray-900 dark:text-white">${totalBudget.toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Total Spent</div>
            <div className={`font-bold ${totalActual > totalBudget ? 'text-red-600' : 'text-green-600'}`}>${totalActual.toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Remaining</div>
            <div className={`font-bold ${totalBudget - totalActual < 0 ? 'text-red-600' : 'text-blue-600'}`}>
              ${(totalBudget - totalActual).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Over budget alerts */}
      {overBudget.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            Over budget in {overBudget.length} categor{overBudget.length > 1 ? 'ies' : 'y'}
          </div>
          <div className="flex flex-wrap gap-2">
            {overBudget.map(b => (
              <span key={b.id} className="badge-red">{b.category}: ${(b.actual - b.monthly_limit).toFixed(2)} over</span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : budgets.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 mb-4">No budgets set for this month. Set category budgets to track your spending.</p>
          <button onClick={() => setModal(true)} className="btn-primary">Set Your First Budget</button>
        </div>
      ) : (
        <div className="space-y-4">
          {budgets.map(budget => (
            <div key={budget.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{budget.category}</span>
                  {budget.isOver
                    ? <AlertTriangle className="w-4 h-4 text-red-500" />
                    : <CheckCircle className="w-4 h-4 text-green-500" />
                  }
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-right">
                    <span className={`font-semibold ${budget.isOver ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      ${budget.actual.toFixed(2)}
                    </span>
                    <span className="text-gray-400"> / </span>
                    {editingId === budget.id ? (
                      <span className="inline-flex items-center gap-1">
                        $<input type="number" step="0.01" value={editValue} onChange={e => setEditValue(e.target.value)}
                          className="w-20 border-b border-blue-500 outline-none bg-transparent text-sm" />
                        <button onClick={() => handleInlineEdit(budget.id)} className="text-blue-600 text-xs ml-1">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">✕</button>
                      </span>
                    ) : (
                      <button onClick={() => { setEditingId(budget.id); setEditValue(budget.monthly_limit); }}
                        className="font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600">
                        ${budget.monthly_limit.toFixed(2)}
                      </button>
                    )}
                  </div>
                  <button onClick={() => handleDelete(budget.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full progress-bar ${
                    budget.percentage >= 100 ? 'bg-red-500' :
                    budget.percentage >= 80 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                />
              </div>

              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>{budget.percentage.toFixed(0)}% used</span>
                <span>
                  {budget.isOver
                    ? <span className="text-red-500">${(budget.actual - budget.monthly_limit).toFixed(2)} over</span>
                    : <span className="text-green-600">${budget.remaining.toFixed(2)} left</span>
                  }
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title="Set Category Budget" onClose={() => setModal(false)}>
          <BudgetForm existing={budgets} onSave={handleSave} onClose={() => setModal(false)} month={month} year={year} />
        </Modal>
      )}
    </div>
  );
}
