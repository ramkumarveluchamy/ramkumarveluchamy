import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, TrendingUp, CreditCard, Receipt, Home, GraduationCap,
  PieChart, BarChart3, LogOut, Moon, Sun, DollarSign, TrendingDown,
  Upload, Wallet, Wrench
} from 'lucide-react';

const navGroups = [
  {
    label: 'Overview',
    items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true }],
  },
  {
    label: 'Cash Flow',
    items: [
      { to: '/income', icon: TrendingUp, label: 'Income' },
      { to: '/expenses', icon: CreditCard, label: 'Expenses' },
      { to: '/bills', icon: Receipt, label: 'Bills' },
    ],
  },
  {
    label: 'Assets & Debts',
    items: [
      { to: '/investments', icon: Wallet, label: 'Investments & Savings' },
      { to: '/debts', icon: TrendingDown, label: 'Debt Tracker' },
      { to: '/mortgage', icon: Home, label: 'Mortgage & Housing' },
      { to: '/home-maintenance', icon: Wrench, label: 'Home Maintenance' },
      { to: '/education', icon: GraduationCap, label: 'Kids Education' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/budget', icon: PieChart, label: 'Budget Planner' },
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/import', icon: Upload, label: 'Import Statement' },
    ],
  },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed top-0 left-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-gray-700">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-gray-900 dark:text-white">FinanceMe</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Personal Finance</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map(group => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, exact }) => (
                <NavLink key={to} to={to} end={exact}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-700 space-y-1">
        <button
          onClick={toggle}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {dark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
