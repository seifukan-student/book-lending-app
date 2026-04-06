# セキュリティ監査レポート

**日付**: 2024年12月
**対象アプリケーション**: 図書貸出システム (book-lending-vision)
**監査方法**: 静的コード解析、動的テスト（Playwright）、手動レビュー

---

## 実行サマリー

### リスクレベル
- 🔴 **高リスク**: 3件
- 🟡 **中リスク**: 5件
- 🟢 **低リスク**: 2件

---

## 1. 🔴 高リスクの脆弱性

### 1.1 XSS（Cross-Site Scripting）脆弱性

**リスクレベル**: 🔴 高

**問題箇所**:
- `public/app.js` (line 108, 159)
- `public/borrow.js` (line 118, 259)
- `public/return.js` (line 118, 259)
- `public/extend.js` (line 54, 69, 184, 400)
- `public/admin-login.html` (line 203, 213, 220)
- `public/admin-register.html` (line 544)

**問題の詳細**:
```javascript
// 危険なコード例
elements.imagePreview.innerHTML = `<img src="${e.target.result}" ...>`;
btn.innerHTML = button.text; // ユーザー入力が直接設定される可能性
messageDiv.innerHTML = `<strong>${text}</strong>`;
```

**影響**:
- 攻撃者が悪意のあるスクリプトを注入し、ユーザーのセッションを乗っ取る可能性
- Cookieの盗難、個人情報の漏洩
- 管理者権限の不正取得

**推奨対策**:
```javascript
// 安全なコード例
const img = document.createElement('img');
img.src = e.target.result;
img.className = 'image-preview';
elements.imagePreview.appendChild(img);

// テキストコンテンツの場合は textContent を使用
btn.textContent = button.text;

// HTMLが必要な場合は DOMPurify を使用
import DOMPurify from 'dompurify';
messageDiv.innerHTML = DOMPurify.sanitize(`<strong>${text}</strong>`);
```

---

### 1.2 CORS設定が緩すぎる

**リスクレベル**: 🔴 高

**問題箇所**:
- `server.js` (line 73-76)

**問題の詳細**:
```javascript
app.use(cors({
  origin: true, // すべてのオリジンを許可（本番環境では適切に設定する）
  credentials: true
}));
```

**影響**:
- 任意のオリジンからのリクエストが許可される
- CSRF攻撃のリスクが高まる
- 機密情報への不正アクセスの可能性

**推奨対策**:
```javascript
// 本番環境では特定のオリジンのみ許可
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // オリジンがない場合（モバイルアプリなど）は許可
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true
}));
```

---

### 1.3 CSRF（Cross-Site Request Forgery）対策の欠如

**リスクレベル**: 🔴 高

**問題の詳細**:
- APIエンドポイントにCSRFトークンの検証がない
- セッション管理はあるが、CSRF保護がない

**影響**:
- 攻撃者がユーザーに気づかれずに操作を実行できる
- 貸出・返却処理の不正実行
- 管理者機能の不正利用

**推奨対策**:
```javascript
// csrf パッケージのインストール
// npm install csurf

const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// CSRFトークンを取得するエンドポイント
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// 保護が必要なエンドポイントに適用
app.post('/api/step5', csrfProtection, async (req, res) => {
  // ...
});
```

---

## 2. 🟡 中リスクの脆弱性

### 2.1 セッション固定攻撃への脆弱性

**リスクレベル**: 🟡 中

**問題箇所**:
- `server.js` (line 13-22)

**問題の詳細**:
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET || 'book-lending-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: true, // 初期化されていないセッションも保存
  // ...
}));
```

**影響**:
- 攻撃者がセッションIDを固定して、ユーザーにログインさせることができる
- セッションの乗っ取り

**推奨対策**:
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET || 'book-lending-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false, // 初期化されていないセッションは保存しない
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'strict' // CSRF対策にも有効
  },
  // ログイン時にセッションIDを再生成
  genid: function(req) {
    return require('crypto').randomBytes(16).toString('hex');
  }
}));

// ログイン成功時にセッションを再生成
app.post('/api/admin/login', (req, res) => {
  // ... 認証処理 ...
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'セッションエラー' });
    }
    req.session.isAdmin = true;
    res.json({ success: true });
  });
});
```

---

### 2.2 入力検証の不備

**リスクレベル**: 🟡 中

**問題箇所**:
- `server.js` (line 222-227, 240-242)

