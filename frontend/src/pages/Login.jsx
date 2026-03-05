import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, Eye, EyeOff, Lock } from 'lucide-react';

export default function Login() {
  const { hasUser, login, setup } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSetup = !hasUser;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (isSetup && pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      if (isSetup) await setup(pin);
      else await login(pin);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <DollarSign className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">FinanceMe</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Your personal finance manager</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isSetup ? 'Create Your PIN' : 'Enter Your PIN'}
            </h2>
          </div>

          {isSetup && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              Set up a PIN to protect your financial data. This is stored locally on your device.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  placeholder={isSetup ? 'Create a PIN (min 4 chars)' : 'Enter your PIN'}
                  className="input pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isSetup && (
              <div>
                <label className="label">Confirm PIN</label>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                  placeholder="Repeat your PIN"
                  className="input"
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? 'Please wait...' : isSetup ? 'Create PIN & Get Started' : 'Unlock'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            All data is stored locally on your device. No cloud sync.
          </p>
        </div>
      </div>
    </div>
  );
}
