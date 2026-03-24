#!/bin/bash
# migrate_to_supabase.sh

set -e  # Exit on any error

echo "Starting migration to Supabase..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed."
    echo "Please install it with: npm install -g supabase"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "supabase/config.toml" ]; then
    echo "Error: This script must be run from the OMS project root directory."
    exit 1
fi

echo "Checking Supabase project link..."
if [ ! -f ".supabase/project-ref" ]; then
    echo "No project linked. Please run: supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
else
    PROJECT_REF=$(cat .supabase/project-ref)
    echo "Linked to project: $PROJECT_REF"
fi

echo "Applying database migrations..."
supabase db push

echo "Migration completed successfully!"

echo ""
echo "Next steps:"
echo "1. Set up your environment variables in .env:"
echo "   - PUBLIC_SUPABASE_URL=http://reclame-supabase.local:8000"
echo "   - PUBLIC_SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "2. Build and deploy to K3s cluster:"
echo "   docker build -t slaff/reclame-oms:latest ."
echo "   kubectl apply -f k8s/oms-deployment.yaml"