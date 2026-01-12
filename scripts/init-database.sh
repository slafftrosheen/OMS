#!/bin/bash

# Database Initialization Script for Reclame OMS
# This script initializes the PostgreSQL database with all necessary tables and seed data

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found. Using default values from .env.example"
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-reclame_oms}"
    DB_USER="${DB_USER:-reclame_admin}"
fi

echo "========================================"
echo "Reclame OMS Database Initialization"
echo "========================================"
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "========================================"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: PostgreSQL client (psql) is not installed"
    echo "Please install PostgreSQL client tools first"
    exit 1
fi

# Check database connection
echo "🔍 Testing database connection..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
    echo "❌ Error: Cannot connect to PostgreSQL server"
    echo "Please ensure PostgreSQL is running and credentials are correct"
    exit 1
fi

echo "✅ Database connection successful"

# Create database if it doesn't exist
echo "📦 Checking if database exists..."
DB_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ "$DB_EXISTS" != "1" ]; then
    echo "🔨 Creating database '$DB_NAME'..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
    echo "✅ Database created successfully"
else
    echo "ℹ️  Database '$DB_NAME' already exists"
fi

# Run migrations
echo ""
echo "🚀 Running database migrations..."
echo "========================================"

for migration in src/lib/server/db/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "📄 Applying: $(basename $migration)"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration" -q
        echo "✅ $(basename $migration) applied"
    fi
done

echo ""
echo "🌱 Running database seeds..."
echo "========================================"

for seed in src/lib/server/db/seeds/*.sql; do
    if [ -f "$seed" ]; then
        echo "📄 Applying: $(basename $seed)"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$seed" -q
        echo "✅ $(basename $seed) applied"
    fi
done

echo ""
echo "========================================"
echo "✅ Database initialization complete!"
echo "========================================"
echo ""
echo "Database is ready for use. You can now run:"
echo "  npm run dev"
echo ""
