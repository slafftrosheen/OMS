# GitHub Actions Setup Guide for OMS Project

## Overview

This guide explains how to set up GitHub Actions for automated deployments of the OMS project to Vercel. The project includes two workflows:

1. `vercel-deploy.yml` - Deploys to production when changes are pushed to the main branch
2. `vercel-preview.yml` - Creates preview deployments for pull requests

## Prerequisites

Before setting up GitHub Actions for Vercel deployment, ensure you have:

1. A Vercel account and project set up
2. The Vercel CLI installed locally
3. Your OMS project already deployed to Vercel once manually

## Required Secrets

You need to add the following secrets to your GitHub repository:

### 1. Get Your Vercel Credentials

First, obtain your Vercel credentials:

```bash
# Get your user token
vercel whoami
vercel tokens
```

Or generate a new token in your [Vercel dashboard](https://vercel.com/account/tokens).

### 2. Get Your Project IDs

Find your Vercel Organization ID and Project ID:

1. Go to your Vercel dashboard
2. Navigate to your OMS project
3. Access the project settings
4. Note down:
   - **Organization ID**: Found in Account Settings → Security
   - **Project ID**: Found in Project Settings → General → Project ID

### 3. Add Secrets to GitHub

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add:

| Name | Description | Example |
|------|-------------|---------|
| `VERCEL_TOKEN` | Your Vercel access token | `v1_xxx...` |
| `VERCEL_ORG_ID` | Your Vercel organization ID | `org_xxx...` |
| `VERCEL_PROJECT_ID` | Your Vercel project ID | `prj_xxx...` |

## Workflow Files

The following workflow files have been created for you:

### Production Deployment (`vercel-deploy.yml`)
Deploys to production when changes are pushed to the main branch.

### Preview Deployment (`vercel-preview.yml`)
Creates preview deployments for pull requests.

## Setting Up the Secrets

### Option 1: Using GitHub CLI
```bash
gh secret set VERCEL_TOKEN -b "your_vercel_token"
gh secret set VERCEL_ORG_ID -b "your_org_id"
gh secret set VERCEL_PROJECT_ID -b "your_project_id"
```

### Option 2: Via GitHub UI
1. Go to your GitHub repository
2. Click on "Settings"
3. Click on "Secrets and variables" → "Actions"
4. Click "New repository secret" and add each secret

## Environment Variables in Vercel

Make sure your Vercel project has the required environment variables set:

1. Go to your Vercel dashboard
2. Navigate to your OMS project
3. Go to Settings → Environment Variables
4. Add the following variables:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Testing the Workflows

### Manual Trigger
You can manually trigger the workflows to test them:

1. Go to your GitHub repository
2. Navigate to "Actions"
3. Select the workflow you want to test
4. Click "Run workflow"
5. Choose the branch to run against

### Automatic Trigger
The workflows will automatically run:
- `vercel-deploy.yml`: When pushing to the `main` branch
- `vercel-preview.yml`: When opening or updating a pull request to the `main` branch

## Troubleshooting

### Common Issues:

1. **Permission Errors**: Ensure your GitHub secrets are correctly set and have the right permissions
2. **Build Failures**: Check that all required environment variables are set in Vercel
3. **Workflow Failures**: Check the GitHub Actions logs for specific error messages

### Verifying Setup:

1. Make a small change to your code
2. Create a pull request
3. Check if the preview deployment workflow runs
4. Merge the PR to main
5. Check if the production deployment workflow runs

## Security Best Practices

- Never commit sensitive information directly in the workflow files
- Use GitHub secrets for all sensitive data
- Regularly rotate your Vercel tokens
- Limit the scope of your tokens to only necessary permissions

## Next Steps

Once your GitHub Actions are set up and tested:

1. Test the complete setup (see testing guide)
2. Monitor your deployments for any issues
3. Set up alerts if needed for failed deployments