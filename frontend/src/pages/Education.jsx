import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, GraduationCap, UserPlus } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, subMonths, addMonths } from 'date-fns';

const CATEGORIES = ['Tuition', 'School Supplies', 'Extracurriculars', 'Tutoring', 'Uniform', 'Other'];
const CATEGORY_COLORS = {
  Tuition: 'bg-blue-100 text-blue-700', 'School Supplies': 'bg-green-100 text-green-700',
  Extracurriculars: 'bg-purple-100 text-purple-700', Tutoring: 'bg-orange-100 text-orange-700',
  Uniform: 'bg-pink-100 text-pink-700', Other: 'bg-gray-100 text-gray-700',
};

function ChildForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: '', dob: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="label">Child's Name</label>
        <input type="text" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
      <div><label className="label">Date of Birth (optional)</label>
        <input type="date" className="input" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  );
}

function ExpenseForm({ children, initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    child_id: children[0]?.id || '', category: 'Tuition', amount: '',
    date: format(new Date(), 'yyyy-MM-dd'), notes: ''
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="label">Child</label>
        <select className="input" value={form.child_id} onChange={e => set('child_id', e.target.value)} required>
          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="label">Amount ($)</label>
          <input type="number" step="0.01" className="input" value={form.amount} onChange={e => set('amount', e.target.value)} required /></div>
      </div>
      <div><label className="label">Date</label>
        <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required /></div>
      <div><label className="label">Notes</label>
        <input type="text" className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add'}</button>
      </div>
    </form>
  );
}

export default function Education() {
  const [children, setChildren] = useState([]);
  const [expenses, setExpenses] = useState({ items: [], total: 0 });
  const [selectedChild, setSelectedChild] = useState('');
  const [modal, setModal] = useState(null);
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly'); // monthly | annual

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const loadChildren = () => api.get('/education/children').then(r => {
    setChildren(r.data);
    if (r.data.length > 0 && !selectedChild) setSelectedChild('');
  });

  const loadExpenses = () => {
    const params = new URLSearchParams(viewMode === 'monthly' ? { month, year } : { year });
    if (selectedChild) params.append('child_id', selectedChild);
    api.get(`/education/expenses?${params}`).then(r => setExpenses(r.data));
  };

  useEffect(() => { loadChildren(); }, []);
  useEffect(() => { loadExpenses(); }, [month, year, selectedChild, viewMode]);

  const handleSaveChild = async (form) => {
    if (modal?.editChild) await api.put(`/education/children/${modal.editChild.id}`, form);
    else await api.post('/education/children', form);
    loadChildren();
  };

  const handleDeleteChild = async (id) => {
    if (!confirm('Delete this child and all their education records?')) return;
    await api.delete(`/education/children/${id}`);
    loadChildren();
    if (selectedChild == id) setSelectedChild('');
    loadExpenses();
  };

  const handleSaveExpense = async (form) => {
    if (modal?.edit) await api.put(`/education/expenses/${modal.edit.id}`, form);
    else await api.post('/education/expenses', form);
    loadExpenses();
  };

  const handleDeleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await api.delete(`/education/expenses/${id}`);
    loadExpenses();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Kids Education</h1>
        <div className="flex gap-2">
          {children.length > 0 && (
            <button onClick={() => setModal('expense')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          )}
          <button onClick={() => setModal('child')} className="btn-secondary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Child
          </button>
        </div>
      </div>

      {/* Children list */}
      {children.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setSelectedChild('')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedChild === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            All Children
          </button>
          {children.map(child => {
            const age = child.dob ? Math.floor((new Date() - new Date(child.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
            return (
              <div key={child.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedChild(child.id === parseInt(selectedChild) ? '' : child.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    parseInt(selectedChild) === child.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {child.name}{age !== null ? ` (${age})` : ''}
                </button>
                <button onClick={() => setModal({ editChild: child })} className="p-1 text-gray-400 hover:text-gray-600">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => handleDeleteChild(child.id)} className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <button onClick={() => setViewMode('monthly')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'monthly' ? 'bg-blue-600 text-white' : 'btn-secondary'}`}>Monthly</button>
          <button onClick={() => setViewMode('annual')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'annual' ? 'bg-blue-600 text-white' : 'btn-secondary'}`}>Annual</button>
        </div>
        {viewMode === 'monthly' ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="font-medium">{format(date, 'MMMM yyyy')}</span>
            <button onClick={() => setDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(d => new Date(d.getFullYear() - 1, d.getMonth()))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="font-medium">{year}</span>
            <button onClick={() => setDate(d => new Date(d.getFullYear() + 1, d.getMonth()))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
          </div>
        )}
        <div className="text-right">
          <div className="text-sm text-gray-500">Total</div>
          <div className="font-bold text-blue-600">${expenses.total.toFixed(2)}</div>
        </div>
      </div>

      {children.length === 0 ? (
        <div className="card text-center py-16">
          <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">No children added yet. Add a child to start tracking education expenses.</p>
          <button onClick={() => setModal('child')} className="btn-primary">Add Child Profile</button>
        </div>
      ) : expenses.items.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📚</div>
          No education expenses for this period.
        </div>
      ) : (
        <div className="space-y-3">
          {expenses.items.map(item => (
            <div key={item.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0 ${CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700'}`}>
                  {item.category}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">{item.child_name}</div>
                  <div className="text-xs text-gray-500 flex gap-2">
                    <span>{item.date}</span>
                    {item.notes && <span>· {item.notes}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="font-bold text-blue-600">${item.amount.toFixed(2)}</span>
                <button onClick={() => setModal({ edit: item })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteExpense(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'child' || modal?.editChild) && (
        <Modal title={modal?.editChild ? 'Edit Child' : 'Add Child'} onClose={() => setModal(null)}>
          <ChildForm initial={modal?.editChild} onSave={handleSaveChild} onClose={() => setModal(null)} />
        </Modal>
      )}
      {(modal === 'expense' || modal?.edit) && children.length > 0 && (
        <Modal title={modal?.edit ? 'Edit Expense' : 'Add Education Expense'} onClose={() => setModal(null)}>
          <ExpenseForm children={children} initial={modal?.edit} onSave={handleSaveExpense} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
