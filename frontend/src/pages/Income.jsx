import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const SOURCES = ['Salary', 'Freelance', 'Bonus', 'Investment', 'Rental', 'Other'];
const FREQUENCIES = ['monthly', 'bi-weekly', 'weekly', 'quarterly', 'annually'];

function IncomeForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    amount: '', source: 'Salary', date: format(new Date(), 'yyyy-MM-dd'),
    notes: '', is_recurring: false, frequency: 'monthly',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.amount || !form.source || !form.date) { setError('Amount, source, and date are required'); return; }
    setSaving(true);
    try {
      await onSave(form);
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
          <label className="label">Source</label>
          <select className="input" value={form.source} onChange={e => set('source', e.target.value)}>
            {SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Date</label>
        <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>
      <div>
        <label className="label">Notes (optional)</label>
        <input type="text" className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. March salary" />
      </div>
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <input type="checkbox" id="recurring" checked={form.is_recurring}
          onChange={e => set('is_recurring', e.target.checked)} className="w-4 h-4 rounded" />
        <label htmlFor="recurring" className="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Recurring Income
        </label>
      </div>
      {form.is_recurring && (
        <div>
          <label className="label">Frequency</label>
          <select className="input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
      )}
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Income'}</button>
      </div>
    </form>
  );
}

export default function Income() {
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState({ items: [], total: 0 });
  const [modal, setModal] = useState(null); // null | 'add' | { edit: item }
  const [loading, setLoading] = useState(true);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const load = () => {
    setLoading(true);
    api.get(`/income?month=${month}&year=${year}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [month, year]);

  const handleSave = async (form) => {
    if (modal?.edit) {
      await api.put(`/income/${modal.edit.id}`, form);
    } else {
      await api.post('/income', form);
    }
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this income entry?')) return;
    await api.delete(`/income/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Income</h1>
        <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Income
        </button>
      </div>

      {/* Month picker + total */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
          <span className="font-medium text-gray-700 dark:text-gray-300">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total Income</div>
          <div className="text-xl font-bold text-green-600">${data.total.toFixed(2)}</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : data.items.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💰</div>
          No income recorded for this month.
          <br /><button onClick={() => setModal('add')} className="text-blue-600 mt-2">Add your first entry</button>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(item => (
            <div key={item.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 font-bold text-sm flex-shrink-0">
                  {item.source[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{item.source}</span>
                    {item.is_recurring && (
                      <span className="badge-blue text-xs"><RefreshCw className="w-2.5 h-2.5 mr-1 inline" />{item.frequency}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex gap-2">
                    <span>{item.date}</span>
                    {item.notes && <span className="truncate">· {item.notes}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-green-600 text-lg">${item.amount.toFixed(2)}</span>
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
        <Modal
          title={modal === 'add' ? 'Add Income' : 'Edit Income'}
          onClose={() => setModal(null)}
        >
          <IncomeForm
            initial={modal?.edit}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
