import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, DollarSign, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { format, addMonths } from 'date-fns';

const DEBT_TYPES = ['Credit Card', 'Student Loan', 'Auto Loan', 'Personal Loan', 'Medical', 'Other'];
const TYPE_COLORS = {
  'Credit Card': 'bg-purple-100 text-purple-700', 'Student Loan': 'bg-blue-100 text-blue-700',
  'Auto Loan': 'bg-orange-100 text-orange-700', 'Personal Loan': 'bg-yellow-100 text-yellow-700',
  'Medical': 'bg-pink-100 text-pink-700', 'Other': 'bg-gray-100 text-gray-700',
};

function DebtForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', debt_type: 'Credit Card', original_amount: '', current_balance: '',
    interest_rate: '', minimum_payment: '', due_day: '', institution: '', notes: '',
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
      <div><label className="label">Debt Name</label>
        <input type="text" className="input" value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Chase Sapphire, Student Loan..." required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Type</label>
          <select className="input" value={form.debt_type} onChange={e => set('debt_type', e.target.value)}>
            {DEBT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="label">Institution</label>
          <input type="text" className="input" value={form.institution} onChange={e => set('institution', e.target.value)}
            placeholder="Chase, Sallie Mae..." /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Original Amount ($)</label>
          <input type="number" step="0.01" className="input" value={form.original_amount}
            onChange={e => set('original_amount', e.target.value)} required /></div>
        <div><label className="label">Current Balance ($)</label>
          <input type="number" step="0.01" className="input" value={form.current_balance}
            onChange={e => set('current_balance', e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">Interest Rate (%)</label>
          <input type="number" step="0.01" className="input" value={form.interest_rate}
            onChange={e => set('interest_rate', e.target.value)} placeholder="19.99" /></div>
        <div><label className="label">Min. Payment ($)</label>
          <input type="number" step="0.01" className="input" value={form.minimum_payment}
            onChange={e => set('minimum_payment', e.target.value)} /></div>
        <div><label className="label">Due Day</label>
          <input type="number" min="1" max="31" className="input" value={form.due_day}
            onChange={e => set('due_day', e.target.value)} placeholder="15" /></div>
      </div>
      <div><label className="label">Notes</label>
        <input type="text" className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : initial ? 'Update' : 'Add Debt'}</button>
      </div>
    </form>
  );
}

