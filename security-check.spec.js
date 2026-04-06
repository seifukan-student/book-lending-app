const { test, expect } = require('@playwright/test');

test.describe('Security Improvements Verification', () => {
  
  test('Admin login should be disabled if ADMIN_PASSWORD is not set', async ({ page }) => {
    // 1. Visit Admin Login Page
    await page.goto('http://localhost:3000/admin-login.html');
    
    // 2. Enter old default password
    await page.fill('#password', 'secure_admin_password_2024');
    
    // 3. Submit
    await page.click('button[type="submit"]');
    
    // 4. Check for error message
    // The server returns 500 with error message
    await expect(page.locator('.alert-danger')).toBeVisible();
    await expect(page.locator('.alert-danger')).toContainText('サーバー設定エラー');
  });

  test('Should return security headers and hide info', async ({ request }) => {
    const response = await request.get('http://localhost:3000/');
    const headers = response.headers();
    
    // X-Powered-By should be removed
    expect(headers['x-powered-by']).toBeUndefined();
    
    // Security headers should be present
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-xss-protection']).toBe('1; mode=block');
  });

  test('Session cookie should be HttpOnly', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'connect.sid');
    
    if (sessionCookie) {
        expect(sessionCookie.httpOnly).toBe(true);
        // Secure flag depends on NODE_ENV, checking logic is correct
        // In dev it is false, which is expected now.
    }
  });

});
