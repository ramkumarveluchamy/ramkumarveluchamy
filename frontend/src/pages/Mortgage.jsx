import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Home, Wrench, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/client';
import Modal from '../components/Modal';
import { format } from 'date-fns';

const UTILITY_TYPES = ['Electric', 'Water', 'Gas', 'Internet'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MortgageForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    principal: '', rate: '', monthly_payment: '', start_date: '', remaining_balance: '', notes: ''
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
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Original Principal ($)</label>
          <input type="number" className="input" value={form.principal} onChange={e => set('principal', e.target.value)} required /></div>
        <div><label className="label">Interest Rate (%)</label>
          <input type="number" step="0.01" className="input" value={form.rate} onChange={e => set('rate', e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Monthly Payment ($)</label>
          <input type="number" step="0.01" className="input" value={form.monthly_payment} onChange={e => set('monthly_payment', e.target.value)} required /></div>
        <div><label className="label">Remaining Balance ($)</label>
          <input type="number" step="0.01" className="input" value={form.remaining_balance} onChange={e => set('remaining_balance', e.target.value)} /></div>
      </div>
      <div><label className="label">Start Date</label>
        <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} required /></div>
      <div><label className="label">Notes</label>
        <textarea className="input" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  );
}

function MaintenanceForm({ onSave, onClose }) {
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), description: '', cost: '' });
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
      <div><label className="label">Date</label>
        <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required /></div>
      <div><label className="label">Description</label>
        <input type="text" className="input" value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="e.g. HVAC Service, Plumbing" required /></div>
      <div><label className="label">Cost ($)</label>
        <input type="number" step="0.01" className="input" value={form.cost} onChange={e => set('cost', e.target.value)} required /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add'}</button>
      </div>
    </form>
  );
}

