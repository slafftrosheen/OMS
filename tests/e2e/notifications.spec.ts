import { test, expect } from '@playwright/test';

test.describe('Real-time Notifications', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate user before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should receive real-time order update notifications', async ({ page }) => {
    // Open two browser contexts to simulate different users
    const context1 = await page.context();
    const page2 = await context1.newPage();
    
    // Login both pages
    await page2.goto('/login');
    await page2.fill('[data-testid="email-input"]', 'admin@example.com');
    await page2.fill('[data-testid="password-input"]', 'password123');
    await page2.click('[data-testid="login-button"]');
    await page2.waitForURL('/dashboard');
    
    // Navigate to notifications page on first tab
    await page.goto('/notifications');
    
    // On second tab, update an order
    await page2.goto('/orders');
    await page2.click('[data-testid="order-row"]:first-child [data-testid="edit-btn"]');
    await page2.fill('[name="title"]', 'Updated Order - Real-time Test');
    await page2.click('button[type="submit"]');
    
    // Wait for notification to appear on first tab
    await expect(page.locator('[data-testid="notification-item"]')).toContainText('Updated Order - Real-time Test');
  });

  test('should mark notifications as read', async ({ page }) => {
    await page.goto('/notifications');
    
    // Count unread notifications initially
    const initialUnreadCount = await page.locator('[data-testid="unread-notification"]').count();
    
    if (initialUnreadCount > 0) {
      // Mark first notification as read
      await page.click('[data-testid="mark-read-btn"]:first-child');
      
      // Wait for UI update
      await page.waitForTimeout(300);
      
      // Verify notification is no longer marked as unread
      const finalUnreadCount = await page.locator('[data-testid="unread-notification"]').count();
      expect(finalUnreadCount).toBeLessThan(initialUnreadCount);
    }
  });

  test('should clear all notifications', async ({ page }) => {
    await page.goto('/notifications');
    
    // Count initial notifications
    const initialCount = await page.locator('[data-testid="notification-item"]').count();
    
    if (initialCount > 0) {
      // Clear all notifications
      await page.click('[data-testid="clear-all-notifications"]');
      
      // Confirm action
      await page.click('[data-testid="confirm-clear"]');
      
      // Wait for UI update
      await page.waitForTimeout(500);
      
      // Verify all notifications are cleared
      const finalCount = await page.locator('[data-testid="notification-item"]').count();
      expect(finalCount).toBe(0);
    }
  });

  test('should display notification badge with count', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Simulate receiving a new notification
    // This might involve triggering an event or mocking the websocket
    await page.evaluate(() => {
      // Simulate a notification via WebSocket or other mechanism
      window.dispatchEvent(new CustomEvent('notification-received', { detail: { id: 1, message: 'Test notification' } }));
    });
    
    // Verify notification badge shows correct count
    const badge = page.locator('[data-testid="notification-badge"]');
    await expect(badge).toContainText('1');
  });
});