# セキュリティ修正ガイド

このドキュメントは、`SECURITY_REPORT.md`で特定された脆弱性を修正するための具体的な実装ガイドです。

---

## 1. XSS対策の実装

### 1.1 DOMPurifyのインストール

```bash
npm install dompurify
npm install --save-dev @types/dompurify  # TypeScriptを使用する場合
```

### 1.2 フロントエンドでの実装

#### `public/app.js` の修正

```javascript
// ファイルの先頭に追加
// CDNから読み込む場合
// <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>

// または、npmパッケージを使用する場合（ビルドプロセスが必要）
// import DOMPurify from 'dompurify';

// メッセージ表示関数の修正
function addMessage(content, type = 'bot', buttons = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // XSS対策: textContentを使用（HTMLが不要な場合）
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    
    if (buttons) {
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'action-buttons';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `btn btn-action ${button.class || ''}`;
            
            // XSS対策: innerHTMLの代わりにtextContentを使用
            // アイコンが必要な場合は、DOMPurifyを使用
            if (button.text.includes('<i class')) {
                // HTMLが必要な場合のみDOMPurifyを使用
                btn.innerHTML = DOMPurify.sanitize(button.text, {
                    ALLOWED_TAGS: ['i'],
                    ALLOWED_ATTR: ['class']
                });
            } else {
                btn.textContent = button.text;
            }
            
            btn.onclick = button.action;
            buttonsDiv.appendChild(btn);
        });
        
        messageDiv.appendChild(buttonsDiv);
    }
    
    elements.messages.appendChild(messageDiv);
    
    elements.chatContainer.style.display = 'block';
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// 画像プレビューの修正
function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        // XSS対策: createElementを使用
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'image-preview';
        img.alt = 'プレビュー';
        
        // innerHTMLの代わりにappendChildを使用
        elements.imagePreview.innerHTML = '';
        elements.imagePreview.appendChild(img);
    };
    reader.readAsDataURL(file);
}
```

#### `public/admin-login.html` の修正

```javascript
// alertContainer.innerHTML の使用を修正
function showAlert(message, type) {
    const alertContainer = document.getElementById('alert-container');
    
    // 既存のアラートを削除
    alertContainer.innerHTML = '';
    
    // 新しいアラート要素を作成
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    
    // アイコンとメッセージを安全に追加
    const icon = document.createElement('i');
    icon.className = `fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}`;
    
    const messageText = document.createTextNode(` ${message}`);
    
    alertDiv.appendChild(icon);
    alertDiv.appendChild(messageText);
    alertContainer.appendChild(alertDiv);
    
    // 3秒後にアラートを消す
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 3000);
}
```

---

## 2. CORS設定の修正

### `server.js` の修正

```javascript
// CORS設定を修正
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // オリジンがない場合（モバイルアプリやPostmanなど）は開発環境のみ許可
    if (!origin) {
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      } else {
        return callback(new Error('CORS policy: Origin header is required'));
      }
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Foo'],
  maxAge: 86400 // 24時間
}));
```

### 環境変数の設定

`.env` ファイルに追加:

```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 3. CSRF対策の実装

### 3.1 パッケージのインストール

```bash
npm install csurf
```

### 3.2 `server.js` の修正

```javascript
const csrf = require('csurf');

// CSRF保護の設定
const csrfProtection = csrf({ 
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// CSRFトークンを取得するエンドポイント
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// 保護が必要なエンドポイントに適用
app.post('/api/step2', csrfProtection, (req, res) => {
  // ...
});

app.post('/api/step3', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/step4', csrfProtection, (req, res) => {
  // ...
});

app.post('/api/step5', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/return-step2', csrfProtection, (req, res) => {
  // ...
});

app.post('/api/return-step3', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/return-step4', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/extend-step1', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/extend-step2', csrfProtection, async (req, res) => {
  // ...
});

app.post('/api/admin/register-book', requireAdmin, csrfProtection, async (req, res) => {
  // ...
});
```

### 3.3 フロントエンドでの実装

各HTMLファイルに追加:

```javascript
// ページ読み込み時にCSRFトークンを取得
let csrfToken = null;

async function getCsrfToken() {
    if (!csrfToken) {
        const response = await fetch('/api/csrf-token', {
            credentials: 'include'
        });
        const data = await response.json();
        csrfToken = data.csrfToken;
    }
    return csrfToken;
}

