# Getting Started

This guide walks you through setting up Reclame OMS for development or production.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥18.x | LTS recommended |
| PostgreSQL | ≥14.x | Required for data storage |
| npm | ≥9.x | Comes with Node.js |

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd reclame_OMS
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reclame_oms
DB_USER=reclame_admin
DB_PASSWORD=your_secure_password

# Application Settings
PUBLIC_PREF_SYNC_ENDPOINT=  # Optional: External preference sync URL
```

### 3. Database Setup

#### Option A: Automated Setup (Recommended)

```bash
chmod +x scripts/init-database.sh
./scripts/init-database.sh
```

This script will:
- Create the database if it doesn't exist
- Run all migrations in order
- Seed initial data (materials, profiles, default users)

#### Option B: Manual Setup

```bash
# Create database
createdb -U postgres reclame_oms

# Run migrations manually
psql -U reclame_admin -d reclame_oms -f src/lib/server/db/migrations/001_profiles_schema.sql
psql -U reclame_admin -d reclame_oms -f src/lib/server/db/migrations/002_inventory_system.sql
# ... continue for all migration files

# Run seeds
psql -U reclame_admin -d reclame_oms -f src/lib/server/db/seeds/001_field_types.sql
# ... continue for all seed files
```

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
