#!/bin/bash
# scripts/run_seed.sh

set -e

echo "🔐 OMS Database Seed Script"
echo "=============================="

# CRITICAL: Prevent running in production
if [ "$NODE_ENV" = "production" ]; then
    echo ""
    echo "❌❌❌ CRITICAL ERROR ❌❌❌"
    echo "Seed scripts are FORBIDDEN in production environments!"
    echo "This would create test accounts with weak security."
    echo ""
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo "❌ ERROR: .env file not found"
    exit 1
fi

# Validate database connection
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set"
    exit 1
fi

# Check for production-like domains
if [[ "$PUBLIC_SUPABASE_URL" == *"prod"* ]] || [[ "$PUBLIC_SUPABASE_URL" == *"production"* ]]; then
    echo ""
    echo "⚠️  WARNING: Detected production-like Supabase URL"
    echo "URL: $PUBLIC_SUPABASE_URL"
    echo ""
    read -p "Are you ABSOLUTELY SURE this is a dev database? (type 'dev-only'): " confirm
    
    if [ "$confirm" != "dev-only" ]; then
        echo "Aborted for safety."
        exit 1
    fi
fi

echo ""
echo "⚠️  WARNING: This will reset your database and create test data."
echo "Environment: ${NODE_ENV:-development}"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Generate secure random password for admin user
ADMIN_PASSWORD=$(openssl rand -base64 32)

echo ""
echo "🔄 Running migrations..."
npm run supabase:migrate:push

echo ""
echo "🌱 Seeding database..."

# Create admin user with secure password
# Adapting to use psql with DATABASE_URL
psql "$DATABASE_URL" <<SQL
-- Delete existing test data (development only)
-- Note: Assuming auth.users is the table, but direct access might be restricted.
-- In Supabase local dev, we might be able to access it via postgres role.

-- Create admin user with generated password (using Supabase auth.users structure if possible, or just profiles if using custom auth)
-- Since this is Supabase, we should ideally use supabase auth API, but psql is requested.
-- Warning: Inserting directly into auth.users requires pgcrypto extension and knowing the schema.

-- Checking extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert into auth.users (simplified for seed)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'admin@reclamefabriek.test',
    crypt('${ADMIN_PASSWORD}', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"username": "admin", "full_name": "System Administrator", "primary_section": "ADMIN", "roles": {"Admin": "SuperAdmin"}}',
    now(),
    now()
) ON CONFLICT (email) DO NOTHING;

-- We don't need to insert into profiles manually because of the handle_new_user trigger

SQL

echo ""
echo "✅ Database seeded successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 ADMIN CREDENTIALS (save these securely):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Username: admin"
echo "Password: ${ADMIN_PASSWORD}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  Store this password in a password manager."
echo "⚠️  Other test users have randomized passwords."
echo ""