import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should allow user to login and logout', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Fill in credentials
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    
    // Click login button
    await page.click('[data-testid="login-button"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL('/dashboard');
    
    // Verify successful login by checking for user menu or welcome message
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    // Test logout functionality
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Verify successful logout
    await expect(page.locator('text=Login')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('should redirect unauthenticated user to login', async ({ page }) => {
    // Try to access a protected route
    await page.goto('/orders');
    
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });
});