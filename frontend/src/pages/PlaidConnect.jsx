import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import {
  Link2, RefreshCw, Trash2, Check, AlertCircle, Building2,
  CreditCard, Landmark, TrendingUp, Wallet, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import api from '../api/client';

const ACCOUNT_TYPE_ICON = {
  depository: Landmark,
  credit: CreditCard,
  investment: TrendingUp,
  loan: Wallet,
};

const ACCOUNT_TYPE_COLOR = {
  depository: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  credit: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
  investment: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  loan: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
};

// ─── Connect new bank ─────────────────────────────────────────────────────────

function PlaidLinkButton({ onSuccess, disabled }) {
  const [linkToken, setLinkToken] = useState(null);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    api.post('/plaid/create-link-token')
      .then(r => setLinkToken(r.data.link_token))
      .catch(err => setTokenError(err.response?.data?.error || 'Failed to initialize Plaid'));
  }, []);

  const onPlaidSuccess = useCallback((public_token, metadata) => {
    onSuccess(public_token, metadata.institution);
  }, [onSuccess]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess: onPlaidSuccess });

  if (tokenError) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {tokenError}
      </div>
    );
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || disabled}
      className="btn-primary flex items-center gap-2 px-5 py-2.5"
    >
      <Link2 className="w-4 h-4" />
      {ready ? 'Connect a Bank Account' : 'Loading…'}
    </button>
  );
}

// ─── Re-authenticate existing bank ───────────────────────────────────────────

