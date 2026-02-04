import { test, expect } from '@playwright/test';

test.describe('Public API Endpoints', () => {
  test('should allow anonymous access to /api/preferences', async ({ request }) => {
    // Make request without authentication
    const response = await request.get('/api/preferences');
    
    // Should return 200 OK, not 401 Unauthorized
    expect(response.status()).toBe(200);
    
    // Should return default preferences with expected structure
    const data = await response.json();
    expect(data).toHaveProperty('theme');
    expect(data).toHaveProperty('locale');
    expect(data).toHaveProperty('scale');
    expect(data).toHaveProperty('density');
    expect(data).toHaveProperty('pdfZoom');
    expect(data).toHaveProperty('sidebarCollapsed');
    expect(data).toHaveProperty('notificationsEnabled');
  });

  test('should allow anonymous access to /api/materials', async ({ request }) => {
    // Make request without authentication
    const response = await request.get('/api/materials');
    
    // Should return 200 OK, not 401 Unauthorized
    expect(response.status()).toBe(200);
    
    // Should return an array (might be empty if no materials in DB)
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should allow anonymous access to /api/materials with category filter', async ({ request }) => {
    // Make request with category parameter
    const response = await request.get('/api/materials?category=ACRYLIC_XT');
    
    // Should return 200 OK
    expect(response.status()).toBe(200);
    
    // Should return an array
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should allow anonymous access to /api/materials with multiple categories', async ({ request }) => {
    // Make request with multiple categories
    const response = await request.get('/api/materials?categories=ACRYLIC_XT,ALU_SHEET');
    
    // Should return 200 OK
    expect(response.status()).toBe(200);
    
    // Should return an array
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should block anonymous PUT to /api/preferences', async ({ request }) => {
    // Try to update preferences without authentication
    const response = await request.put('/api/preferences', {
      data: { theme: 'LightMode' }
    });
    
    // Should return 401 Unauthorized for PUT requests
    expect(response.status()).toBe(401);
  });

  test('should block anonymous POST to /api/materials', async ({ request }) => {
    // Try to create material without authentication
    const response = await request.post('/api/materials', {
      data: {
        category: 'TEST',
        code: 'TEST001',
        nameEn: 'Test Material'
      }
    });
    
    // Should return 401 Unauthorized for POST requests
    expect(response.status()).toBe(401);
  });
});
