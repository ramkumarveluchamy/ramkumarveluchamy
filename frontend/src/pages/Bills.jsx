import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const CATEGORIES = ['Mortgage/Rent', 'Electric', 'Water', 'Gas', 'Internet', 'Insurance', 'Subscription', 'Other'];

function BillForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', amount: '', due_day: '', category: 'Other', is_autopay: false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch { } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Bill Name</label>
        <input type="text" className="input" value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="e.g. Netflix, Electric Bill" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount ($)</label>
          <input type="number" step="0.01" className="input" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0.00" required />
        </div>
        <div>
          <label className="label">Due Day (1-31)</label>
          <input type="number" min="1" max="31" className="input" value={form.due_day}
            onChange={e => set('due_day', e.target.value)} placeholder="15" required />
        </div>
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <input type="checkbox" id="autopay" checked={form.is_autopay}
          onChange={e => set('is_autopay', e.target.checked)} className="w-4 h-4 rounded" />
        <label htmlFor="autopay" className="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
          Auto-pay enabled
        </label>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Bill'}</button>
      </div>
    </form>
  );
}

export default function Bills() {
  const [date, setDate] = useState(new Date());
  const [bills, setBills] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const load = () => {
    setLoading(true);
    api.get(`/bills?month=${month}&year=${year}`)
      .then(r => setBills(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [month, year]);

  const handleSave = async (form) => {
    if (modal?.edit) await api.put(`/bills/${modal.edit.id}`, form);
    else await api.post('/bills', form);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this bill?')) return;
    await api.delete(`/bills/${id}`);
    load();
  };

  const handleToggle = async (bill) => {
    await api.post(`/bills/${bill.id}/payment`, { month, year });
    load();
  };

  const totalDue = bills.reduce((sum, b) => b.status !== 'paid' ? sum + b.amount : sum, 0);
  const totalPaid = bills.reduce((sum, b) => b.status === 'paid' ? sum + b.amount : sum, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Recurring Bills</h1>
        <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Bill
        </button>
      </div>

      {/* Month + summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 card py-2">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
          <span className="font-medium text-gray-700 dark:text-gray-300">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
        </div>
        <div className="flex gap-4">
          <div className="card py-2 px-4 text-center">
            <div className="text-xs text-gray-500">Paid</div>
            <div className="font-bold text-green-600">${totalPaid.toFixed(2)}</div>
          </div>
          <div className="card py-2 px-4 text-center">
            <div className="text-xs text-gray-500">Remaining</div>
            <div className="font-bold text-red-600">${totalDue.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : bills.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          No bills added yet.
          <br /><button onClick={() => setModal('add')} className="text-blue-600 mt-2">Add your first bill</button>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map(bill => {
            const today = new Date().getDate();
            const daysUntil = bill.due_day - today;
            const isOverdue = daysUntil < 0 && bill.status !== 'paid';
            const isDueSoon = daysUntil >= 0 && daysUntil <= 3 && bill.status !== 'paid';

            return (
              <div key={bill.id} className={`card flex items-center justify-between gap-4 ${isOverdue ? 'border-red-200 dark:border-red-800' : isDueSoon ? 'border-yellow-200 dark:border-yellow-800' : ''}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => handleToggle(bill)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      bill.status === 'paid'
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700 hover:bg-green-50 hover:text-green-500'
                    }`}
                  >
                    {bill.status === 'paid' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${bill.status === 'paid' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                        {bill.name}
                      </span>
                      {bill.is_autopay && <span className="badge-blue text-xs">Auto-pay</span>}
                      {isOverdue && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      {isDueSoon && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {bill.category} · Due day {bill.due_day}
                      {bill.status !== 'paid' && daysUntil >= 0 && <span className="ml-1">({daysUntil}d)</span>}
                      {isOverdue && <span className="ml-1 text-red-500">Overdue!</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-bold text-lg ${bill.status === 'paid' ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    ${bill.amount.toFixed(2)}
                  </span>
                  <button onClick={() => setModal({ edit: bill })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(bill.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add Bill' : 'Edit Bill'} onClose={() => setModal(null)}>
          <BillForm initial={modal?.edit} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
