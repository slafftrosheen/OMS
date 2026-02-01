# Getting Started

This guide walks you through setting up Reclame OMS for development or production.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥18.x | LTS recommended |
| npm | ≥9.x | Comes with Node.js |
| Supabase Account | - | For database, authentication, and storage |

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd reclame_OMS
npm install
```

### 2. Supabase Project Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Note your project URL and API keys from Settings > API
3. Enable Row Level Security (RLS) on all tables

### 3. Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase settings:

```env
# Supabase Configuration (Required)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application Settings
PUBLIC_APP_URL=http://localhost:5173
PUBLIC_APP_NAME="OMS - Order Management System"

# Optional: Email Notifications (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com
```

### 4. Database Setup

#### Option A: Using Supabase Migrations (Recommended)

Run the Supabase migration script:

```bash
chmod +x scripts/supabase-migrate.sh
./scripts/supabase-migrate.sh
```

This script will apply all database migrations to your Supabase project.

#### Option B: Manual Setup via Supabase Dashboard

1. Go to your Supabase Dashboard > SQL Editor
2. Run the migration files in order from `supabase/migrations/`
3. Run the seed script using `scripts/run_seed.sh`:

```bash
export SEED_ADMIN_PASSWORD="your_strong_password_here"
bash scripts/run_seed.sh
```

See [Supabase Migrations Guide](supabase-migrations.md) for detailed instructions.

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Default Login Credentials

For development, the following users are seeded:

| Username | Password | Role | Section |
|----------|----------|------|---------|
| `boss` | any | SuperAdmin | Admin |
| `admin` | any | SuperAdmin | Admin |
| `cnc` | any | Operator | Production |
| `sanding` | any | Operator | Production |
| `logistics` | any | StationLead | Logistics |

> ⚠️ **Security Note**: Default users accept any password in development. Update password hashes before production deployment.

## Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
reclame_OMS/
├── src/
│   ├── lib/
│   │   ├── server/db/          # Database connection & migrations
│   │   ├── auth/               # Authentication utilities
│   │   ├── users/              # User management
│   │   ├── calendar/           # Calendar & scheduling
│   │   ├── chat/               # Real-time messaging
│   │   ├── inventory/          # Inventory components
│   │   ├── orders/             # Order management
│   │   └── stores/             # Svelte stores
│   ├── routes/
│   │   ├── api/                # REST API endpoints
│   │   ├── orders/             # Order pages
│   │   ├── inventory/          # Inventory pages
│   │   ├── calendar/           # Calendar pages
│   │   └── ...
│   └── locales/                # i18n translations
├── static/                     # Static assets
├── scripts/                    # Utility scripts
└── docs/                       # Documentation
```

## Next Steps

- [Architecture Overview](./architecture.md) - Understand the system design
- [API Reference](./api-reference.md) - Explore available endpoints
- [Development Guide](./development.md) - Contributing guidelines