function ReauthButton({ itemId, institutionName, onSuccess }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchToken = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/plaid/reauth/${itemId}`);
      setLinkToken(res.data.link_token);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start re-authentication');
      setLoading(false);
    }
  };

  const onPlaidSuccess = useCallback(() => {
    setLinkToken(null);
    setLoading(false);
    onSuccess(itemId);
  }, [itemId, onSuccess]);

  const onPlaidExit = useCallback(() => {
    setLinkToken(null);
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // Auto-open once token is ready
  useEffect(() => {
    if (ready && linkToken) {
      open();
    }
  }, [ready, linkToken, open]);

  if (error) {
    return (
      <span className="text-xs text-red-600">{error}</span>
    );
  }

  return (
    <button
      onClick={fetchToken}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60"
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      {loading ? 'Opening…' : 'Fix Connection'}
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'reauth_required') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Needs re-login
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
      <ShieldCheck className="w-3 h-3" />
      Connected
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlaidConnect() {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const loadAccounts = async () => {
    try {
      const res = await api.get('/plaid/accounts');
      setInstitutions(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load connected accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const handlePlaidSuccess = async (public_token, institution) => {
    setConnecting(true);
    setError('');
    try {
      await api.post('/plaid/exchange-token', { public_token, institution });
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to connect account');
    } finally {
      setConnecting(false);
    }
  };

  // Called after successful re-authentication — just sync to reset status
  const handleReauthSuccess = async (item_id) => {
    setSyncing(item_id);
    setSyncResult(null);
    setError('');
    try {
      const res = await api.post('/plaid/sync', { item_id });
      setSyncResult({ item_id, added: res.data.added, errors: res.data.errors });
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Sync after re-auth failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleSync = async (item_id) => {
    setSyncing(item_id);
    setSyncResult(null);
    setError('');
    try {
      const res = await api.post('/plaid/sync', { item_id });
      setSyncResult({ item_id, added: res.data.added, errors: res.data.errors });
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncing('all');
    setSyncResult(null);
    setError('');
    try {
      const res = await api.post('/plaid/sync', {});
      setSyncResult({ item_id: 'all', added: res.data.added, errors: res.data.errors });
      await loadAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleDisconnect = async (item_id, name) => {
    if (!confirm(`Disconnect ${name}? This won't delete already-imported transactions.`)) return;
    try {
      await api.delete(`/plaid/accounts/${item_id}`);
      setInstitutions(prev => prev.filter(i => i.item_id !== item_id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect');
    }
  };

  const reauthCount = institutions.filter(i => i.status === 'reauth_required').length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-header">Connected Bank Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link your banks via Plaid to automatically sync transactions — no manual CSV downloads needed.
          </p>
        </div>
        {institutions.length > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncing !== null}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing === 'all' ? 'animate-spin' : ''}`} />
            Sync All
          </button>
        )}
      </div>

      {/* Re-auth summary alert */}
      {reauthCount > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">
              {reauthCount} bank connection{reauthCount !== 1 ? 's need' : ' needs'} re-authentication
            </p>
            <p className="text-red-700 dark:text-red-400 mt-0.5">
              Your login credentials changed or the session expired. Click "Fix Connection" below to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          syncResult.errors?.length
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        }`}>
          <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-gray-900 dark:text-white">
              Synced {syncResult.added} new transaction{syncResult.added !== 1 ? 's' : ''}
            </p>
            {syncResult.errors?.length > 0 && (
              <p className="text-yellow-700 dark:text-yellow-400 mt-1">{syncResult.errors.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Connect button */}
      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">Add a bank</p>
          <p className="text-sm text-gray-500 mt-0.5">Supports Chase, Amex, Discover, Citi, Fifth Third, Trustco & 12,000+ institutions</p>
        </div>
        <PlaidLinkButton onSuccess={handlePlaidSuccess} disabled={connecting} />
      </div>

      {/* Connected institutions */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : institutions.length === 0 ? (
        <div className="card text-center py-14">
          <Building2 className="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 font-medium">No banks connected yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "Connect a Bank Account" above to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {institutions.map(inst => {
            const needsReauth = inst.status === 'reauth_required';
            const hasError = inst.status === 'error';
            return (
              <div
                key={inst.item_id}
                className={`card space-y-4 ${needsReauth ? 'border-red-200 dark:border-red-800' : ''}`}
              >
                {/* Institution header */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      needsReauth
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      <Building2 className={`w-5 h-5 ${needsReauth ? 'text-red-600' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-white">{inst.institution_name}</p>
                        <StatusBadge status={inst.status} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {inst.accounts.length} account{inst.accounts.length !== 1 ? 's' : ''} ·{' '}
                        {inst.last_synced
                          ? `Last synced ${new Date(inst.last_synced + 'Z').toLocaleDateString()}`
                          : 'Never synced'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {needsReauth ? (
                      <ReauthButton
                        itemId={inst.item_id}
                        institutionName={inst.institution_name}
                        onSuccess={handleReauthSuccess}
                      />
                    ) : (
                      <button
                        onClick={() => handleSync(inst.item_id)}
                        disabled={syncing !== null}
                        className="btn-secondary text-sm py-1.5 flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing === inst.item_id ? 'animate-spin' : ''}`} />
                        {syncing === inst.item_id ? 'Syncing…' : 'Sync'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(inst.item_id, inst.institution_name)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Reauth warning detail */}
                {(needsReauth || hasError) && inst.error_message && (
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                    needsReauth
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {inst.error_message}
                  </div>
                )}

                {/* Account list */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700 -mx-5 px-5">
                  {inst.accounts.map(acct => {
                    const Icon = ACCOUNT_TYPE_ICON[acct.type] || Wallet;
                    const colorClass = ACCOUNT_TYPE_COLOR[acct.type] || 'text-gray-600 bg-gray-100';
                    return (
                      <div key={acct.account_id} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{acct.name}</p>
                            {acct.official_name && acct.official_name !== acct.name && (
                              <p className="text-xs text-gray-400">{acct.official_name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-xs text-gray-400 capitalize">{acct.subtype || acct.type}</span>
                          {acct.mask && (
                            <span className="text-xs font-mono text-gray-500">••••{acct.mask}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info section */}
      <div className="card bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">About Plaid</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
          <li>• Plaid is used by Venmo, Robinhood, and thousands of apps to securely connect bank accounts</li>
          <li>• Your bank credentials are never stored — Plaid authenticates directly with your bank</li>
          <li>• Free for personal use (Development tier: up to 100 accounts)</li>
          <li>• Supports checking, savings, credit cards, and investment accounts</li>
          <li>• Set <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">PLAID_CLIENT_ID</code>, <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">PLAID_SECRET</code>, and <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">PLAID_ENV</code> in your <code>.env</code> file</li>
        </ul>
      </div>
    </div>
  );
}