function PaymentForm({ debt, onSave, onClose }) {
  const [form, setForm] = useState({ amount: debt.minimum_payment || '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">
        <div className="font-medium text-gray-900 dark:text-white">{debt.name}</div>
        <div className="text-gray-500">Balance: ${debt.current_balance.toFixed(2)} · {debt.interest_rate}% APR</div>
      </div>
      <div><label className="label">Payment Amount ($)</label>
        <input type="number" step="0.01" className="input" value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required /></div>
      <div><label className="label">Payment Date</label>
        <input type="date" className="input" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
      <div><label className="label">Notes (optional)</label>
        <input type="text" className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Recording...' : 'Record Payment'}</button>
      </div>
    </form>
  );
}

export default function Debts() {
  const [debts, setDebts] = useState({ items: [], summary: { totalDebt: 0, totalMinimum: 0, avgInterestRate: 0 } });
  const [modal, setModal] = useState(null);
  const [showPaid, setShowPaid] = useState(false);
  const [strategy, setStrategy] = useState('avalanche'); // avalanche | snowball

  const load = () => {
    api.get(`/debts?active_only=${!showPaid}`).then(r => setDebts(r.data));
  };

  useEffect(load, [showPaid]);

  const handleSaveDebt = async form => {
    if (modal?.edit) await api.put(`/debts/${modal.edit.id}`, form);
    else await api.post('/debts', form);
    load();
  };

  const handlePayment = async form => {
    await api.post(`/debts/${modal.debt.id}/payments`, form);
    load();
  };

  const handleDelete = async id => {
    if (!confirm('Delete this debt and all payment history?')) return;
    await api.delete(`/debts/${id}`);
    load();
  };

  const handleMarkPaidOff = async id => {
    if (!confirm('Mark this debt as fully paid off?')) return;
    await api.post(`/debts/${id}/payoff`);
    load();
  };

  // Strategy ordering
  const sortedDebts = [...debts.items].sort((a, b) => {
    if (strategy === 'avalanche') return b.interest_rate - a.interest_rate; // highest rate first
    return a.current_balance - b.current_balance; // lowest balance first (snowball)
  });

  const payoffDate = debt => {
    if (!debt.monthsToPayoff) return 'N/A';
    return format(addMonths(new Date(), debt.monthsToPayoff), 'MMM yyyy');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Debt Tracker</h1>
        <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Debt
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs text-gray-500">Total Debt</div>
          <div className="text-2xl font-bold text-red-600">${debts.summary.totalDebt.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Monthly Minimums</div>
          <div className="text-2xl font-bold text-orange-600">${debts.summary.totalMinimum.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Avg Interest Rate</div>
          <div className="text-2xl font-bold text-gray-800 dark:text-white">{debts.summary.avgInterestRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Strategy selector */}
      {debts.items.length > 1 && (
        <div className="card">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Payoff Strategy</div>
          <div className="flex gap-3">
            <button onClick={() => setStrategy('avalanche')}
              className={`flex-1 p-3 rounded-lg border-2 text-sm text-left transition-all ${strategy === 'avalanche' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="font-medium">Debt Avalanche</div>
              <div className="text-xs text-gray-500 mt-0.5">Highest interest rate first — saves the most money</div>
            </button>
            <button onClick={() => setStrategy('snowball')}
              className={`flex-1 p-3 rounded-lg border-2 text-sm text-left transition-all ${strategy === 'snowball' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="font-medium">Debt Snowball</div>
              <div className="text-xs text-gray-500 mt-0.5">Lowest balance first — quick psychological wins</div>
            </button>
          </div>
        </div>
      )}

      {/* Debt list */}
      {debts.items.length === 0 ? (
        <div className="card text-center py-16">
          <TrendingDown className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">No debts tracked. Add debts to monitor your payoff progress.</p>
          <button onClick={() => setModal('add')} className="btn-primary">Add Your First Debt</button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDebts.map((debt, idx) => (
            <div key={debt.id} className={`card ${!debt.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3 gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {debts.items.length > 1 && strategy && (
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-white">{debt.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[debt.debt_type] || 'bg-gray-100 text-gray-700'}`}>
                        {debt.debt_type}
                      </span>
                      {!debt.is_active && <span className="badge-green text-xs">Paid Off!</span>}
                    </div>
                    {debt.institution && <div className="text-xs text-gray-400 mt-0.5">{debt.institution}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-xl text-red-600">${debt.current_balance.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
                    <div className="text-xs text-gray-400">of ${debt.original_amount.toLocaleString('en-US', {maximumFractionDigits: 0})} original</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setModal({ edit: debt })} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(debt.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-gradient-to-r from-red-400 to-green-400 rounded-full transition-all"
                  style={{ width: `${debt.paidOffPercent}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mb-3">
                <span>{debt.paidOffPercent.toFixed(1)}% paid off</span>
                <span className="text-green-600">${debt.totalPaid.toFixed(0)} paid total</span>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                {debt.interest_rate > 0 && (
                  <div><span className="text-gray-400">APR</span> <strong className="text-red-500">{debt.interest_rate}%</strong></div>
                )}
                {debt.minimum_payment > 0 && (
                  <div><span className="text-gray-400">Min/mo</span> <strong>${debt.minimum_payment.toFixed(0)}</strong></div>
                )}
                {debt.due_day && (
                  <div>
                    <span className="text-gray-400">Due</span> <strong>Day {debt.due_day}</strong>
                    {new Date().getDate() > debt.due_day - 3 && new Date().getDate() <= debt.due_day && (
                      <AlertTriangle className="inline w-3 h-3 text-yellow-500 ml-1" />
                    )}
                  </div>
                )}
                {debt.monthsToPayoff && (
                  <div><span className="text-gray-400">Est. payoff</span> <strong>{payoffDate(debt)}</strong> ({debt.monthsToPayoff} mo)</div>
                )}
              </div>

              {debt.is_active && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => setModal({ debt })} className="btn-primary text-sm py-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Record Payment
                  </button>
                  {debt.current_balance <= 0.01 && (
                    <button onClick={() => handleMarkPaidOff(debt.id)} className="btn-success text-sm py-1.5 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Paid Off
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show/hide paid off */}
      <button onClick={() => setShowPaid(v => !v)} className="text-sm text-blue-600">
        {showPaid ? 'Hide paid-off debts' : 'Show paid-off debts'}
      </button>

      {/* Modals */}
      {(modal === 'add' || modal?.edit) && !modal?.debt && (
        <Modal title={modal?.edit ? 'Edit Debt' : 'Add Debt'} onClose={() => setModal(null)} size="lg">
          <DebtForm initial={modal?.edit} onSave={handleSaveDebt} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.debt && (
        <Modal title={`Record Payment — ${modal.debt.name}`} onClose={() => setModal(null)}>
          <PaymentForm debt={modal.debt} onSave={handlePayment} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