export default function Mortgage() {
  const [mortgage, setMortgage] = useState(null);
  const [maintenance, setMaintenance] = useState({ items: [], total: 0 });
  const [utilities, setUtilities] = useState([]);
  const [modal, setModal] = useState(null);
  const [activeTab, setActiveTab] = useState('mortgage');

  const now = new Date();
  const [utilMonth, setUtilMonth] = useState(now.getMonth() + 1);
  const [utilYear, setUtilYear] = useState(now.getFullYear());
  const [utilForm, setUtilForm] = useState({ type: 'Electric', amount: '' });

  useEffect(() => {
    api.get('/mortgage').then(r => setMortgage(r.data));
    api.get('/mortgage/maintenance').then(r => setMaintenance(r.data));
  }, []);

  useEffect(() => {
    api.get(`/mortgage/utilities?month=${utilMonth}&year=${utilYear}`).then(r => setUtilities(r.data));
  }, [utilMonth, utilYear]);

  const saveUtility = async e => {
    e.preventDefault();
    await api.post('/mortgage/utilities', { ...utilForm, month: utilMonth, year: utilYear });
    api.get(`/mortgage/utilities?month=${utilMonth}&year=${utilYear}`).then(r => setUtilities(r.data));
    setUtilForm(f => ({ ...f, amount: '' }));
  };

  const deleteUtility = async (id) => {
    await api.delete(`/mortgage/utilities/${id}`);
    setUtilities(u => u.filter(x => x.id !== id));
  };

  const deleteMaintenance = async (id) => {
    if (!confirm('Delete this maintenance record?')) return;
    await api.delete(`/mortgage/maintenance/${id}`);
    api.get('/mortgage/maintenance').then(r => setMaintenance(r.data));
  };

  const tabs = [
    { id: 'mortgage', label: 'Mortgage', icon: Home },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'utilities', label: 'Utilities', icon: Zap },
  ];

  const yearsSinceStart = mortgage?.start_date
    ? ((new Date() - new Date(mortgage.start_date)) / (1000 * 60 * 60 * 24 * 365)).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="page-header">Mortgage & Housing</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Mortgage tab */}
      {activeTab === 'mortgage' && (
        <div className="space-y-4">
          {!mortgage ? (
            <div className="card text-center py-12">
              <Home className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 mb-4">No mortgage details added yet.</p>
              <button onClick={() => setModal('mortgage')} className="btn-primary">Add Mortgage Details</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card"><div className="text-sm text-gray-500">Original Principal</div>
                  <div className="text-xl font-bold">${mortgage.principal.toLocaleString()}</div></div>
                <div className="card"><div className="text-sm text-gray-500">Interest Rate</div>
                  <div className="text-xl font-bold">{mortgage.rate}%</div></div>
                <div className="card"><div className="text-sm text-gray-500">Monthly Payment</div>
                  <div className="text-xl font-bold text-blue-600">${mortgage.monthly_payment.toLocaleString()}</div></div>
                <div className="card"><div className="text-sm text-gray-500">Remaining Balance</div>
                  <div className="text-xl font-bold text-red-600">${(mortgage.remaining_balance || 0).toLocaleString()}</div></div>
                <div className="card"><div className="text-sm text-gray-500">Start Date</div>
                  <div className="text-xl font-bold">{mortgage.start_date}</div></div>
                <div className="card"><div className="text-sm text-gray-500">Years Active</div>
                  <div className="text-xl font-bold">{yearsSinceStart} yrs</div></div>
              </div>
              {mortgage.remaining_balance && mortgage.principal && (
                <div className="card">
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>Principal paid off</span>
                    <span>{(((mortgage.principal - mortgage.remaining_balance) / mortgage.principal) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${((mortgage.principal - mortgage.remaining_balance) / mortgage.principal) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>${(mortgage.principal - mortgage.remaining_balance).toLocaleString()} paid</span>
                    <span>${mortgage.remaining_balance.toLocaleString()} remaining</span>
                  </div>
                </div>
              )}
              {mortgage.notes && <div className="card text-sm text-gray-600 dark:text-gray-400 italic">{mortgage.notes}</div>}
              <button onClick={() => setModal('mortgage')} className="btn-secondary">Update Mortgage Details</button>
            </>
          )}
        </div>
      )}

      {/* Maintenance tab */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Total Maintenance Costs: <span className="font-bold text-gray-900 dark:text-white">${maintenance.total.toFixed(2)}</span></div>
            <button onClick={() => setModal('maintenance')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </div>
          {maintenance.items.length === 0 ? (
            <div className="card text-center py-12 text-gray-400"><Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />No maintenance records yet.</div>
          ) : (
            <div className="space-y-3">
              {maintenance.items.map(item => (
                <div key={item.id} className="card flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.description}</div>
                    <div className="text-sm text-gray-500">{item.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-red-600">${item.cost.toFixed(2)}</span>
                    <button onClick={() => deleteMaintenance(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Utilities tab */}
      {activeTab === 'utilities' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-medium text-gray-900 dark:text-white mb-4">Log Utility Bill</h3>
            <form onSubmit={saveUtility} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="label">Month/Year</label>
                <div className="flex gap-2">
                  <select className="input w-28" value={utilMonth} onChange={e => setUtilMonth(Number(e.target.value))}>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <input type="number" className="input w-24" value={utilYear} onChange={e => setUtilYear(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={utilForm.type} onChange={e => setUtilForm(f => ({ ...f, type: e.target.value }))}>
                  {UTILITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount ($)</label>
                <input type="number" step="0.01" className="input w-32" value={utilForm.amount}
                  onChange={e => setUtilForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
              </div>
              <button type="submit" className="btn-primary">Log</button>
            </form>
          </div>

          {utilities.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-3">{MONTH_NAMES[utilMonth - 1]} {utilYear} Utilities</h3>
              <div className="space-y-2">
                {utilities.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <span className="text-sm font-medium">{u.type}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">${u.amount.toFixed(2)}</span>
                      <button onClick={() => deleteUtility(u.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="font-medium">Total</span>
                  <span className="font-bold">${utilities.reduce((s, u) => s + u.amount, 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {modal === 'mortgage' && (
        <Modal title="Mortgage Details" onClose={() => setModal(null)} size="lg">
          <MortgageForm initial={mortgage} onSave={async (form) => {
            await api.post('/mortgage', form);
            api.get('/mortgage').then(r => setMortgage(r.data));
          }} onClose={() => setModal(null)} />
        </Modal>
      )}

      {modal === 'maintenance' && (
        <Modal title="Add Maintenance Record" onClose={() => setModal(null)}>
          <MaintenanceForm onSave={async (form) => {
            await api.post('/mortgage/maintenance', form);
            api.get('/mortgage/maintenance').then(r => setMaintenance(r.data));
          }} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
