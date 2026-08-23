import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Filter, CheckCircle2, Circle, Zap } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment',
  'Health', 'Utilities', 'Home Maintenance', 'Education', 'Miscellaneous',
];
const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other'];

const CATEGORY_COLORS = {
  Food: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Groceries: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
  Transport: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Shopping: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Entertainment: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  Health: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Utilities: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Home Maintenance': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Education: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Miscellaneous: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

// ─── Inline category selector ─────────────────────────────────────────────────

function CategorySelect({ item, onChanged }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e) => {
    const newCat = e.target.value;
    setSaving(true);
    try {
      await api.patch(`/expenses/${item.id}/category`, { category: newCat });
      onChanged(item.id, newCat);
    } catch {} finally { setSaving(false); }
  };

  const colorClass = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700';

  return (
    <div className="relative flex-shrink-0">
      <select
        value={item.category}
        onChange={handleChange}
        disabled={saving}
        className={`appearance-none text-xs font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer
          focus:ring-2 focus:ring-blue-400 ${colorClass} ${saving ? 'opacity-60' : ''}`}
      >
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// ─── Review toggle ────────────────────────────────────────────────────────────

function ReviewButton({ item, onChanged }) {
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/expenses/${item.id}/review`);
      onChanged(item.id, res.data.is_reviewed);
    } catch {} finally { setSaving(false); }
  };

  if (item.source !== 'plaid') return null;

  return (
    <button
      onClick={handleToggle}
      disabled={saving}
      title={item.is_reviewed ? 'Reviewed — click to undo' : 'Mark as reviewed'}
      className={`p-1.5 rounded-lg transition-colors ${
        item.is_reviewed
          ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
          : 'text-gray-300 hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
      } ${saving ? 'opacity-40' : ''}`}
    >
      {item.is_reviewed
        ? <CheckCircle2 className="w-4 h-4" />
        : <Circle className="w-4 h-4" />
      }
    </button>
  );
}

// ─── Expense form ─────────────────────────────────────────────────────────────

function ExpenseForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    amount: '', category: 'Food', date: format(new Date(), 'yyyy-MM-dd'),
    description: '', payment_method: 'Credit Card',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!initial && form.category === 'Groceries') {
        await api.post('/expenses/groceries', { amount: form.amount, store: form.description, date: form.date, notes: form.description });
      } else {
        await onSave(form);
      }
      onClose();
    } catch { setError('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount ($)</label>
          <input type="number" step="0.01" className="input" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Date</label>
        <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>
      <div>
        <label className="label">Description</label>
        <input type="text" className="input" value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="What was this for?" />
      </div>
      <div>
        <label className="label">Payment Method</label>
        <select className="input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Expense'}</button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Expenses() {
  const [date, setDate] = useState(new Date());
  const [filterCategory, setFilterCategory] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, unreviewedCount: 0 });
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ month, year });
    if (filterCategory) params.append('category', filterCategory);
    if (needsReview) params.append('needs_review', '1');
    api.get(`/expenses?${params}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [month, year, filterCategory, needsReview]);

  const handleSave = async (form) => {
    if (modal?.edit) await api.put(`/expenses/${modal.edit.id}`, form);
    else await api.post('/expenses', form);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await api.delete(`/expenses/${id}`);
    load();
  };

  // Optimistic update for inline category change
  const handleCategoryChanged = (id, newCat) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, category: newCat, user_category_override: 1 } : i),
    }));
  };

  // Optimistic update for review toggle
  const handleReviewChanged = (id, isReviewed) => {
    setData(prev => ({
      ...prev,
      items: needsReview
        ? prev.items.filter(i => i.id !== id)
        : prev.items.map(i => i.id === id ? { ...i, is_reviewed: isReviewed } : i),
      unreviewedCount: isReviewed
        ? Math.max(0, prev.unreviewedCount - 1)
        : prev.unreviewedCount + 1,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Expenses</h1>
        <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
          <span className="font-medium text-gray-700 dark:text-gray-300">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Needs review filter */}
          <button
            onClick={() => setNeedsReview(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              needsReview
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <Circle className="w-3.5 h-3.5" />
            Needs Review
            {data.unreviewedCount > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full font-bold ${
                needsReview ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
              }`}>{data.unreviewedCount}</span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select className="input py-1 text-sm" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setNeedsReview(false); }}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Total</div>
            <div className="font-bold text-red-600">${data.total.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {needsReview && data.unreviewedCount === 0 && !loading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          All Plaid transactions for this month have been reviewed.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : data.items.length === 0 && !needsReview ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💳</div>
          No expenses for this period.
          <br /><button onClick={() => setModal('add')} className="text-blue-600 mt-2">Add your first expense</button>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map(item => (
            <div
              key={item.id}
              className={`card flex items-center gap-3 py-3 ${
                item.source === 'plaid' && !item.is_reviewed
                  ? 'border-l-2 border-l-amber-400'
                  : item.source === 'plaid'
                  ? 'border-l-2 border-l-green-400'
                  : ''
              }`}
            >
              {/* Review toggle (only for Plaid) */}
              <ReviewButton item={item} onChanged={handleReviewChanged} />

              {/* Inline category selector */}
              <CategorySelect item={item} onChanged={handleCategoryChanged} />

              {/* Description + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white truncate">
                    {item.merchant_name || item.description || item.category}
                  </span>
                  {item.source === 'plaid' && (
                    <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      <Zap className="w-2.5 h-2.5" /> Plaid
                    </span>
                  )}
                  {item.user_category_override === 1 && (
                    <span className="text-xs text-gray-400 flex-shrink-0">· recategorized</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                  <span>{item.date}</span>
                  {item.payment_method && item.source !== 'plaid' && <span>· {item.payment_method}</span>}
                  {item.merchant_name && item.description && item.description !== item.merchant_name && (
                    <span className="truncate">· {item.description}</span>
                  )}
                </div>
              </div>

              {/* Amount + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-bold text-red-600">${item.amount.toFixed(2)}</span>
                <button onClick={() => setModal({ edit: item })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add Expense' : 'Edit Expense'} onClose={() => setModal(null)}>
          <ExpenseForm initial={modal?.edit} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
