# Smart Finance Tool (Finance IQ)

A full-stack, enterprise-grade financial intelligence and scenario planning platform. Built with a decoupled **React + Vite** frontend and **Django + Django REST Framework** backend with an **SQLite** database and **JWT** authentication.

---

## 1. Project Architecture

```
smart-finance-Tool/
│
├── frontend/                     # React + Vite Client Application
│   ├── src/
│   │   ├── components/           # Reusable UI widgets, AppShell, KPI cards
│   │   ├── routes/               # TanStack Router pages (P&L, Cashflow, Budget, Forecast, etc.)
│   │   ├── services/
│   │   │   └── api.ts            # Centralized API service with JWT interceptor & auto-refresh
│   │   ├── lib/                  # State management, calculations, active dataset provider
│   │   └── styles.css
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── .env                      # Frontend environment (VITE_API_BASE_URL)
│
├── backend/                      # Django REST Framework Backend
│   ├── manage.py
│   ├── requirements.txt
│   ├── db.sqlite3                # SQLite database with all financial models & indexes
│   ├── seed_data.py              # Initial dataset seeding script
│   ├── .env                      # Django configuration (SECRET_KEY, CORS settings)
│   │
│   ├── config/                   # Root Django configuration & URL routing
│   │   ├── settings.py
│   │   └── urls.py
│   │
│   ├── accounts/                 # User authentication, profiles, RBAC, activity logs
│   ├── organizations/            # Multi-org isolation and settings
│   ├── transactions/             # Transactions & AR/AP (Accounts Receivable/Payable)
│   ├── categories/               # Expense categories (OPEX, CAPEX, COGS)
│   ├── budgets/                  # Budget targets & variance planning
│   ├── payroll/                  # Departmental employee payroll records
│   ├── compliance/               # Tax filings (GST, TDS) & audit findings
│   ├── analytics/                # Aggregations, monthly P&L, runway, FX rates
│   └── datasets/                 # Ingested datasets, CSV batch upload & purge
│
└── README.md
```

---

## 2. Quick Start: Running the Full Stack

Run the backend and frontend in two separate terminals.

### Terminal 1: Backend (Django REST Framework)

```powershell
cd backend

# 1. Activate Python virtual environment
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# 2. Install dependencies (if first time)
pip install -r requirements.txt

# 3. Apply database migrations
python manage.py makemigrations
python manage.py migrate

# 4. Seed sample enterprise data (transactions, payroll, budgets, users)
python seed_data.py

# 5. Start the Django API server
python manage.py runserver 127.0.0.1:8000
```
> Backend runs at: **`http://127.0.0.1:8000`**  
> Admin / Test credentials created by `seed_data.py`:
> - **Admin:** `admin@financeiq.io` | Password: `Admin@12345`
> - **Google User:** `alex.chen@financeiq.io` | Password: `Alex@12345`

---

### Terminal 2: Frontend (React + Vite)

```powershell
# Open a second terminal:
cd frontend

# 1. Install dependencies
npm install

# 2. Run the Vite development server
npm run dev
```
> Frontend runs at: **`http://localhost:5173`** (or `http://localhost:8080`)

---

## 3. REST API Documentation

All endpoints (except `/api/auth/login/` and `/api/auth/register/`) require a Bearer token:
`Authorization: Bearer <access_token>`

### Authentication (`/api/auth/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login/` | Obtain JWT access and refresh tokens |
| `POST` | `/api/auth/refresh/` | Refresh expired access token |
| `POST` | `/api/auth/register/` | Register new user and organization |
| `POST` | `/api/auth/google/` | Google OAuth / SSO profile authentication |
| `GET` | `/api/auth/profile/` | Get current user profile and role |
| `PATCH` | `/api/auth/profile/` | Update profile information |
| `GET` | `/api/auth/users/` | Directory of system users (Admin / Manager / Auditor / Viewer) |
| `GET/POST` | `/api/auth/activity-logs/` | Real-time audit activity log |

### Datasets (`/api/datasets/`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/datasets/` | List all ingested datasets |
| `GET` | `/api/datasets/data/?source_file=...` | Retrieve coalesced dataset rows (`t`, `p`, `b`, `a`) |
| `POST` | `/api/datasets/upload/batch/` | Ingest batch rows (transactions, payroll, budgets, AR/AP) |
| `DELETE` | `/api/datasets/purge/{source_file}/` | Purge a dataset and cascade-delete its records |

### Financial Records
| Method | Endpoint | Description |
|---|---|---|
| `GET, POST` | `/api/transactions/` | List and create financial transactions |
| `GET, PUT, DEL` | `/api/transactions/{id}/` | Retrieve, update, or delete transaction |
| `GET, POST` | `/api/transactions/arap/` | Accounts Receivable and Accounts Payable |
| `GET, POST` | `/api/budgets/` | Budget targets by category and month |
| `GET, POST` | `/api/categories/` | Custom expense categories |
| `GET, POST` | `/api/payroll/` | Departmental payroll records |
| `GET, POST` | `/api/compliance/filings/` | Tax and regulatory filings (GST, TDS, Corporate Tax) |
| `GET, POST` | `/api/compliance/findings/` | AI-assisted audit findings and risk flags |

### Analytics (`/api/analytics/`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/dashboard/` | Core KPIs: Total Revenue, OPEX, Net Profit, Runway (months), Cash |
| `GET` | `/api/analytics/monthly/` | Month-by-month financial summary |
| `GET` | `/api/analytics/categories/` | Expense distribution by category |
| `GET` | `/api/analytics/fx/` | Multi-currency FX conversion rates (INR, USD, EUR, GBP, AED, SGD) |

---

## 4. Key Architectural Features

1. **High-Precision Financial Data:** All financial figures use `DecimalField(max_digits=15, decimal_places=2)` in Django models to prevent floating-point rounding errors.
2. **Tenant Isolation:** Every financial record is linked to a user and organization (`user_id` / `org_id`), enforcing complete multi-tenant security at the ORM layer.
3. **Resilient Offline/Demo Support:** The frontend includes automatic fallback capabilities if the backend is temporarily unreachable, ensuring seamless testing and review.
4. **JWT Auto-Refresh:** The frontend API service (`src/services/api.ts`) transparently detects expired access tokens on `401 Unauthorized` responses and refreshes them via `/api/auth/refresh/` without interrupting the user.