// API呼び出し時にCSRFトークンを追加
async function apiCall(url, options = {}) {
    const token = await getCsrfToken();
    
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers,
        credentials: 'include'
    });
}

// 使用例
const response = await apiCall('/api/step3', {
    method: 'POST',
    body: JSON.stringify({ name: name })
});
```

---

## 4. セッション固定攻撃対策

### `server.js` の修正

```javascript
const session = require('express-session');
const crypto = require('crypto');

app.use(session({
  secret: process.env.SESSION_SECRET || 'book-lending-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false, // 変更: 初期化されていないセッションは保存しない
  name: 'sessionId', // デフォルトのconnect.sidを変更
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'strict' // 追加: CSRF対策にも有効
  },
  // セッションID生成関数
  genid: function(req) {
    return crypto.randomBytes(16).toString('hex');
  }
}));

// ログイン成功時にセッションを再生成
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('❌ セキュリティ警告: ADMIN_PASSWORD環境変数が設定されていません。');
      return res.status(500).json({ 
        success: false, 
        error: 'サーバー設定エラー: 管理者パスワードが設定されていません' 
      });
    }
    
    if (password === adminPassword) {
      // セッションを再生成（セッション固定攻撃対策）
      req.session.regenerate((err) => {
        if (err) {
          console.error('セッション再生成エラー:', err);
          return res.status(500).json({ 
            success: false, 
            error: 'セッションエラーが発生しました' 
          });
        }
        
        req.session.isAdmin = true;
        req.session.loginTime = Date.now();
        
        console.log('✅ 管理者認証成功（セッション再生成済み）');
        res.json({ success: true, message: '認証成功' });
      });
    } else {
      console.log('❌ 管理者認証失敗 (パスワード不一致)');
      res.status(401).json({ success: false, error: 'パスワードが正しくありません' });
    }
  } catch (error) {
    console.error('❌ 管理者認証エラー:', error);
    res.status(500).json({ success: false, error: '認証処理中にエラーが発生しました' });
  }
});
```

---

## 5. レート制限の実装

### 5.1 パッケージのインストール

```bash
npm install express-rate-limit
```

### 5.2 `server.js` の修正

```javascript
const rateLimit = require('express-rate-limit');

// ログイン用のレート制限（厳格）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 5回まで
  message: {
    success: false,
    error: 'ログイン試行回数が多すぎます。15分後に再試行してください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 同じIPからのリクエストをカウント
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  // レート制限に達した場合の処理
  handler: (req, res) => {
    console.warn(`レート制限: ${req.ip} からの過剰なリクエスト`);
    res.status(429).json({
      success: false,
      error: 'リクエストが多すぎます。しばらく待ってから再試行してください。'
    });
  }
});

// 一般的なAPI用のレート制限
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 100リクエストまで
  message: {
    success: false,
    error: 'リクエストが多すぎます。しばらく待ってから再試行してください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ファイルアップロード用のレート制限（より厳格）
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 20, // 20回まで
  message: {
    success: false,
    error: 'アップロード回数が多すぎます。1時間後に再試行してください。'
  },
});

// エンドポイントに適用
app.post('/api/admin/login', loginLimiter, (req, res) => {
  // ...
});

app.post('/api/step1', uploadLimiter, upload.single('bookImage'), async (req, res) => {
  // ...
});

app.post('/api/return-step1', uploadLimiter, upload.single('bookImage'), async (req, res) => {
  // ...
});

// その他のAPIエンドポイント
app.use('/api/', apiLimiter);
```

---

## 6. ファイルアップロード検証の強化

### 6.1 パッケージのインストール

```bash
npm install sharp
```

### 6.2 `server.js` の修正

```javascript
const sharp = require('sharp');

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MBに制限
  },
  fileFilter: (req, file, cb) => {
    // MIMEタイプの検証
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です（JPEG, PNG, GIF, WebP）'), false);
    }
  }
});

