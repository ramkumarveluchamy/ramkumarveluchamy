import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Wrench, Leaf, RefreshCw } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format } from 'date-fns';

const MAINTENANCE_CATEGORIES = ['General', 'Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Appliances', 'Painting', 'Flooring', 'Foundation', 'Windows/Doors', 'Other'];
const URGENCY_LEVELS = ['routine', 'urgent', 'emergency'];
const URGENCY_COLORS = { routine: 'bg-gray-100 text-gray-600', urgent: 'bg-orange-100 text-orange-700', emergency: 'bg-red-100 text-red-700' };
const LAWN_SERVICE_TYPES = ['Mowing', 'Fertilizing', 'Seeding', 'Aeration', 'Trimming/Edging', 'Mulching', 'Leaf Removal', 'Snow Removal', 'Weed Control', 'Other'];

function RepairForm({ onSave, onClose }) {
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'), description: '', cost: '',
    category: 'General', urgency: 'routine',
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
      <div><label className="label">Date</label>
        <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required /></div>
      <div><label className="label">Description</label>
        <input type="text" className="input" value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="e.g. Replace water heater" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {MAINTENANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div><label className="label">Urgency</label>
          <select className="input" value={form.urgency} onChange={e => set('urgency', e.target.value)}>
            {URGENCY_LEVELS.map(u => <option key={u}>{u}</option>)}
          </select></div>
      </div>
      <div><label className="label">Cost ($)</label>
        <input type="number" step="0.01" className="input" value={form.cost} onChange={e => set('cost', e.target.value)} required /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add'}</button>
      </div>
    </form>
  );
}

export default function HomeMaintenance() {
  const [activeTab, setActiveTab] = useState('repairs');
  const [maintenance, setMaintenance] = useState({ items: [], total: 0 });
  const [lawn, setLawn] = useState({ items: [], total: 0 });
  const [modal, setModal] = useState(null);
  const now = new Date();
  const lawnYear = now.getFullYear();

  const [lawnForm, setLawnForm] = useState({
    date: format(now, 'yyyy-MM-dd'), service_type: 'Mowing',
    provider: '', cost: '', notes: '', is_recurring: false, frequency: 'monthly',
  });

  const loadMaintenance = () => api.get('/mortgage/maintenance').then(r => setMaintenance(r.data));
  const loadLawn = () => api.get(`/mortgage/lawn?year=${lawnYear}`).then(r => setLawn(r.data));

  useEffect(() => {
    loadMaintenance();
    loadLawn();
  }, []);

  const deleteRepair = async (id) => {
    if (!confirm('Delete this repair record?')) return;
    await api.delete(`/mortgage/maintenance/${id}`);
    loadMaintenance();
  };

  const deleteLawn = async (id) => {
    if (!confirm('Delete this lawn maintenance record?')) return;
    await api.delete(`/mortgage/lawn/${id}`);
    loadLawn();
  };

  const saveLawn = async e => {
    e.preventDefault();
    await api.post('/mortgage/lawn', lawnForm);
    loadLawn();
    setLawnForm(f => ({ ...f, cost: '', notes: '' }));
  };

  const tabs = [
    { id: 'repairs', label: 'Home Repairs', icon: Wrench },
    { id: 'lawn', label: 'Lawn Maintenance', icon: Leaf },
  ];

  return (
    <div className="space-y-6">
      <h1 className="page-header">Home Maintenance</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Home Repairs tab */}
      {activeTab === 'repairs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Total: <span className="font-bold text-gray-900 dark:text-white">${maintenance.total.toFixed(2)}</span>
            </div>
            <button onClick={() => setModal('repair')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Repair
            </button>
          </div>

          {maintenance.items.length === 0 ? (
            <div className="card text-center py-16">
              <Wrench className="w-14 h-14 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No repair records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {maintenance.items.map(item => (
                <div key={item.id} className="card flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">{item.description}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                        <span>{item.date}</span>
                        {item.category && item.category !== 'General' && <span>· {item.category}</span>}
                        {item.urgency && item.urgency !== 'routine' && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${URGENCY_COLORS[item.urgency]}`}>
                            {item.urgency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-bold text-red-600">${item.cost.toFixed(2)}</span>
                    <button onClick={() => deleteRepair(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lawn Maintenance tab */}
      {activeTab === 'lawn' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-medium text-gray-900 dark:text-white mb-4">Log Lawn Service — {lawnYear}</h3>
            <form onSubmit={saveLawn} className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="label">Date</label>
                  <input type="date" className="input" value={lawnForm.date}
                    onChange={e => setLawnForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label className="label">Service Type</label>
                  <select className="input" value={lawnForm.service_type}
                    onChange={e => setLawnForm(f => ({ ...f, service_type: e.target.value }))}>
                    {LAWN_SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div><label className="label">Provider</label>
                  <input type="text" className="input" value={lawnForm.provider}
                    onChange={e => setLawnForm(f => ({ ...f, provider: e.target.value }))}
                    placeholder="TruGreen, DIY..." /></div>
                <div><label className="label">Cost ($)</label>
                  <input type="number" step="0.01" className="input" value={lawnForm.cost}
                    onChange={e => setLawnForm(f => ({ ...f, cost: e.target.value }))} required /></div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="lawnRec" checked={lawnForm.is_recurring}
                    onChange={e => setLawnForm(f => ({ ...f, is_recurring: e.target.checked }))} className="w-4 h-4" />
                  <label htmlFor="lawnRec" className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Recurring
                  </label>
                </div>
                {lawnForm.is_recurring && (
                  <select className="input w-36 text-sm" value={lawnForm.frequency}
                    onChange={e => setLawnForm(f => ({ ...f, frequency: e.target.value }))}>
                    {['weekly', 'bi-weekly', 'monthly', 'seasonal', 'annual'].map(f => <option key={f}>{f}</option>)}
                  </select>
                )}
                <input type="text" className="input flex-1 min-w-32" value={lawnForm.notes}
                  onChange={e => setLawnForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes..." />
                <button type="submit" className="btn-primary whitespace-nowrap">Log Service</button>
              </div>
            </form>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {lawnYear} Total: <span className="font-bold text-green-700 dark:text-green-400">${lawn.total.toFixed(2)}</span>
            </div>
          </div>

          {lawn.items.length === 0 ? (
            <div className="card text-center py-16">
              <Leaf className="w-14 h-14 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No lawn maintenance records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lawn.items.map(item => (
                <div key={item.id} className="card flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <Leaf className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">{item.service_type}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                        <span>{item.date}</span>
                        {item.provider && <span>· {item.provider}</span>}
                        {item.is_recurring && <span className="text-blue-500">· {item.frequency}</span>}
                        {item.notes && <span>· {item.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-bold text-green-700 dark:text-green-400">${item.cost.toFixed(2)}</span>
                    <button onClick={() => deleteLawn(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal === 'repair' && (
        <Modal title="Add Repair Record" onClose={() => setModal(null)}>
          <RepairForm onSave={async (form) => {
            await api.post('/mortgage/maintenance', form);
            loadMaintenance();
          }} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
