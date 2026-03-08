import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Plus, Receipt, BarChart3, CreditCard } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home', exact: true },
  { to: '/expenses', icon: CreditCard, label: 'Expenses' },
  { to: '/bills', icon: Receipt, label: 'Bills' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.slice(0, 2).map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-1 rounded-xl text-xs font-medium transition-all ${
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}

        {/* Center add button */}
        <NavLink
          to="/expenses"
          className="flex flex-col items-center justify-center w-12 h-12 bg-blue-600 rounded-full shadow-lg -mt-4"
        >
          <Plus className="w-6 h-6 text-white" />
        </NavLink>

        {navItems.slice(2).map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-1 rounded-xl text-xs font-medium transition-all ${
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
