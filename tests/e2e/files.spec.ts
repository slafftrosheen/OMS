import { test, expect } from '@playwright/test';

test.describe('File Upload & Management', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate user before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should upload a new file', async ({ page }) => {
    await page.goto('/files');
    
    // Trigger file upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/sample.pdf');
    
    // Wait for upload to complete
    await page.waitForSelector('[data-testid="file-item"]');
    
    // Verify file appears in the list
    await expect(page.locator('[data-testid="file-item"]:first-child')).toContainText('sample.pdf');
  });

  test('should delete an uploaded file', async ({ page }) => {
    await page.goto('/files');
    
    const initialCount = await page.locator('[data-testid="file-item"]').count();
    
    // Click delete button on first file
    await page.click('[data-testid="file-item"]:first-child [data-testid="delete-file"]');
    
    // Confirm deletion
    await page.click('[data-testid="confirm-delete"]');
    
    // Verify file was removed
    await page.waitForTimeout(500);
    const finalCount = await page.locator('[data-testid="file-item"]').count();
    
    expect(finalCount).toBe(initialCount - 1);
  });

  test('should handle file upload errors gracefully', async ({ page }) => {
    await page.goto('/files');
    
    // Try to upload a file that's too large
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/large_file.zip');
    
    // Verify error message appears
    await expect(page.locator('text=File size exceeds maximum limit')).toBeVisible();
  });

  test('should validate file type during upload', async ({ page }) => {
    await page.goto('/files');
    
    // Try to upload an unsupported file type
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/script.exe');
    
    // Verify error message appears
    await expect(page.locator('text=File type not allowed')).toBeVisible();
  });
});