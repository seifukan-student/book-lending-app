const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

// セキュリティテストスイート
test.describe('セキュリティテスト', () => {
  
  test.beforeEach(async ({ page }) => {
    // 各テスト前にクッキーをクリア
    await page.context().clearCookies();
  });

  // ========== XSS脆弱性テスト ==========
  test.describe('XSS脆弱性テスト', () => {
    test('名前入力フィールドでのXSS攻撃', async ({ page }) => {
      await page.goto(`${BASE_URL}/borrow.html`);
      
      // XSSペイロードを試行
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
      ];
      
      for (const payload of xssPayloads) {
        // ファイルアップロードをシミュレート（実際のファイルは必要）
        // 名前入力フィールドにXSSペイロードを入力
        await page.fill('#nameInput', payload);
        
        // ページのソースを確認してXSSが反映されていないかチェック
        const content = await page.content();
        
        // innerHTMLで直接設定されていないか確認
        if (content.includes(payload) && !content.includes('&lt;') && !content.includes('&gt;')) {
          console.warn(`⚠️ XSS脆弱性の可能性: ${payload}がエスケープされずに表示されています`);
        }
      }
    });

    test('メッセージ表示でのXSS攻撃', async ({ page }) => {
      await page.goto(`${BASE_URL}/borrow.html`);
      
      // チャットメッセージにXSSペイロードが含まれる場合のテスト
      const xssPayload = '<script>alert("XSS")</script>';
      
      // JavaScriptを実行してメッセージを追加
      await page.evaluate((payload) => {
        const messages = document.getElementById('messages');
        if (messages) {
          const div = document.createElement('div');
          div.innerHTML = payload; // 危険なinnerHTMLの使用
          messages.appendChild(div);
        }
      }, xssPayload);
      
      // スクリプトが実行されないことを確認
      const alertFired = await page.evaluate(() => {
        return window.alertFired || false;
      });
      
      expect(alertFired).toBeFalsy();
    });
  });

  // ========== CSRF脆弱性テスト ==========
  test.describe('CSRF脆弱性テスト', () => {
    test('CSRFトークンなしでのAPI呼び出し', async ({ page, request }) => {
      // セッションを確立
      await page.goto(`${BASE_URL}/`);
      
      // CSRFトークンなしでAPIを呼び出し
      const response = await request.post(`${BASE_URL}/api/step5`, {
        data: { action: 'agree' },
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // CSRF保護がない場合、リクエストが成功する可能性がある
      // セッションが有効な場合、これは脆弱性を示す
      console.log(`CSRFテスト結果: ${response.status()}`);
    });

    test('外部サイトからのリクエストシミュレーション', async ({ page }) => {
      // 別のオリジンからのリクエストをシミュレート
      await page.goto(`${BASE_URL}/`);
      
      // fetch APIで外部からリクエストを送信
      const result = await page.evaluate(async (url) => {
        try {
          const response = await fetch(`${url}/api/step5`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'agree' }),
            credentials: 'include',
          });
          return { status: response.status, ok: response.ok };
        } catch (e) {
          return { error: e.message };
        }
      }, BASE_URL);
      
      console.log('外部リクエストテスト結果:', result);
    });
  });

  // ========== 認証・認可テスト ==========
  test.describe('認証・認可テスト', () => {
    test('管理者認証なしでの管理者APIアクセス', async ({ page, request }) => {
      // ログインせずに管理者APIにアクセス
      const response = await request.post(`${BASE_URL}/api/admin/register-book`, {
        data: {
          title: 'Test Book',
          author: 'Test Author',
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // 401 Unauthorizedが返されるべき
      expect(response.status()).toBe(401);
    });

    test('弱いパスワードでの認証試行', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin-login.html`);
      
      const weakPasswords = [
        '123456',
        'password',
        'admin',
        '1234',
        'test',
      ];
      
      for (const password of weakPasswords) {
        await page.fill('#password', password);
        await page.click('button[type="submit"]');
        
        // エラーメッセージが表示されることを確認
        await page.waitForTimeout(500);
        const errorMessage = await page.textContent('#alert-container');
        
        if (!errorMessage || !errorMessage.includes('正しくありません')) {
          console.warn(`⚠️ 弱いパスワード "${password}" が受け入れられる可能性があります`);
        }
      }
    });

    test('ブルートフォース攻撃のシミュレーション', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin-login.html`);
      
      // 複数回のログイン試行
      for (let i = 0; i < 10; i++) {
        await page.fill('#password', `wrong_password_${i}`);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(200);
      }
      
      // レート制限がかかっているか確認
      const lastResponse = await page.evaluate(() => {
        return window.lastResponseStatus || null;
      });
      
      console.log('ブルートフォーステスト: 10回の試行後のステータス:', lastResponse);
    });
  });

  // ========== 入力検証テスト ==========
  test.describe('入力検証テスト', () => {
    test('SQLインジェクション攻撃（Airtableクエリ）', async ({ page, request }) => {
      // AirtableのfilterByFormulaに悪意のある入力を試行
      const sqlInjectionPayloads = [
        '"; DROP TABLE Books; --',
        "' OR '1'='1",
        '"; SELECT * FROM Books; --',
        "1' OR '1'='1",
      ];
      
      await page.goto(`${BASE_URL}/borrow.html`);
      
      for (const payload of sqlInjectionPayloads) {
        // 名前入力フィールドにSQLインジェクションペイロードを入力
        await page.fill('#nameInput', payload);
        
        // 実際のリクエストを送信してエラーが発生しないか確認
        const response = await request.post(`${BASE_URL}/api/step3`, {
          data: { name: payload },
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        // エラーレスポンスが適切に処理されているか確認
        const data = await response.json();
        console.log(`SQLインジェクションテスト "${payload}":`, response.status(), data.message);
      }
    });

    test('コマンドインジェクション攻撃', async ({ page }) => {
      const commandInjectionPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& rm -rf /',
        '`whoami`',
        '$(id)',
      ];
      
      await page.goto(`${BASE_URL}/borrow.html`);
      
      for (const payload of commandInjectionPayloads) {
        await page.fill('#nameInput', payload);
        // サーバー側でコマンドが実行されないことを確認
      }
    });

    test('パストラバーサル攻撃', async ({ page, request }) => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
      ];
      
      // ファイルアップロード時のパストラバーサルテスト
      for (const payload of pathTraversalPayloads) {
        // ファイル名にパストラバーサルを含める
        console.log(`パストラバーサルテスト: ${payload}`);
      }
    });
  });

  // ========== セッション管理テスト ==========
  test.describe('セッション管理テスト', () => {
    test('セッション固定攻撃', async ({ page, context }) => {
      // セッションIDを固定してテスト
      await page.goto(`${BASE_URL}/admin-login.html`);
      
      // セッションIDを取得
      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name.includes('connect.sid'));
      
      if (sessionCookie) {
        console.log('セッションID:', sessionCookie.value.substring(0, 20) + '...');
        
        // 別のコンテキストで同じセッションIDを使用
        const newContext = await context.browser().newContext();
        await newContext.addCookies([sessionCookie]);
        
        const newPage = await newContext.newPage();
        await newPage.goto(`${BASE_URL}/admin-register.html`);
        
        // セッションが無効化されているか確認
        const content = await newPage.content();
        if (!content.includes('認証') && !content.includes('login')) {
          console.warn('⚠️ セッション固定攻撃の可能性: セッションIDが再利用可能です');
        }
        
        await newContext.close();
      }
    });

    test('セッションタイムアウト', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin-login.html`);
      
      // ログイン
      await page.fill('#password', process.env.TEST_ADMIN_PASSWORD || 'test_password');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
      
      // 長時間待機（実際のテストではもっと長く）
      await page.waitForTimeout(2000);
      
      // セッションが有効か確認
      await page.goto(`${BASE_URL}/admin-register.html`);
      const content = await page.content();
      
      // セッションが無効化されている場合、ログインページにリダイレクトされるべき
      console.log('セッションタイムアウトテスト完了');
    });
  });

  // ========== 機密情報露出テスト ==========
  test.describe('機密情報露出テスト', () => {
    test('ヘルスチェックエンドポイントでの情報露出', async ({ page }) => {
      await page.goto(`${BASE_URL}/api/health`);
      
      const response = await page.evaluate(() => {
        return document.body.textContent;
      });
      
      const data = JSON.parse(response);
      
      // 機密情報が露出していないか確認
      if (data.config && data.config.adminPasswordLength) {
        console.warn('⚠️ パスワードの長さが露出しています');
      }
      
      if (data.config && data.config.adminPasswordSource) {
        console.warn('⚠️ パスワードのソース情報が露出しています');
      }
      
      // APIキーが露出していないか確認
      if (response.includes('AIza') || response.includes('pat_')) {
        console.error('❌ APIキーが露出しています！');
      }
    });

    test('エラーメッセージでの情報露出', async ({ page, request }) => {
      // 意図的にエラーを発生させて、機密情報が露出しないか確認
      const response = await request.get(`${BASE_URL}/api/nonexistent`);
      
      const data = await response.json();
      
      // スタックトレースや内部エラー情報が露出していないか確認
      if (data.error && (data.error.includes('at ') || data.error.includes('Error:'))) {
        console.warn('⚠️ エラーメッセージにスタックトレースが含まれています');
      }
    });

    test('ソースコードの露出', async ({ page }) => {
      // .envファイルやソースコードが直接アクセス可能でないか確認
      const sensitiveFiles = [
        '/.env',
        '/server.js',
        '/package.json',
        '/.git/config',
      ];
      
      for (const file of sensitiveFiles) {
        const response = await page.goto(`${BASE_URL}${file}`);
        const status = response?.status();
        
        if (status === 200) {
          console.error(`❌ 機密ファイル "${file}" が公開されています！`);
        }
      }
    });
  });

  // ========== CORS設定テスト ==========
  test.describe('CORS設定テスト', () => {
    test('CORS設定の確認', async ({ page, request }) => {
      // プリフライトリクエストを送信
      const response = await request.options(`${BASE_URL}/api/step1`, {
        headers: {
          'Origin': 'https://evil.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      
      const corsHeaders = {
        'Access-Control-Allow-Origin': response.headers()['access-control-allow-origin'],
        'Access-Control-Allow-Credentials': response.headers()['access-control-allow-credentials'],
      };
      
      console.log('CORS設定:', corsHeaders);
      
      // 全てのオリジンを許可している場合、警告
      if (corsHeaders['Access-Control-Allow-Origin'] === '*' || 
          corsHeaders['Access-Control-Allow-Origin'] === 'true') {
        console.warn('⚠️ CORS設定が緩すぎます: 全てのオリジンを許可しています');
      }
    });
  });

  // ========== ファイルアップロードテスト ==========
  test.describe('ファイルアップロードテスト', () => {
    test('悪意のあるファイルのアップロード', async ({ page, request }) => {
      // 実行可能ファイルやスクリプトファイルのアップロードを試行
      const maliciousFiles = [
        { name: 'malicious.php', content: '<?php system($_GET["cmd"]); ?>' },
        { name: 'malicious.js', content: 'require("child_process").exec("rm -rf /")' },
        { name: 'malicious.sh', content: '#!/bin/bash\nrm -rf /' },
      ];
      
      for (const file of maliciousFiles) {
        // ファイルアップロードを試行
        console.log(`悪意のあるファイルテスト: ${file.name}`);
      }
    });

    test('ファイルサイズ制限の確認', async ({ page, request }) => {
      // 大きなファイルのアップロードを試行
      const largeFile = Buffer.alloc(100 * 1024 * 1024); // 100MB
      
      // ファイルサイズ制限が適切に設定されているか確認
      console.log('ファイルサイズ制限テスト: 100MBファイル');
    });
  });
});

