# Testing the Complete OMS Setup

## Overview

This guide provides steps to test the complete OMS setup with Supabase backend and Vercel frontend deployment.

## Pre-Testing Checklist

Before running tests, ensure:

- [ ] Supabase project is created and configured
- [ ] Database migrations have been applied
- [ ] Environment variables are set in both local and Vercel environments
- [ ] GitHub Actions workflows are configured
- [ ] Vercel deployment is successful

## Test 1: Local Development Environment

### 1.1 Verify Local Setup
1. Navigate to the OMS directory:
   ```bash
   cd /home/server/OMS
   ```

2. Install dependencies (if not already done):
   ```bash
   npm install
   ```

3. Set up your local environment variables in `.env`:
   ```env
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Visit the local development server (usually at http://localhost:5173)
6. Verify that:
   - The application loads without errors
   - Authentication features work
   - Data can be retrieved from Supabase

### 1.2 Test Database Connection
1. In your Supabase dashboard, go to the SQL Editor
2. Run a simple query to verify connectivity:
   ```sql
   SELECT * FROM profiles LIMIT 1;
   ```
3. Verify that the tables created by your migrations exist

## Test 2: Supabase Backend Functionality

### 2.1 Authentication
1. Test user registration/login functionality
2. Verify that authentication redirects work properly
3. Check that protected routes require authentication
4. Verify that session management works correctly

### 2.2 Database Operations
1. Test creating a new profile
2. Test updating user preferences
3. Verify that audit logging works for sensitive operations
4. Test file upload functionality (if applicable)
5. Verify RLS (Row Level Security) policies work as expected

### 2.3 API Endpoints
1. Test the audit log API endpoint: `/api/audit-log`
2. Test draft order endpoints if they exist
3. Verify that all API endpoints return appropriate responses

## Test 3: Vercel Frontend Deployment

### 3.1 Production Build
1. Create a production build locally:
   ```bash
   npm run build
   ```
2. Verify the build completes without errors
3. Preview the build locally:
   ```bash
   npm run preview
   ```

### 3.2 Deployed Application
1. Visit your deployed application on Vercel
2. Verify that:
   - The application loads correctly
   - All pages are accessible
   - Authentication works as expected
   - All features function properly
   - Responsive design works on different screen sizes

### 3.3 Environment Variables
1. Verify that all environment variables are correctly set in the deployed application
2. Check that the application connects to the correct Supabase instance
3. Confirm that private variables are not exposed in the client-side code

## Test 4: GitHub Actions Workflow

### 4.1 Trigger Workflows
1. Make a minor change to the code (e.g., update a comment)
2. Push the change to the main branch
3. Verify that the production deployment workflow runs
4. Create a pull request to trigger the preview workflow
5. Verify that the preview deployment workflow runs

### 4.2 Check Deployment Status
1. Go to your GitHub repository → Actions
2. Verify that all workflows complete successfully
3. Check that deployments appear in your Vercel dashboard
4. Verify that preview deployments are created for pull requests

## Test 5: Integration Testing

### 5.1 Full User Flow
1. Register a new user (if possible)
2. Log in to the application
3. Perform key operations (creating orders, updating profiles, etc.)
4. Verify that data persists in the Supabase database
5. Check that audit logs are created for important actions

### 5.2 Error Handling
1. Test error scenarios (invalid inputs, network issues, etc.)
2. Verify that error messages are displayed appropriately
3. Check that the application gracefully handles Supabase connection issues

## Test 6: Performance and Security

### 6.1 Performance
1. Use browser dev tools to check page load times
2. Verify that assets are properly optimized
3. Check that API calls are efficient

### 6.2 Security
1. Verify that sensitive data is not exposed in client-side code
2. Check that authentication is required for protected resources
3. Verify that RLS policies prevent unauthorized access
4. Ensure that environment variables are properly secured

## Troubleshooting Common Issues

### Issue: Cannot connect to Supabase
- **Solution**: Verify that your Supabase URL and keys are correct in environment variables

### Issue: Build fails on Vercel
- **Solution**: Check that all required environment variables are set in Vercel dashboard

### Issue: GitHub Actions fail
- **Solution**: Verify that all GitHub secrets are correctly set

### Issue: Authentication not working
- **Solution**: Check Supabase authentication settings and redirect URLs

## Verification Checklist

After completing all tests, verify:

- [ ] Local development environment works correctly
- [ ] Supabase backend is fully functional
- [ ] Vercel deployment is successful and stable
- [ ] GitHub Actions workflows run properly
- [ ] All application features work as expected
- [ ] Security measures are in place
- [ ] Performance is acceptable

## Next Steps

Once all tests pass:

1. Document any custom configurations needed
2. Set up monitoring for your production application
3. Plan for backup and recovery procedures
4. Establish a process for managing future updates
5. Train team members on the deployment process