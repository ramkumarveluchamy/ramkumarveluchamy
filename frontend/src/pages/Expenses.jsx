import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Filter } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Miscellaneous', 'Groceries'];
const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other'];

const CATEGORY_COLORS = {
  Food: 'bg-orange-100 text-orange-700', Transport: 'bg-blue-100 text-blue-700',
  Shopping: 'bg-purple-100 text-purple-700', Entertainment: 'bg-pink-100 text-pink-700',
  Health: 'bg-emerald-100 text-emerald-700', Miscellaneous: 'bg-gray-100 text-gray-700',
  Groceries: 'bg-lime-100 text-lime-700',
};

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
      if (form.category === 'Groceries') {
        const payload = { amount: form.amount, store: form.description, date: form.date, notes: form.description };
        initial ? await api.put(`/expenses/${initial.id}`, form) : await api.post('/expenses/groceries', payload);
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

export default function Expenses() {
  const [date, setDate] = useState(new Date());
  const [filterCategory, setFilterCategory] = useState('');
  const [data, setData] = useState({ items: [], total: 0 });
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ month, year });
    if (filterCategory) params.append('category', filterCategory);
    api.get(`/expenses?${params}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [month, year, filterCategory]);

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select className="input py-1 text-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
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

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : data.items.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💳</div>
          No expenses for this period.
          <br /><button onClick={() => setModal('add')} className="text-blue-600 mt-2">Add your first expense</button>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(item => (
            <div key={item.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0 ${CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700'}`}>
                  {item.category}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{item.description || item.category}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex gap-2 text-xs">
                    <span>{item.date}</span>
                    {item.payment_method && <span>· {item.payment_method}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
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
