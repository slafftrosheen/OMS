import { test, expect } from '@playwright/test';

test.describe('Order Management', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate user before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should create new order', async ({ page }) => {
    await page.click('[data-testid="new-order-btn"]');
    await page.fill('[name="title"]', 'Test Order');
    await page.fill('[name="clientName"]', 'Test Client');
    await page.fill('[name="deadline"]', '2023-12-31');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Order created')).toBeVisible();
  });

  test('should update existing order', async ({ page }) => {
    // Navigate to orders page
    await page.goto('/orders');
    
    // Find and click on an existing order
    await page.click('[data-testid="order-row"]:first-child [data-testid="edit-btn"]');
    
    // Update order details
    await page.fill('[name="title"]', 'Updated Test Order');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Order updated')).toBeVisible();
  });

  test('should delete an order', async ({ page }) => {
    await page.goto('/orders');
    
    // Count orders before deletion
    const initialCount = await page.locator('[data-testid="order-row"]').count();
    
    // Click delete button on first order
    await page.click('[data-testid="order-row"]:first-child [data-testid="delete-btn"]');
    
    // Confirm deletion
    await page.click('[data-testid="confirm-delete"]');
    
    // Wait for deletion and verify count decreased
    await page.waitForTimeout(500); // Allow for animation
    const finalCount = await page.locator('[data-testid="order-row"]').count();
    
    expect(finalCount).toBe(initialCount - 1);
  });

  test('should filter orders by status', async ({ page }) => {
    await page.goto('/orders');
    
    // Select a status filter
    await page.click('[data-testid="status-filter"]');
    await page.click('[data-testid="status-option-active"]');
    
    // Verify filtered results
    await expect(page.locator('[data-testid="order-status"]:has-text("ACTIVE")')).toBeVisible();
  });
});