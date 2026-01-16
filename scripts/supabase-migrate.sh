#!/bin/bash
# Script to help manage Supabase migrations

set -e

# Function to create a new migration
create_migration() {
    if [ $# -eq 0 ]; then
        echo "Usage: $0 create <migration_name>"
        exit 1
    fi

    migration_name=$1
    timestamp=$(date +%Y%m%d%H%M%S)
    filename="$timestamp""_$migration_name"".sql"
    
    echo "Creating migration: supabase/migrations/$filename"
    touch "supabase/migrations/$filename"
    
    echo "-- Migration: $migration_name
-- Description: Add your migration SQL here

-- UP
-- Add your migration SQL statements here


-- DOWN (optional)
-- Add rollback statements here if needed
" > "supabase/migrations/$filename"

    echo "Created migration file: supabase/migrations/$filename"
}

# Function to list pending migrations
list_migrations() {
    echo "Local migration files:"
    ls -la supabase/migrations/ | tail -n +2
    
    if [ -f "supabase/.branches/main/migrations.log" ]; then
        echo -e "\nApplied migrations:"
        cat supabase/.branches/main/migrations.log 2>/dev/null || echo "No migrations log found"
    else
        echo -e "\nNo local migrations log found. Run 'supabase db reset' to initialize."
    fi
}

# Function to push local migrations to remote
push_to_remote() {
    echo "Pushing local migrations to remote database..."
    
    if [ -z "$SUPABASE_PROJECT_ID" ] || [ -z "$SUPABASE_DB_PASSWORD" ]; then
        echo "Error: Environment variables SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD must be set"
        echo "Or use the GitHub Actions workflow for remote deployment"
        exit 1
    fi
    
    supabase link --project-ref $SUPABASE_PROJECT_ID
    supabase db remote set --password $SUPABASE_DB_PASSWORD
    supabase db push
    
    echo "Migrations pushed to remote database successfully!"
}

# Main script logic
case "$1" in
    "create")
        create_migration "$2"
        ;;
    "list")
        list_migrations
        ;;
    "push")
        push_to_remote
        ;;
    *)
        echo "Usage: $0 {create|list|push}"
        echo "  create <name>  - Create a new migration file with timestamp"
        echo "  list          - List local and applied migrations"
        echo "  push          - Push local migrations to remote database (requires env vars)"
        exit 1
        ;;
esac