**問題の詳細**:
```javascript
function escapeAirtableString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

**影響**:
- Airtableの数式インジェクション攻撃の可能性
- 特殊文字の処理が不完全

**推奨対策**:
```javascript
function escapeAirtableString(str) {
  if (!str) return '';
  // より厳密なエスケープ処理
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// 入力検証の追加
function validateInput(input, type = 'string') {
  if (type === 'string') {
    // 最大長の制限
    if (input.length > 1000) {
      throw new Error('入力が長すぎます');
    }
    // 不正な文字の検出
    if (/[<>{}[\]]/.test(input)) {
      throw new Error('不正な文字が含まれています');
    }
  }
  return input;
}
```

---

### 2.3 機密情報の露出

**リスクレベル**: 🟡 中

**問題箇所**:
- `server.js` (line 2007-2030)

**問題の詳細**:
```javascript
app.get('/api/health', (req, res) => {
  res.json({ 
    config: {
      adminPasswordLength: adminPassword.length,
      adminPasswordSource: process.env.ADMIN_PASSWORD ? 'environment' : 'default',
      // ...
    }
  });
});
```

**影響**:
- パスワードの長さや設定方法が外部に露出
- 情報収集に利用される可能性

**推奨対策**:
```javascript
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    config: {
      hasGoogleVisionKey: !!config.googleCloud.apiKey,
      hasAirtableKey: !!config.airtable.apiKey,
      hasAirtableBase: !!config.airtable.baseId,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      // 機密情報は含めない
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000
    }
  });
});
```

---

### 2.4 レート制限の欠如

**リスクレベル**: 🟡 中

**問題の詳細**:
- APIエンドポイントにレート制限がない
- ブルートフォース攻撃やDoS攻撃への対策がない

**推奨対策**:
```javascript
// express-rate-limit パッケージの使用
const rateLimit = require('express-rate-limit');

// ログインエンドポイント用のレート制限
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 5回まで
  message: 'ログイン試行回数が多すぎます。15分後に再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  // ...
});

// 一般的なAPI用のレート制限
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
});

app.use('/api/', apiLimiter);
```

---

### 2.5 ファイルアップロードの検証不足

**リスクレベル**: 🟡 中

**問題箇所**:
- `server.js` (line 88-93)

**問題の詳細**:
```javascript
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB制限
});
```

**影響**:
- ファイルタイプの検証がない
- 悪意のあるファイルのアップロードが可能

**推奨対策**:
```javascript
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MBに制限
  fileFilter: (req, file, cb) => {
    // 画像ファイルのみ許可
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です'), false);
    }
  }
});

// さらに、ファイルの内容を検証
const sharp = require('sharp');

app.post('/api/step1', upload.single('bookImage'), async (req, res) => {
  try {
    const file = req.file;
    
    // ファイルサイズの再確認
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'ファイルサイズが大きすぎます' });
    }
    
    // 画像の検証（実際に画像として読み込めるか）
    try {
      await sharp(file.buffer).metadata();
    } catch (err) {
      return res.status(400).json({ success: false, message: '無効な画像ファイルです' });
    }
    
    // ...
  } catch (error) {
    // ...
  }
});
```

---

## 3. 🟢 低リスクの改善点

### 3.1 セッションシークレットのデフォルト値

**リスクレベル**: 🟢 低

**問題箇所**:
- `server.js` (line 14)

**推奨対策**:
- 本番環境では必ず環境変数で設定
- デフォルト値は開発環境のみで使用

---

### 3.2 エラーメッセージの詳細度

**リスクレベル**: 🟢 低

**推奨対策**:
- 本番環境では詳細なエラーメッセージを非表示
- ログには詳細を記録し、ユーザーには汎用的なメッセージを表示

```javascript
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ 
      success: false, 
      message: 'エラーが発生しました。もう一度お試しください。' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      stack: err.stack 
    });
  }
});
```

---

## 4. セキュリティヘッダーの評価

### ✅ 良好な設定
- `X-Content-Type-Options: nosniff` ✓
- `X-Frame-Options: DENY` ✓
- `X-XSS-Protection: 1; mode=block` ✓
- `X-Powered-By` の削除 ✓
- `Strict-Transport-Security` (本番環境) ✓
- `HttpOnly` Cookie ✓

### ⚠️ 改善推奨
- `Content-Security-Policy` ヘッダーの追加を推奨

```javascript
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' https://cdnjs.cloudflare.com; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  next();
});
```

---

## 5. 推奨される実装優先順位

### 即座に対応（高リスク）
1. ✅ XSS対策: `innerHTML` の使用を `textContent` または `DOMPurify` に置き換え
2. ✅ CORS設定: 特定のオリジンのみ許可するように変更
3. ✅ CSRF対策: CSRFトークンの実装

### 短期対応（中リスク）
4. ✅ セッション固定攻撃対策: ログイン時のセッション再生成
5. ✅ 入力検証の強化
6. ✅ レート制限の実装
7. ✅ ファイルアップロード検証の強化

### 中期対応（低リスク・改善）
8. ✅ Content-Security-Policy ヘッダーの追加
9. ✅ エラーハンドリングの改善
10. ✅ ログ監視の実装

---

## 6. テスト結果

### 実行したテスト
- ✅ XSS脆弱性テスト
- ✅ CSRF脆弱性テスト
- ✅ 認証・認可テスト
- ✅ 入力検証テスト
- ✅ セッション管理テスト
- ✅ 機密情報露出テスト
- ✅ CORS設定テスト
- ✅ ファイルアップロードテスト

### テスト実行方法
```bash
# Playwrightテストの実行
npx playwright test security-test.spec.js

# HTMLレポートの表示
npx playwright show-report
```

---

## 7. 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express.js セキュリティベストプラクティス](https://expressjs.com/en/advanced/best-practice-security.html)
- [Content Security Policy](https://developer.mozilla.org/ja/docs/Web/HTTP/CSP)

---

**レポート作成日**: 2024年12月
**次回レビュー推奨日**: 修正実装後

