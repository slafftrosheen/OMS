#!/bin/bash
# Script to seed the database with initial data

echo "Seeding the OMS database with initial data..."

# The seed script needs to be run against the remote Supabase database
# Since we can't directly execute it via the CLI, you'll need to run it manually

echo "Please run the following command to seed your database:"
echo ""
echo "supabase db remote exec < scripts/seed_database.sql --linked"
echo ""
echo "If that doesn't work, you can also run the SQL commands directly in the Supabase SQL editor at:"
echo "https://app.supabase.com/project/YOUR_PROJECT_ID/editor"
echo ""
echo "The seed script includes:"
echo "- Essential materials data for plastics, metals, colors and films"
echo "- First admin user with credentials: Slaff / Slaff181188"
echo "- Sample draft orders"
echo "- Sample profile templates"
echo "- Sample audit log entries"