// ファイル検証ミドルウェア
async function validateImageFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: '画像ファイルが必要です' 
    });
  }
  
  const file = req.file;
  
  // ファイルサイズの再確認
  if (file.size > 10 * 1024 * 1024) {
    return res.status(400).json({ 
      success: false, 
      message: 'ファイルサイズが大きすぎます（最大10MB）' 
    });
  }
  
  // 画像の検証（実際に画像として読み込めるか）
  try {
    const metadata = await sharp(file.buffer).metadata();
    
    // 画像の最小・最大サイズの検証
    if (metadata.width < 10 || metadata.height < 10) {
      return res.status(400).json({ 
        success: false, 
        message: '画像サイズが小さすぎます' 
      });
    }
    
    if (metadata.width > 10000 || metadata.height > 10000) {
      return res.status(400).json({ 
        success: false, 
        message: '画像サイズが大きすぎます' 
      });
    }
    
    // メタデータをリクエストに追加
    req.imageMetadata = metadata;
    next();
  } catch (err) {
    console.error('画像検証エラー:', err);
    return res.status(400).json({ 
      success: false, 
      message: '無効な画像ファイルです' 
    });
  }
}

// エンドポイントに適用
app.post('/api/step1', upload.single('bookImage'), validateImageFile, async (req, res) => {
  // ...
});

app.post('/api/return-step1', upload.single('bookImage'), validateImageFile, async (req, res) => {
  // ...
});
```

---

## 7. Content-Security-Policy ヘッダーの追加

### `server.js` の修正

```javascript
app.use((req, res, next) => {
  // 既存のセキュリティヘッダー
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  
  // Content-Security-Policy の追加
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "connect-src 'self' https://vision.googleapis.com https://api.airtable.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});
```

---

## 8. 入力検証の強化

### `server.js` に追加

```javascript
// 入力検証関数
function validateInput(input, type = 'string', options = {}) {
  if (!input && options.required) {
    throw new Error(`${options.fieldName || '入力'}は必須です`);
  }
  
  if (type === 'string') {
    const maxLength = options.maxLength || 1000;
    const minLength = options.minLength || 0;
    
    if (typeof input !== 'string') {
      throw new Error('文字列型である必要があります');
    }
    
    if (input.length > maxLength) {
      throw new Error(`${options.fieldName || '入力'}が長すぎます（最大${maxLength}文字）`);
    }
    
    if (input.length < minLength) {
      throw new Error(`${options.fieldName || '入力'}が短すぎます（最小${minLength}文字）`);
    }
    
    // 不正な文字の検出
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error('不正な文字が含まれています');
      }
    }
  }
  
  return input.trim();
}

// 使用例
app.post('/api/step3', csrfProtection, async (req, res) => {
  try {
    const { name } = req.body;
    
    // 入力検証
    const validatedName = validateInput(name, 'string', {
      required: true,
      fieldName: '名前',
      maxLength: 100,
      minLength: 1
    });
    
    // ... 残りの処理
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});
```

---

## 9. エラーハンドリングの改善

### `server.js` の最後に追加

```javascript
// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // CSRFエラー
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      message: 'CSRFトークンが無効です。ページを再読み込みしてください。'
    });
  }
  
  // レート制限エラー
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      message: err.message || 'リクエストが多すぎます'
    });
  }
  
  // 本番環境では詳細なエラー情報を非表示
  if (process.env.NODE_ENV === 'production') {
    res.status(err.status || 500).json({
      success: false,
      message: 'エラーが発生しました。もう一度お試しください。'
    });
  } else {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
      stack: err.stack
    });
  }
});
```

---

## 10. 実装チェックリスト

- [ ] DOMPurifyのインストールと実装
- [ ] すべての`innerHTML`使用箇所の修正
- [ ] CORS設定の修正
- [ ] CSRF対策の実装
- [ ] セッション固定攻撃対策の実装
- [ ] レート制限の実装
- [ ] ファイルアップロード検証の強化
- [ ] Content-Security-Policy ヘッダーの追加
- [ ] 入力検証の強化
- [ ] エラーハンドリングの改善
- [ ] セキュリティテストの再実行
- [ ] 本番環境での動作確認

---

## 11. テスト方法

修正後、以下のコマンドでテストを実行:

```bash
# セキュリティテストの実行
npx playwright test security-test.spec.js

# レポートの表示
npx playwright show-report
```

---

**注意**: これらの修正を段階的に実装し、各修正後にテストを実行して動作を確認してください。

