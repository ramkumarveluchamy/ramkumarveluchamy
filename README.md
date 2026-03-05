# FinanceMe — Personal Finance Manager

A lightweight, privacy-first personal finance web app. All data stays on your machine — no cloud required.

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Monthly income vs expenses, donut chart, upcoming bills, recent transactions |
| **Income** | Log salary, freelance, bonuses with recurring support |
| **Expenses** | Daily expenses by category with filters |
| **Bills** | Recurring bills with paid/unpaid toggle and due-date alerts |
| **Mortgage & Housing** | Mortgage details, home maintenance log, utility tracking |
| **Kids Education** | Per-child expense tracking (tuition, supplies, extracurriculars) |
| **Budget Planner** | Category budgets with visual progress bars and overage alerts |
| **Reports** | Monthly & YTD reports with charts, CSV export |

## Tech Stack

- **Frontend**: React 18 + Tailwind CSS + Recharts (Vite)
- **Backend**: Node.js + Express REST API
- **Database**: SQLite (local file, `backend/finance.db`)
- **Auth**: PIN-based login with bcrypt + JWT
- **Deployment**: Runs fully local via `npm start`

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
# Clone / navigate to the project
cd personal-finance-app

# Install all dependencies (root + backend + frontend)
npm run install:all

# Start the app (backend on :3001, frontend on :3000)
npm start
```

Then open **http://localhost:3000** in your browser.

On first launch, you'll be prompted to set a PIN to protect your data.

### Development

```bash
npm start          # Start both servers concurrently
npm run server     # Backend only (port 3001)
npm run client     # Frontend only (port 3000)
npm run build      # Build frontend for production
```

### Production (single server)

```bash
npm run build
NODE_ENV=production node backend/server.js
# Visit http://localhost:3001
```

## Project Structure

```
├── backend/
│   ├── server.js          # Express app entry
│   ├── database.js        # SQLite setup & schema
│   ├── middleware/auth.js # JWT authentication
│   └── routes/            # API route handlers
│       ├── auth.js        # PIN login/setup
│       ├── dashboard.js   # Summary & upcoming bills
│       ├── income.js      # Income CRUD
│       ├── expenses.js    # Expenses + groceries CRUD
│       ├── bills.js       # Bills + payment toggle
│       ├── mortgage.js    # Mortgage, maintenance, utilities
│       ├── education.js   # Children + education expenses
│       ├── budgets.js     # Budget planner
│       └── reports.js     # Monthly/YTD reports + CSV export
├── frontend/
│   ├── src/
│   │   ├── api/client.js      # Axios instance with auth
│   │   ├── contexts/          # Auth + Theme providers
│   │   ├── pages/             # All page components
│   │   └── components/        # Sidebar, BottomNav, Modal, Layout
│   └── vite.config.js         # Dev proxy → :3001
└── package.json               # Root: runs both with concurrently
```

## Privacy

- No accounts, no cloud sync, no telemetry
- All data lives in `backend/finance.db` (SQLite)
- PIN is bcrypt-hashed; auth via short-lived JWT
- To back up, just copy `finance.db`

## Design

- Mobile-first responsive layout
- Bottom navigation on mobile, sidebar on desktop
- Dark mode toggle
- Color scheme: green (income), red (expenses), blue (neutral)
