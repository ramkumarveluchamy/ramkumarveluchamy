import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, X, AlertCircle, Download, Sparkles, Building2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Groceries', 'Utilities', 'Education', 'Income', 'Miscellaneous'];

const CATEGORY_COLORS = {
  Food: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Transport: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Shopping: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Entertainment: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  Health: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Groceries: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
  Utilities: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Education: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Miscellaneous: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const BANK_INSTRUCTIONS = [
  { bank: 'Chase (Credit Card)', steps: 'Chase.com → Account Activity → Download → CSV (select date range)' },
  { bank: 'Chase (Checking)', steps: 'Chase.com → See full statement → Download account activity → CSV' },
  { bank: 'Discover', steps: 'Discover.com → Statements → Download → CSV (select date range)' },
  { bank: 'Citi Costco', steps: 'Citibank.com → Account Activity → Download → CSV' },
  { bank: 'American Express', steps: 'Amex.com → Statements & Activity → Download → CSV (select range)' },
  { bank: 'Fifth Third (53)', steps: 'FifthThird.com → Accounts → Transaction History → Export → CSV' },
  { bank: 'Trustco', steps: 'TrustcoBank.com → Account → Transactions → Download → CSV' },
  { bank: 'PDF Statement', steps: 'Download your monthly PDF statement from any bank portal' },
];

export default function Import() {
  const navigate = useNavigate();
  const [step, setStep] = useState('upload'); // upload | preview | done
  const [file, setFile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [bank, setBank] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all | expense | income

  const handleFile = f => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'pdf'].includes(ext)) {
      setError('Only CSV and PDF files are supported');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('statement', file);
      const res = await api.post('/import/credit-card', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const txns = res.data.transactions.map((t, i) => ({
        ...t,
        _id: i,
        category: t.suggested_category || 'Miscellaneous',
        type: t.type || 'expense',
      }));
      setTransactions(txns);
      setSelected(new Set(txns.map((_, i) => i)));
      setSource(res.data.source);
      setBank(res.data.bank || '');
      setStep('preview');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to parse file. Check that ANTHROPIC_API_KEY is set for PDF files.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const toImport = transactions.filter((_, i) => selected.has(i));
    if (!toImport.length) return;
    setImporting(true);
    try {
      const res = await api.post('/import/confirm', {
        transactions: toImport,
        source_bank: bank,
      });
      setImportResult(res.data);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const updateCategory = (idx, cat) => {
    setTransactions(txns => txns.map((t, i) => i === idx ? { ...t, category: cat } : t));
  };

  const toggleType = idx => {
    setTransactions(txns => txns.map((t, i) =>
      i === idx ? { ...t, type: t.type === 'income' ? 'expense' : 'income' } : t
    ));
  };

  const toggleAll = () => {
    const visible = filteredTransactions.map(t => t._id);
    const allSelected = visible.every(id => selected.has(id));
    const n = new Set(selected);
    visible.forEach(id => allSelected ? n.delete(id) : n.add(id));
    setSelected(n);
  };

  const toggle = idx => setSelected(s => {
    const n = new Set(s);
    if (n.has(idx)) n.delete(idx); else n.add(idx);
    return n;
  });

  const reset = () => {
    setStep('upload'); setFile(null); setTransactions([]);
    setError(''); setSelected(new Set()); setImportResult(null);
    setBank(''); setSource(''); setFilterType('all');
  };

  const filteredTransactions = filterType === 'all'
    ? transactions
    : transactions.filter(t => t.type === filterType);

  const totalExpenses = transactions.filter((t, i) => selected.has(i) && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome = transactions.filter((t, i) => selected.has(i) && t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseCount = transactions.filter(t => t.type === 'expense').length;
  const incomeCount = transactions.filter(t => t.type === 'income').length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Import Bank Statement</h1>
          <p className="text-sm text-gray-500 mt-1">Upload CSV or PDF — auto-detects your bank and categorizes transactions</p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Start Over</button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['upload', 'preview', 'done'].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 ${step === s ? 'text-blue-600 font-medium' : step === 'done' || (step === 'preview' && i === 0) ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : step === 'done' || (step === 'preview' && i === 0) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {(step === 'done' || (step === 'preview' && i === 0)) ? '✓' : i + 1}
              </div>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 2 && <div className="h-px w-8 bg-gray-200" />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Upload Step ── */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
              : file ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv,.pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            {file ? (
              <>
                <FileText className="w-14 h-14 mx-auto text-green-500 mb-3" />
                <p className="font-semibold text-green-700 dark:text-green-400 text-lg">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : (
              <>
                <Upload className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-700 dark:text-gray-300 font-medium text-lg">Drop your bank statement here</p>
                <p className="text-gray-400 text-sm mt-2">or click to browse · Supports Chase, Discover, Amex, Citi, Fifth Third, Trustco & more</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <span className="badge-blue">CSV</span>
                  <span className="badge-gray">PDF</span>
                </div>
              </>
            )}
          </div>

          {/* AI badge */}
          <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-sm text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <div>
              <strong>Smart Detection:</strong> CSV files from your banks are auto-detected and parsed instantly — no AI needed.
              PDF statements use Claude AI (Haiku, ~$0.01/import).
              Set <code className="bg-purple-100 dark:bg-purple-800/50 px-1 rounded">ANTHROPIC_API_KEY</code> in <code>.env</code> for PDF support.
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button onClick={handleUpload} disabled={!file || loading} className="btn-primary w-full py-3 text-base">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                {file?.name.endsWith('.pdf') ? 'AI is reading your statement...' : 'Detecting bank & parsing...'}
              </span>
            ) : 'Parse Statement'}
          </button>

          {/* Bank instructions */}
          <div className="card">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Download className="w-4 h-4" /> How to download your statement
            </h3>
            <div className="space-y-2">
              {BANK_INSTRUCTIONS.map(b => (
                <div key={b.bank} className="flex gap-3 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-36 flex-shrink-0">{b.bank}</span>
                  <span className="text-gray-500 dark:text-gray-400">{b.steps}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Step ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Bank detected + summary */}
          <div className="flex flex-wrap items-center gap-3">
            {bank && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
                <Building2 className="w-3.5 h-3.5" />
                {bank}
              </span>
            )}
            {source === 'claude_ai' && (
              <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-full">
                <Sparkles className="w-3 h-3" /> AI parsed
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            {expenseCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm">
                <ArrowDownCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700 dark:text-red-400 font-medium">{expenseCount} expenses · ${totalExpenses.toFixed(2)}</span>
              </div>
            )}
            {incomeCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl text-sm">
                <ArrowUpCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-700 dark:text-green-400 font-medium">{incomeCount} income · ${totalIncome.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Filter + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {['all', 'expense', 'income'].map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    filterType === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}>
                  {f === 'all' ? `All (${transactions.length})` : f === 'expense' ? `Expenses (${expenseCount})` : `Income (${incomeCount})`}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={toggleAll} className="btn-secondary text-sm py-1.5">
                {filteredTransactions.every(t => selected.has(t._id)) ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={handleImport} disabled={importing || selected.size === 0} className="btn-primary text-sm py-1.5 flex items-center gap-1.5">
                {importing ? <><div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full" /> Importing...</> : <><Check className="w-4 h-4" /> Import {selected.size} Transactions</>}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">{error}</div>
          )}

          {/* Transaction table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input type="checkbox" checked={filteredTransactions.length > 0 && filteredTransactions.every(t => selected.has(t._id))}
                        onChange={toggleAll} className="w-4 h-4 rounded" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Description</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Category</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredTransactions.map(t => (
                    <tr key={t._id} className={`${selected.has(t._id) ? '' : 'opacity-40'} hover:bg-gray-50 dark:hover:bg-gray-800/50`}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selected.has(t._id)} onChange={() => toggle(t._id)} className="w-4 h-4 rounded" />
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <div className="truncate text-gray-900 dark:text-white font-medium">{t.description}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleType(t._id)}
                          className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
                            t.type === 'income'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {t.type === 'income' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                          {t.type === 'income' ? 'Income' : 'Expense'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={t.category}
                          onChange={e => updateCategory(t._id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.Miscellaneous}`}
                          style={{ background: 'inherit' }}
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Click type badges to toggle income/expense. Click category pills to reassign. Selected transactions will be imported.
          </p>
        </div>
      )}

      {/* ── Done Step ── */}
      {step === 'done' && (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Import Complete!</h2>
          <p className="text-gray-500 mb-2">
            Successfully imported from <strong>{bank || file?.name}</strong>
          </p>
          <div className="flex justify-center gap-4 mb-8">
            {importResult?.expenseCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <ArrowDownCircle className="w-4 h-4" /> {importResult.expenseCount} expenses
              </span>
            )}
            {importResult?.incomeCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <ArrowUpCircle className="w-4 h-4" /> {importResult.incomeCount} income
              </span>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={reset} className="btn-secondary">Import Another Statement</button>
            <button onClick={() => navigate('/expenses')} className="btn-primary">View Expenses</button>
            {importResult?.incomeCount > 0 && (
              <button onClick={() => navigate('/income')} className="btn-secondary">View Income</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
