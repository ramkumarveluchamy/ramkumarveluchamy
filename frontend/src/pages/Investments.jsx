import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format } from 'date-fns';

const ACCOUNT_TYPES = ['brokerage', '401k', 'roth_ira', 'traditional_ira', '403b', 'other'];
const RETIREMENT_TYPES = ['401k', 'Roth IRA', 'Traditional IRA', '403b', 'Pension', 'Other'];
const CONTRIB_LIMITS_2024 = { '401k': 23000, '403b': 23000, 'Roth IRA': 7000, 'Traditional IRA': 7000 };
const HSA_FSA_TYPES = ['HSA', 'FSA'];
const HSA_LIMIT_2024 = 4150;
const FSA_LIMIT_2024 = 3050;
const HSA_CATEGORIES = ['Medical', 'Dental', 'Vision', 'Pharmacy', 'Mental Health', 'Other'];

// ─── Stock Form ───────────────────────────────────────────────────────────────
function StockForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    ticker: '', name: '', shares: '', purchase_price: '', current_price: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'), account_type: 'brokerage', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  const value = form.shares && (form.current_price || form.purchase_price)
    ? (parseFloat(form.shares) * parseFloat(form.current_price || form.purchase_price)).toFixed(2)
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Ticker Symbol</label>
          <input type="text" className="input uppercase" value={form.ticker}
            onChange={e => set('ticker', e.target.value.toUpperCase())} placeholder="AAPL" required /></div>
        <div><label className="label">Company Name</label>
          <input type="text" className="input" value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="Apple Inc." /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Shares</label>
          <input type="number" step="0.0001" className="input" value={form.shares}
            onChange={e => set('shares', e.target.value)} required /></div>
        <div><label className="label">Purchase Price ($)</label>
          <input type="number" step="0.01" className="input" value={form.purchase_price}
            onChange={e => set('purchase_price', e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Current Price ($)</label>
          <input type="number" step="0.01" className="input" value={form.current_price}
            onChange={e => set('current_price', e.target.value)} placeholder="Manual update" /></div>
        <div><label className="label">Purchase Date</label>
          <input type="date" className="input" value={form.purchase_date}
            onChange={e => set('purchase_date', e.target.value)} /></div>
      </div>
      <div><label className="label">Account Type</label>
        <select className="input" value={form.account_type} onChange={e => set('account_type', e.target.value)}>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
        </select>
      </div>
      {value && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
          Estimated value: <strong>${Number(value).toLocaleString()}</strong>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add'}</button>
      </div>
    </form>
  );
}

// ─── Retirement Form ──────────────────────────────────────────────────────────
function RetirementForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    account_type: '401k', institution: '', balance: '', contribution_ytd: '',
    employer_match_ytd: '', contribution_limit: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const suggestedLimit = CONTRIB_LIMITS_2024[form.account_type] || '';

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Account Type</label>
          <select className="input" value={form.account_type} onChange={e => {
            set('account_type', e.target.value);
            set('contribution_limit', CONTRIB_LIMITS_2024[e.target.value] || '');
          }}>
            {RETIREMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="label">Institution</label>
          <input type="text" className="input" value={form.institution}
            onChange={e => set('institution', e.target.value)} placeholder="Fidelity, Vanguard..." /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Current Balance ($)</label>
          <input type="number" step="0.01" className="input" value={form.balance}
            onChange={e => set('balance', e.target.value)} required /></div>
        <div><label className="label">2024 Contribution Limit ($)</label>
          <input type="number" step="0.01" className="input" value={form.contribution_limit || suggestedLimit}
            onChange={e => set('contribution_limit', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">YTD Contributions ($)</label>
          <input type="number" step="0.01" className="input" value={form.contribution_ytd}
            onChange={e => set('contribution_ytd', e.target.value)} /></div>
        <div><label className="label">Employer Match YTD ($)</label>
          <input type="number" step="0.01" className="input" value={form.employer_match_ytd}
            onChange={e => set('employer_match_ytd', e.target.value)} /></div>
      </div>
      <div><label className="label">Notes</label>
        <input type="text" className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Account'}</button>
      </div>
    </form>
  );
}

// ─── HSA/FSA Form ─────────────────────────────────────────────────────────────
function HsaFsaForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    account_type: 'HSA', institution: '', balance: '', contribution_ytd: '', contribution_limit: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Account Type</label>
          <select className="input" value={form.account_type} onChange={e => {
            set('account_type', e.target.value);
            set('contribution_limit', e.target.value === 'HSA' ? HSA_LIMIT_2024 : FSA_LIMIT_2024);
          }}>
            {HSA_FSA_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="label">Institution</label>
          <input type="text" className="input" value={form.institution} onChange={e => set('institution', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Balance ($)</label>
          <input type="number" step="0.01" className="input" value={form.balance} onChange={e => set('balance', e.target.value)} required /></div>
        <div><label className="label">YTD Contributions ($)</label>
          <input type="number" step="0.01" className="input" value={form.contribution_ytd} onChange={e => set('contribution_ytd', e.target.value)} /></div>
      </div>
      <div><label className="label">Annual Contribution Limit ($)</label>
        <input type="number" step="0.01" className="input" value={form.contribution_limit}
          onChange={e => set('contribution_limit', e.target.value)}
          placeholder={form.account_type === 'HSA' ? `${HSA_LIMIT_2024}` : `${FSA_LIMIT_2024}`} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Account'}</button>
      </div>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Investments() {
  const [tab, setTab] = useState('stocks');
  const [stocks, setStocks] = useState({ items: [], totalValue: 0, totalCost: 0, totalGain: 0 });
  const [retirement, setRetirement] = useState({ items: [], totalBalance: 0, totalContributions: 0, totalMatch: 0 });
  const [hsaFsa, setHsaFsa] = useState({ items: [], totalBalance: 0 });
  const [summary, setSummary] = useState(null);
  const [modal, setModal] = useState(null);
  const [priceEdit, setPriceEdit] = useState({});

  const load = () => {
    api.get('/investments/stocks').then(r => setStocks(r.data));
    api.get('/investments/retirement').then(r => setRetirement(r.data));
    api.get('/investments/hsa-fsa').then(r => setHsaFsa(r.data));
    api.get('/investments/summary').then(r => setSummary(r.data));
  };

  useEffect(load, []);

  const handleSaveStock = async form => {
    if (modal?.edit) await api.put(`/investments/stocks/${modal.edit.id}`, form);
    else await api.post('/investments/stocks', form);
    load();
  };
  const handleSaveRetirement = async form => {
    if (modal?.edit) await api.put(`/investments/retirement/${modal.edit.id}`, form);
    else await api.post('/investments/retirement', form);
    load();
  };
  const handleSaveHsa = async form => {
    if (modal?.edit) await api.put(`/investments/hsa-fsa/${modal.edit.id}`, form);
    else await api.post('/investments/hsa-fsa', form);
    load();
  };

  const handleUpdatePrice = async (id, price) => {
    await api.patch(`/investments/stocks/${id}/price`, { current_price: price });
    setPriceEdit({});
    load();
  };

  const tabs = [
    { id: 'stocks', label: 'Stocks & Brokerage' },
    { id: 'retirement', label: 'Retirement (401K/IRA)' },
    { id: 'hsa', label: 'HSA / FSA' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="page-header">Investments & Savings</h1>

      {/* Net Worth Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-xs text-gray-500">Stock Portfolio</div>
            <div className="text-xl font-bold text-blue-600">${summary.stockValue.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
          </div>
          <div className="card">
            <div className="text-xs text-gray-500">Retirement Total</div>
            <div className="text-xl font-bold text-purple-600">${summary.retirementBalance.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
          </div>
          <div className="card">
            <div className="text-xs text-gray-500">HSA/FSA</div>
            <div className="text-xl font-bold text-green-600">${summary.hsaBalance.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
          </div>
          <div className="card border-2 border-blue-200 dark:border-blue-800">
            <div className="text-xs text-gray-500">Est. Net Worth</div>
            <div className={`text-xl font-bold ${summary.netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${summary.netWorth.toLocaleString('en-US', {maximumFractionDigits: 0})}
            </div>
            <div className="text-xs text-gray-400 mt-1">Assets - Debts & Mortgage</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Stocks Tab ── */}
      {tab === 'stocks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span>Value: <strong className="text-blue-600">${stocks.totalValue.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong></span>
              <span>Cost: <strong>${stocks.totalCost.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong></span>
              <span className={stocks.totalGain >= 0 ? 'text-green-600' : 'text-red-600'}>
                {stocks.totalGain >= 0 ? <TrendingUp className="inline w-3 h-3 mr-1" /> : <TrendingDown className="inline w-3 h-3 mr-1" />}
                <strong>${Math.abs(stocks.totalGain).toLocaleString('en-US', {maximumFractionDigits: 0})}</strong>
              </span>
            </div>
            <button onClick={() => setModal('stock')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Holding
            </button>
          </div>

          {stocks.items.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              No stock holdings added yet.
              <br /><button onClick={() => setModal('stock')} className="text-blue-600 mt-2">Add your first holding</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b dark:border-gray-700 text-left text-gray-500">
                  <th className="pb-2 font-medium">Ticker</th>
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium text-right">Shares</th>
                  <th className="pb-2 font-medium text-right">Cost/sh</th>
                  <th className="pb-2 font-medium text-right">Price</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">Gain/Loss</th>
                  <th className="pb-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {stocks.items.map(st => {
                    const price = st.current_price || st.purchase_price;
                    const value = st.shares * price;
                    const cost = st.shares * st.purchase_price;
                    const gain = value - cost;
                    const gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(1) : 0;
                    return (
                      <tr key={st.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3">
                          <div className="font-bold text-gray-900 dark:text-white">{st.ticker}</div>
                          {st.name && <div className="text-xs text-gray-400 truncate max-w-[100px]">{st.name}</div>}
                        </td>
                        <td className="py-3"><span className="badge-blue text-xs">{st.account_type}</span></td>
                        <td className="py-3 text-right">{st.shares}</td>
                        <td className="py-3 text-right">${st.purchase_price.toFixed(2)}</td>
                        <td className="py-3 text-right">
                          {priceEdit[st.id] !== undefined ? (
                            <span className="flex items-center justify-end gap-1">
                              $<input type="number" step="0.01" value={priceEdit[st.id]}
                                onChange={e => setPriceEdit(p => ({ ...p, [st.id]: e.target.value }))}
                                className="w-20 border-b border-blue-500 outline-none bg-transparent" />
                              <button onClick={() => handleUpdatePrice(st.id, priceEdit[st.id])} className="text-green-600 text-xs">✓</button>
                              <button onClick={() => setPriceEdit(p => { const n = {...p}; delete n[st.id]; return n; })} className="text-gray-400 text-xs">✕</button>
                            </span>
                          ) : (
                            <button onClick={() => setPriceEdit(p => ({ ...p, [st.id]: price }))}
                              className="hover:text-blue-600 transition-colors">
                              ${price.toFixed(2)}
                              {!st.current_price && <span className="text-gray-300 ml-1 text-xs">(cost)</span>}
                            </button>
                          )}
                        </td>
                        <td className="py-3 text-right font-semibold">${value.toLocaleString('en-US', {maximumFractionDigits: 0})}</td>
                        <td className={`py-3 text-right font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {gain >= 0 ? '+' : ''}${gain.toFixed(0)} ({gainPct}%)
                        </td>
                        <td className="py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setModal({ edit: st, type: 'stock' })} className="p-1 text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                            <button onClick={async () => { if(confirm('Delete?')) { await api.delete(`/investments/stocks/${st.id}`); load(); }}} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Retirement Tab ── */}
      {tab === 'retirement' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total Balance: <strong className="text-purple-600">${retirement.totalBalance.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong>
              <span className="mx-3">·</span>
              YTD Contributions: <strong>${retirement.totalContributions.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong>
              <span className="mx-3">·</span>
              Employer Match: <strong className="text-green-600">${retirement.totalMatch.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong>
            </div>
            <button onClick={() => setModal('retirement')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Account
            </button>
          </div>

          {retirement.items.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              No retirement accounts added yet.
              <br /><button onClick={() => setModal('retirement')} className="text-blue-600 mt-2">Add your first account</button>
            </div>
          ) : (
            <div className="space-y-4">
              {retirement.items.map(acct => {
                const contribPct = acct.contribution_limit > 0
                  ? Math.min((acct.contribution_ytd / acct.contribution_limit) * 100, 100)
                  : 0;
                return (
                  <div key={acct.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-white">{acct.account_type}</span>
                          {acct.institution && <span className="text-sm text-gray-500">· {acct.institution}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">${acct.balance.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
                          <div className="text-xs text-gray-400">Current Balance</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setModal({ edit: acct, type: 'retirement' })} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                          <button onClick={async () => { if(confirm('Delete?')) { await api.delete(`/investments/retirement/${acct.id}`); load(); }}} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                    {acct.contribution_limit > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>YTD Contribution Progress</span>
                          <span>${acct.contribution_ytd.toLocaleString()} / ${acct.contribution_limit.toLocaleString()} limit</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full progress-bar" style={{ width: `${contribPct}%` }} />
                        </div>
                        {acct.employer_match_ytd > 0 && (
                          <div className="text-xs text-green-600 mt-1">
                            + ${acct.employer_match_ytd.toLocaleString()} employer match this year
                          </div>
                        )}
                      </div>
                    )}
                    {acct.notes && <div className="text-xs text-gray-400 mt-2 italic">{acct.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HSA/FSA Tab ── */}
      {tab === 'hsa' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Total Balance: <strong className="text-green-600">${hsaFsa.totalBalance.toLocaleString('en-US', {maximumFractionDigits: 0})}</strong>
              <span className="ml-3 text-gray-400 text-xs">2024 HSA limit: ${HSA_LIMIT_2024.toLocaleString()} · FSA limit: ${FSA_LIMIT_2024.toLocaleString()}</span>
            </div>
            <button onClick={() => setModal('hsa')} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Account
            </button>
          </div>

          {hsaFsa.items.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              No HSA/FSA accounts added yet.
              <br /><button onClick={() => setModal('hsa')} className="text-blue-600 mt-2">Add your first account</button>
            </div>
          ) : (
            <div className="space-y-4">
              {hsaFsa.items.map(acct => {
                const limit = acct.contribution_limit || (acct.account_type === 'HSA' ? HSA_LIMIT_2024 : FSA_LIMIT_2024);
                const pct = limit > 0 ? Math.min((acct.contribution_ytd / limit) * 100, 100) : 0;
                const [showTxns, setShowTxns] = useState(false);
                const [txnForm, setTxnForm] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), description: '', category: 'Medical' });

                return (
                  <div key={acct.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-bold text-lg">{acct.account_type}</span>
                        {acct.institution && <span className="text-sm text-gray-500 ml-2">· {acct.institution}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-600">${acct.balance.toLocaleString('en-US', {maximumFractionDigits: 2})}</div>
                          <div className="text-xs text-gray-400">Balance</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setModal({ edit: acct, type: 'hsa' })} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                          <button onClick={async () => { if(confirm('Delete account?')) { await api.delete(`/investments/hsa-fsa/${acct.id}`); load(); }}} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>YTD Contributions</span>
                        <span>${acct.contribution_ytd.toLocaleString()} / ${limit.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full progress-bar" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <button onClick={() => setShowTxns(v => !v)} className="text-sm text-blue-600">
                      {showTxns ? 'Hide' : 'Show'} transactions ({acct.transactions?.length || 0})
                    </button>

                    {showTxns && (
                      <div className="mt-3 space-y-3">
                        <form className="flex flex-wrap gap-2 items-end" onSubmit={async e => {
                          e.preventDefault();
                          await api.post(`/investments/hsa-fsa/${acct.id}/transactions`, txnForm);
                          setTxnForm({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), description: '', category: 'Medical' });
                          load();
                        }}>
                          <div><label className="label text-xs">Date</label>
                            <input type="date" className="input py-1 text-sm" value={txnForm.date}
                              onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))} /></div>
                          <div><label className="label text-xs">Amount ($)</label>
                            <input type="number" step="0.01" className="input py-1 w-24 text-sm" value={txnForm.amount}
                              onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} required /></div>
                          <div><label className="label text-xs">Category</label>
                            <select className="input py-1 text-sm" value={txnForm.category}
                              onChange={e => setTxnForm(f => ({ ...f, category: e.target.value }))}>
                              {HSA_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select></div>
                          <div className="flex-1"><label className="label text-xs">Description</label>
                            <input type="text" className="input py-1 text-sm" value={txnForm.description}
                              onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="Doctor visit, prescription..." /></div>
                          <button type="submit" className="btn-primary py-1.5 text-sm">Log</button>
                        </form>

                        {acct.transactions?.length > 0 && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {acct.transactions.map(t => (
                              <div key={t.id} className="flex items-center justify-between py-2 text-sm">
                                <div>
                                  <span className="font-medium">{t.description || t.category}</span>
                                  <span className="text-xs text-gray-400 ml-2">{t.date}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-green-700">${t.amount.toFixed(2)}</span>
                                  <button onClick={async () => { await api.delete(`/investments/hsa-fsa/transactions/${t.id}`); load(); }}
                                    className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {(modal === 'stock' || modal?.type === 'stock') && (
        <Modal title={modal?.edit ? 'Edit Holding' : 'Add Stock Holding'} onClose={() => setModal(null)} size="lg">
          <StockForm initial={modal?.edit} onSave={handleSaveStock} onClose={() => setModal(null)} />
        </Modal>
      )}
      {(modal === 'retirement' || modal?.type === 'retirement') && (
        <Modal title={modal?.edit ? 'Edit Retirement Account' : 'Add Retirement Account'} onClose={() => setModal(null)} size="lg">
          <RetirementForm initial={modal?.edit} onSave={handleSaveRetirement} onClose={() => setModal(null)} />
        </Modal>
      )}
      {(modal === 'hsa' || modal?.type === 'hsa') && (
        <Modal title={modal?.edit ? 'Edit HSA/FSA Account' : 'Add HSA/FSA Account'} onClose={() => setModal(null)}>
          <HsaFsaForm initial={modal?.edit} onSave={handleSaveHsa} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
