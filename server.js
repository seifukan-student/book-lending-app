const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const ipKeyGenerator = rateLimit.ipKeyGenerator;
const crypto = require('crypto');
const sharp = require('sharp');
require('dotenv').config();
const sb = require('./lib/supabase-data');

const app = express();
const PORT = process.env.PORT || 3000;

// リバースプロキシ（Vercel 等）越しの HTTPS / Cookie を正しく扱う
app.set('trust proxy', 1);

app.use(cookieParser());

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'book-lending-secret-key-change-in-prod', // 環境変数で上書き可能に
  resave: false,
  saveUninitialized: false, // セキュリティ向上: 初期化されていないセッションは保存しない
  name: 'sessionId', // デフォルトのconnect.sidを変更
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // 本番環境ではtrue
    httpOnly: true, // XSS対策: クライアントスクリプトからCookieへのアクセスを防止
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: 'strict' // CSRF対策にも有効
  },
  // セッションID生成関数（セッション固定攻撃対策）
  genid: function(req) {
    return crypto.randomBytes(16).toString('hex');
  }
}));

// セキュリティヘッダーの設定
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By'); // 情報漏洩防止
  
  // Content-Security-Policy の追加
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "connect-src 'self' https://vision.googleapis.com https://*.supabase.co",
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

// 環境変数の設定
const config = {
  googleCloud: {
    apiKey: process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_CLOUD_API_KEY,
    apiUrl: 'https://vision.googleapis.com/v1/images:annotate'
  }
};

// 環境変数のデバッグ情報
console.log('🔧 環境変数設定:');
console.log('  - GOOGLE_VISION_API_KEY:', process.env.GOOGLE_VISION_API_KEY ? '設定済み' : '未設定');
console.log('  - GOOGLE_CLOUD_API_KEY:', process.env.GOOGLE_CLOUD_API_KEY ? '設定済み' : '未設定');
console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? '設定済み' : '未設定');
console.log('  - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '設定済み' : '未設定');
console.log('  - ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? `設定済み (長さ: ${process.env.ADMIN_PASSWORD.length}文字)` : '未設定 (デフォルト値を使用)');

// 貸出ステップの定義
const LENDING_STEPS = {
  INITIAL: 'initial',
  BOOK_FOUND: 'book_found',
  NAME_REQUEST: 'name_request',
  CONFIRM_PERIOD: 'confirm_period',
  SHOW_RULES: 'show_rules',
  COMPLETED: 'completed'
};

// CORS設定（セキュリティ向上）
function buildAllowedOrigins() {
  const defaults = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const fromEnv = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const vercelUrls = [];
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const v = process.env[key];
    if (!v) continue;
    const host = v.replace(/^https?:\/\//i, '').split('/')[0];
    vercelUrls.push(`https://${host}`);
  }
  return [...new Set([...defaults, ...fromEnv, ...vercelUrls])];
}
const allowedOrigins = buildAllowedOrigins();
const isVercelRuntime = process.env.VERCEL === '1';

function isHttpsVercelAppOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && (u.hostname.endsWith('.vercel.app') || u.hostname === 'vercel.app');
  } catch {
    return false;
  }
}

function isCorsOriginAllowed(origin) {
  if (allowedOrigins.includes(origin)) return true;
  if (isVercelRuntime && isHttpsVercelAppOrigin(origin)) return true;
  return false;
}

console.log(`🌐 CORS: ${allowedOrigins.length} explicit origin(s); Vercel *.vercel.app: ${isVercelRuntime ? 'on' : 'off'}`);

app.use(cors({
  origin: function (origin, callback) {
    // Origin なし: ローカル / 非本番は許可。Vercel 本番はアドレス直打ち等でも応答できるよう許可。
    if (!origin) {
      if (process.env.NODE_ENV !== 'production' || isVercelRuntime) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: Origin header is required'));
    }

    if (isCorsOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Length'],
  maxAge: 86400 // 24時間
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// リクエストログ
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// レート制限の設定
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 5回まで
  message: {
    success: false,
    error: 'ログイン試行回数が多すぎます。15分後に再試行してください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress;
    return ipKeyGenerator(ip || '0.0.0.0');
  },
  handler: (req, res) => {
    console.warn(`レート制限: ${req.ip} からの過剰なログイン試行`);
    res.status(429).json({
      success: false,
      error: 'ログイン試行回数が多すぎます。15分後に再試行してください。'
    });
  }
});

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

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 20, // 20回まで
  message: {
    success: false,
    error: 'アップロード回数が多すぎます。1時間後に再試行してください。'
  },
});

app.use(express.static('public'));

// CSRFトークン取得エンドポイント
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

// Multer設定（メモリストレージ）- セキュリティ強化
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MBに制限
  fileFilter: (req, file, cb) => {
    // 画像ファイルのみ許可
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

// 日付フォーマット関数
function formatDate(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  return `${month}月${day}日（${weekday}）`;
}

/**
 * Google Cloud Vision APIを使って画像からテキストを抽出
 */
async function extractTextFromImage(base64Image) {
  try {
    console.log('📸 画像からテキストを抽出中...');
    
    // APIキーの確認
    if (!config.googleCloud.apiKey) {
      throw new Error('Google Cloud Vision APIキーが設定されていません。環境変数GOOGLE_VISION_API_KEYまたはGOOGLE_CLOUD_API_KEYを設定してください。');
    }
    
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 50
            }
          ]
        }
      ]
    };

    // #region agent log
    writeDebugLog({location:'server.js:vision_api_request',message:'Sending request to Vision API',data:{url: config.googleCloud.apiUrl, keyPrefix: config.googleCloud.apiKey ? config.googleCloud.apiKey.substring(0, 5) : 'missing'},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'});
    // #endregion

    const response = await axios.post(
      `${config.googleCloud.apiUrl}?key=${config.googleCloud.apiKey}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'http://localhost:3000' // APIキー制限対策
        }
      }
    );

    if (response.data.responses && response.data.responses[0].textAnnotations) {
      const extractedText = response.data.responses[0].textAnnotations[0].description;
      console.log('✅ テキスト抽出成功:', extractedText);
      return extractedText;
    } else {
      console.log('⚠️  テキストが検出されませんでした');
      return '';
    }
  } catch (error) {
    // #region agent log
    writeDebugLog({location:'server.js:vision_api_error',message:'Vision API Error',data:{error: error.message, response: error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'});
    // #endregion
    
    const errorData = error.response?.data;
    
    // 課金エラーのチェック
    if (errorData?.error?.message?.includes('billing to be enabled') || 
        errorData?.error?.details?.some(d => d.reason === 'BILLING_DISABLED')) {
      const billingError = new Error('Google Cloud Vision APIの課金設定が無効です。Google Cloud Consoleで課金を有効にしてください。');
      billingError.code = 'BILLING_DISABLED';
      throw billingError;
    }
    
    // リファラー制限エラーのチェック
    if (errorData?.error?.details?.some(d => d.reason === 'API_KEY_HTTP_REFERRER_BLOCKED')) {
      const refererError = new Error('Google Cloud Vision APIキーの制限によりブロックされました。APIキーの制限設定を確認するか、IPアドレス制限に変更してください。');
      refererError.code = 'REFERRER_BLOCKED';
      throw refererError;
    }
    
    console.error('❌ Google Cloud Vision API エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Supabase から書籍を検索（タイトル部分一致）
 */
async function searchBookInSupabase(title) {
  console.log('📚 書籍を検索中:', title);
  writeDebugLog({
    location: 'server.js:supabase_search',
    message: 'Searching books',
    data: { title },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run2',
    hypothesisId: 'B'
  });
  const book = await sb.searchBookByTitle(title);
  if (book) {
    console.log('✅ 書籍が見つかりました:', book.fields.タイトル || book.fields.Title);
  } else {
    console.log('⚠️  書籍が見つかりませんでした');
  }
  return book;
}

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

// CSRF: サーバレス（Vercel）ではメモリセッションが共有されないため、Cookie + ヘッダのダブルサブミットで検証する
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_TOKEN_HEX_LEN = 64;

function csrfCookieOptions() {
  const prodLike = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  return {
    httpOnly: false,
    secure: prodLike,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24
  };
}

function generateCsrfToken(req, res) {
  const existing = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  const token =
    existing && typeof existing === 'string' && /^[a-f0-9]{64}$/i.test(existing)
      ? existing
      : crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

function csrfTokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function verifyCsrfToken(req, res, next) {
  // GETリクエストは除外
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];

  if (
    !headerToken ||
    !cookieToken ||
    typeof headerToken !== 'string' ||
    typeof cookieToken !== 'string' ||
    headerToken.length !== CSRF_TOKEN_HEX_LEN ||
    cookieToken.length !== CSRF_TOKEN_HEX_LEN ||
    !csrfTokensEqual(headerToken, cookieToken)
  ) {
    return res.status(403).json({
      success: false,
      message: 'CSRFトークンが無効です。ページを再読み込みしてください。'
    });
  }

  next();
}

/**
 * 生徒情報を取得（スペースの有無を柔軟に対応）
 */
async function getStudentInfo(nameOrId) {
  console.log('👤 生徒情報を取得中:', nameOrId);
  const student = await sb.getStudentInfo(nameOrId);
  if (student) {
    console.log('✅ 生徒情報を取得しました:', student.fields.名前 || student.fields.Name);
  } else {
    console.log('⚠️ すべての検索方法で生徒が見つかりませんでした');
  }
  return student;
}

/**
 * 貸出レコードを作成
 */
async function createLoanRecord(book, student) {
  console.log('📝 貸出レコードを作成中...');
  const loanRecord = await sb.createLoanRecord(book, student);
  console.log('✅ 貸出レコードを作成しました:', loanRecord.id);
  return loanRecord;
}

/**
 * 書籍のステータスを「貸出中」に更新
 */
async function updateBookStatus(book) {
  try {
    console.log('📚 書籍ステータスを更新中...');
    await sb.updateBookStatusTo(book.id, '貸出中');
    console.log('✅ 書籍ステータスを「貸出中」に更新しました');
    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  } catch (error) {
    console.error('❌ 書籍ステータス更新エラー:', error.message);
    console.log('⚠️  書籍ステータス更新に失敗しましたが、貸出記録は作成されているため処理を続行します');
    return null;
  }
}

/**
 * 書籍のステータスを「貸出可」に戻す
 */
async function returnBookStatus(book) {
  try {
    console.log('📚 書籍ステータスを「貸出可」に戻しています...');
    await sb.updateBookStatusTo(book.id, '貸出可');
    console.log('✅ 書籍ステータスを「貸出可」に戻しました');
    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  } catch (error) {
    console.error('❌ 書籍ステータス復元エラー:', error.message);
    console.log('⚠️  書籍ステータス更新に失敗しましたが、返却記録は更新されているため処理を続行します');
    return null;
  }
}

/**
 * 貸出記録を検索
 */
async function findLoanRecord(book, student) {
  console.log('🔍 貸出記録を検索中...');
  console.log('📖 検索する書籍ID:', book.id);
  console.log('👤 検索する生徒ID:', student.id);
  const record = await sb.findActiveLoan(book, student);
  if (record) {
    console.log('✅ 貸出記録が見つかりました:', record.id);
    console.log('📋 レコードの詳細:', JSON.stringify(record.fields, null, 2));
  } else {
    console.log('⚠️  該当する貸出記録が見つかりませんでした');
  }
  return record;
}

/**
 * 返却処理を実行
 */
async function processReturn(loanRecord) {
  try {
    console.log('📝 返却処理を実行中...');
    console.log('🔍 既存のレコード情報:', JSON.stringify(loanRecord.fields, null, 2));
    await sb.processReturn(loanRecord);
    console.log('✅ 返却処理が完了しました:', loanRecord.id);
    return { id: loanRecord.id };
  } catch (error) {
    console.error('❌ 返却処理エラー:', error.message);
    const detailedError = new Error(`返却処理に失敗しました: ${error.message}`);
    detailedError.originalError = error;
    detailedError.statusCode = 422;
    throw detailedError;
  }
}

/**
 * 書籍の利用可能性をチェック（貸出記録から判定）
 */
async function checkBookAvailability(bookId) {
  try {
    console.log('📚 書籍の利用可能性をチェック中...');
    console.log('📖 書籍ID:', bookId);
    const ok = await sb.checkBookAvailability(bookId);
    if (ok) {
      console.log('✅ この書籍は利用可能です');
    } else {
      console.log('❌ この書籍は現在貸出中です');
    }
    return ok;
  } catch (error) {
    console.error('❌ 書籍利用可能性チェックエラー:', error.message);
    return false;
  }
}

/**
 * 生徒の現在の貸出冊数をチェック
 */
async function checkStudentLoanCount(student) {
  try {
    console.log('📊 生徒の貸出冊数をチェック中...');
    console.log('👤 生徒ID:', student.id);
    const result = await sb.checkStudentLoanCount(student);
    console.log(`📚 現在の貸出冊数: ${result.count}/4冊`);
    if (result.count > 0) {
      console.log('📋 貸出中の書籍:');
      result.currentLoans.forEach((loan, index) => {
        const title = loan.fields['タイトル (from 本)']?.[0] || '不明';
        const dueDate = loan.fields['返却期限'] || '不明';
        console.log(`  ${index + 1}. ${title} (期限: ${dueDate})`);
        console.log(`     レコードID: ${loan.id}`);
        console.log(`     返却状況: ${loan.fields.返却状況}`);
        console.log(`     生徒ID: ${loan.fields.生徒}`);
      });
    }
    return result;
  } catch (error) {
    console.error('❌ 貸出冊数チェックエラー:', error.message);
    return { count: 0, isAtLimit: false, currentLoans: [] };
  }
}

/**
 * 返却期限をチェック
 */
function checkReturnDeadline(dueDate) {
  const today = new Date();
  const deadline = new Date(dueDate);
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return {
    daysRemaining: diffDays,
    isEarly: diffDays >= 2, // 2日以上前
    isOverdue: diffDays < 0
  };
}

// ルート設定
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// favicon対応（404エラーを防ぐ）
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

const fs = require('fs');

// ログ書き込み用関数
function writeDebugLog(payload) {
  const logPath = '/Users/Ryo/book-lending-vision/.cursor/debug.log';
  try {
    fs.appendFileSync(logPath, JSON.stringify(payload) + '\n');
  } catch (e) {
    console.error('Logging failed:', e);
  }
}

// ステップ1: 書籍画像をアップロードして検索
app.post('/api/step1', uploadLimiter, upload.single('bookImage'), validateImageFile, verifyCsrfToken, async (req, res) => {
  // #region agent log
  writeDebugLog({location:'server.js:step1_entry',message:'Step 1 request received',data:{hasFile: !!req.file, fileSize: req.file ? req.file.size : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'});
  // #endregion
  try {
    console.log('🚀 ステップ1: 書籍検索を開始します');
    
    // 環境変数の確認
    // #region agent log
    writeDebugLog({location:'server.js:env_check',message:'Checking env vars',data:{googleKey: !!config.googleCloud.apiKey, supabase: sb.isConfigured()},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'});
    // #endregion
    console.log('🔧 環境変数チェック:');
    console.log('  - Google Vision API Key:', !!config.googleCloud.apiKey);
    console.log('  - Supabase:', sb.isConfigured() ? '設定済み' : '未設定');
    
    if (!config.googleCloud.apiKey) {
      return res.status(500).json({
        success: false,
        message: 'Google Vision API キーが設定されていません。'
      });
    }
    
    if (!sb.isConfigured()) {
      return res.status(500).json({
        success: false,
        message: 'Supabase設定が不完全です（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。'
      });
    }

    const imageFile = req.file;
    console.log('📸 画像ファイル:', imageFile ? imageFile.originalname : 'なし');

    if (!imageFile) {
      return res.status(400).json({ 
        success: false, 
        message: '画像ファイルが必要です' 
      });
    }

    // 画像をbase64エンコード
    const base64Image = imageFile.buffer.toString('base64');
    console.log('📊 Base64エンコード完了:', base64Image.length, '文字');
    
    // 画像からテキストを抽出
    console.log('🔍 Google Vision API でテキスト抽出開始...');
    // #region agent log
    writeDebugLog({location:'server.js:before_extract',message:'Calling extractTextFromImage',data:{imageLength: base64Image.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'});
    // #endregion
    const extractedText = await extractTextFromImage(base64Image);
    // #region agent log
    writeDebugLog({location:'server.js:after_extract',message:'Extracted text',data:{textLength: extractedText ? extractedText.length : 0, sample: extractedText ? extractedText.substring(0, 50) : null},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'});
    // #endregion
    if (!extractedText) {
      return res.status(400).json({ 
        success: false, 
        message: '画像からテキストを抽出できませんでした' 
      });
    }

    console.log('📝 抽出されたテキスト:', extractedText.substring(0, 200) + '...');

    // 抽出されたテキストから書籍を検索
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    console.log('🔍 検索対象行数:', lines.length);
    
    let bookFound = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 3) {
        console.log('🔍 書籍検索中:', trimmedLine);
        // #region agent log
        writeDebugLog({location:'server.js:before_search',message:'Searching Supabase books',data:{query: trimmedLine},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'});
        // #endregion
        bookFound = await searchBookInSupabase(trimmedLine);
        if (bookFound) {
          console.log('✅ 書籍が見つかりました:', trimmedLine);
          // #region agent log
          writeDebugLog({location:'server.js:book_found',message:'Book found',data:{bookId: bookFound.id, fields: bookFound.fields},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'});
          // #endregion
          break;
        }
      }
    }

    if (!bookFound) {
      console.log('❌ 書籍が見つかりませんでした');
      return res.status(404).json({ 
        success: false, 
        message: '申し訳ございませんが、この書籍は見つかりませんでした。' 
      });
    }

    // 書籍の利用可能性を貸出記録から直接チェック
    console.log('📊 書籍フィールド一覧:', Object.keys(bookFound.fields));
    console.log('📊 書籍の全フィールド:', JSON.stringify(bookFound.fields, null, 2));
    
    const bookStatus = bookFound.fields.status || bookFound.fields.Status || bookFound.fields.ステータス;
    console.log('📊 書籍ステータス:', bookStatus);
    
    // 貸出記録から実際の利用可能性を確認
    console.log('🔍 この書籍の実際の貸出状況を確認中...');
    const isBookAvailable = await checkBookAvailability(bookFound.id);
    
    if (!isBookAvailable) {
      return res.status(400).json({ 
        success: false, 
        message: `申し訳ございませんが、この書籍は現在貸出中です。`,
        book: bookFound.fields
      });
    }

    // セッションに書籍情報を保存
    req.session.book = bookFound;
    req.session.step = LENDING_STEPS.BOOK_FOUND;

    console.log('✅ ステップ1処理完了');
    res.json({
      success: true,
      message: '🙆‍♀️この本は貸出可能です',
      data: {
        book: {
          id: bookFound.id,
          title: bookFound.fields.タイトル || bookFound.fields.Title,
          author: bookFound.fields.著者 || bookFound.fields.Author
        },
        step: LENDING_STEPS.BOOK_FOUND,
        nextAction: 'borrow_or_cancel'
      }
    });

  } catch (error) {
    // #region agent log
    writeDebugLog({location:'server.js:step1_error',message:'Error in step1',data:{errorName: error.name, errorMessage: error.message, stack: error.stack, responseStatus: error.response?.status, responseData: error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'});
    // #endregion
    console.error('❌ ステップ1エラー詳細:');
    console.error('  - エラーメッセージ:', error.message);
    console.error('  - エラータイプ:', error.constructor.name);
    console.error('  - スタックトレース:', error.stack);
    
    if (error.response) {
      console.error('  - HTTP レスポンス:', error.response.status, error.response.statusText);
      console.error('  - レスポンスデータ:', error.response.data);
    }
    
    if (error.code === 'BILLING_DISABLED') {
      return res.status(403).json({
        success: false,
        message: 'Google Cloud Vision APIの課金設定が無効です。管理者に連絡してください。',
        error: {
          type: 'billing_disabled',
          message: error.message
        }
      });
    }
    
    if (error.code === 'REFERRER_BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'APIキーの制限によりアクセスが拒否されました。管理者に連絡してください。',
        error: {
          type: 'referrer_blocked',
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false, 
      message: 'エラーが発生しました。もう一度お試しください。',
      error: {
        type: error.constructor.name,
        message: error.message
      }
    });
  }
});

// ステップ2: 「借りる」ボタンを押した時の処理
app.post('/api/step2', apiLimiter, verifyCsrfToken, (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'cancel') {
      req.session.destroy();
      return res.json({
        success: true,
        message: 'キャンセルしました。',
        data: { step: LENDING_STEPS.INITIAL }
      });
    }

    if (action === 'borrow' && req.session.book) {
      req.session.step = LENDING_STEPS.NAME_REQUEST;
      
      res.json({
        success: true,
        message: '📝名前を入力してください',
        data: {
          step: LENDING_STEPS.NAME_REQUEST,
          nextAction: 'enter_name'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

  } catch (error) {
    console.error('❌ ステップ2エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// ステップ3: 名前を入力した時の処理
app.post('/api/step3', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!req.session.book) {
      return res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

    // 入力検証
    let validatedName;
    try {
      validatedName = validateInput(name, 'string', {
        required: true,
        fieldName: '名前',
        maxLength: 100,
        minLength: 1
      });
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

    // 名前で生徒を検索（生徒IDフィールドで検索）
    const student = await getStudentInfo(validatedName);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: '申し訳ございませんが、その名前の生徒が見つかりませんでした。'
      });
    }

    // 生徒の現在の貸出冊数をチェック
    const loanCheck = await checkStudentLoanCount(student);
    if (loanCheck.isAtLimit) {
      return res.status(400).json({
        success: false,
        message: `申し訳ございませんが、${student.fields.名前 || student.fields.Name}さんは既に4冊借りているため、これ以上借りることができません。まず返却をお願いします。`
      });
    }

    // セッションに生徒情報を保存
    req.session.student = student;
    req.session.step = LENDING_STEPS.CONFIRM_PERIOD;

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 14);

    res.json({
      success: true,
      message: `⏳貸出期間は本日から2週間後の【${formatDate(dueDate)}】までです`,
      data: {
        student: {
          name: student.fields.名前 || student.fields.Name,
          studentId: student.fields.生徒ID || student.fields.StudentID
        },
        dueDate: formatDate(dueDate),
        step: LENDING_STEPS.CONFIRM_PERIOD,
        nextAction: 'agree_or_cancel'
      }
    });

  } catch (error) {
    console.error('❌ ステップ3エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// ステップ4: 貸出期間に同意した時の処理
app.post('/api/step4', apiLimiter, verifyCsrfToken, (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'cancel') {
      req.session.destroy();
      return res.json({
        success: true,
        message: 'キャンセルしました。',
        data: { step: LENDING_STEPS.INITIAL }
      });
    }

    if (action === 'agree' && req.session.book && req.session.student) {
      req.session.step = LENDING_STEPS.SHOW_RULES;
      
      const rules = `📚 貸出ルール
貸出期間は2週間、最大4冊まで
返却期限は必ず守ること（延長希望は事前申請）
書き込み・落書き・マーカーの使用は禁止
汚損・破損・紛失した場合は原則弁償
長期未返却やルール違反が続いた場合、貸出停止の可能性あり`;

      res.json({
        success: true,
        message: rules,
        data: {
          step: LENDING_STEPS.SHOW_RULES,
          nextAction: 'agree_or_cancel'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

  } catch (error) {
    console.error('❌ ステップ4エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// ステップ5: 貸出ルールに同意した時の処理（最終処理）
app.post('/api/step5', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'cancel') {
      req.session.destroy();
      return res.json({
        success: true,
        message: 'キャンセルしました。',
        data: { step: LENDING_STEPS.INITIAL }
      });
    }

    if (action === 'agree' && req.session.book && req.session.student) {
      // 貸出レコードを作成
      const loanRecord = await createLoanRecord(req.session.book, req.session.student);
      
      // 書籍ステータスを更新
      await updateBookStatus(req.session.book);

      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() + 14);

      const finalMessage = `🫡ご利用ありがとうございます。返却期限は【${formatDate(dueDate)}】です`;

      // セッションをクリア
      req.session.destroy();

      res.json({
        success: true,
        message: finalMessage,
        data: {
          step: LENDING_STEPS.COMPLETED,
          loan: {
            id: loanRecord.id,
            dueDate: formatDate(dueDate)
          },
          redirectToMain: true
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

  } catch (error) {
    console.error('❌ ステップ5エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// セッションリセット
app.post('/api/reset', apiLimiter, verifyCsrfToken, (req, res) => {
  req.session.destroy();
  res.json({
    success: true,
    message: 'セッションをリセットしました。',
    data: { step: LENDING_STEPS.INITIAL }
  });
});

// ========== 延長申請システムのAPIエンドポイント ==========

// 延長ステップ1: 生徒の貸出一覧を取得
app.post('/api/extend-step1', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { name } = req.body;

    // 入力検証
    let validatedName;
    try {
      validatedName = validateInput(name, 'string', {
        required: true,
        fieldName: '名前',
        maxLength: 100,
        minLength: 1
      });
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

    console.log('🔄 延長申請ステップ1: 生徒の貸出一覧を取得');
    console.log('👤 生徒名:', name);

    // 名前で生徒を検索
    const student = await getStudentInfo(name);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: '申し訳ございませんが、その名前の生徒が見つかりませんでした。'
      });
    }

    // 生徒の現在の貸出一覧を取得
    const loanCheck = await checkStudentLoanCount(student);
    
    if (loanCheck.count === 0) {
      return res.status(200).json({
        success: true,
        message: '現在借りている本がありません。',
        data: {
          student: {
            name: student.fields.名前 || student.fields.Name,
            id: student.id
          },
          loans: []
        }
      });
    }

    // 貸出一覧を延長申請用に整形
    const loans = loanCheck.currentLoans.map(loan => {
      const dueDate = new Date(loan.fields.返却期限);
      const today = new Date();
      const isOverdue = dueDate < today;
      const extendCount = loan.fields.延長回数 || 0;
      
      // 延長申請の条件を緩和：
      // 1. 延滞していても延長可能
      // 2. 2日前から延長申請可能
      // 3. 延長回数が1回未満
      const twoDaysBeforeDue = new Date(dueDate);
      twoDaysBeforeDue.setDate(twoDaysBeforeDue.getDate() - 2);
      
      const canExtendByDate = today >= twoDaysBeforeDue; // 2日前から申請可能
      const canExtend = canExtendByDate && extendCount < 1; // 2日前から、かつ延長回数が1回未満
      
      // 延長後の期限を計算
      const newDueDate = new Date(dueDate);
      newDueDate.setDate(newDueDate.getDate() + 7);
      
      return {
        id: loan.id,
        title: loan.fields['タイトル (from 本)']?.[0] || '不明な書籍',
        dueDate: formatDate(dueDate),
        newDueDate: formatDate(newDueDate),
        isOverdue: isOverdue,
        canExtend: canExtend,
        extendCount: extendCount,
        canExtendByDate: canExtendByDate
      };
    });

    console.log(`📚 ${student.fields.名前 || student.fields.Name}さんの貸出一覧: ${loans.length}冊`);

    res.json({
      success: true,
      data: {
        student: {
          name: student.fields.名前 || student.fields.Name,
          id: student.id
        },
        loans: loans
      }
    });

  } catch (error) {
    console.error('❌ 延長申請ステップ1エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。もう一度お試しください。'
    });
  }
});

// 延長ステップ2: 延長処理を実行
app.post('/api/extend-step2', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { loanId, studentName } = req.body;

    if (!loanId || !studentName) {
      return res.status(400).json({
        success: false,
        message: '必要な情報が不足しています。'
      });
    }

    console.log('🔄 延長申請ステップ2: 延長処理を実行');
    console.log('📖 貸出ID:', loanId);
    console.log('👤 生徒名:', studentName);

    const loanRecord = await sb.getLoanByIdForExtend(loanId);
    if (!loanRecord) {
      return res.status(404).json({
        success: false,
        message: '貸出記録が見つかりませんでした。'
      });
    }

    const dueDate = new Date(loanRecord.fields.返却期限);
    const today = new Date();
    const extendCount = loanRecord.fields.延長回数 || 0;

    if (extendCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'この書籍は既に延長済みです。これ以上延長できません。'
      });
    }

    const twoDaysBeforeDue = new Date(dueDate);
    twoDaysBeforeDue.setDate(twoDaysBeforeDue.getDate() - 2);

    if (today < twoDaysBeforeDue) {
      return res.status(400).json({
        success: false,
        message: `延長申請は返却期限の2日前（${formatDate(twoDaysBeforeDue)}）から可能です。`
      });
    }

    const newDueDate = new Date(dueDate);
    newDueDate.setDate(newDueDate.getDate() + 7);
    const newDueStr = newDueDate.toISOString().split('T')[0];

    await sb.updateLoanDueAndExtend(loanId, newDueStr, extendCount + 1);

    const bookTitle = loanRecord.fields['タイトル (from 本)']?.[0] || '不明な書籍';
    console.log(`✅ 延長処理が完了しました: ${bookTitle}`);
    console.log(`📅 新しい返却期限: ${formatDate(newDueDate)}`);

    res.json({
      success: true,
      message: `延長申請が完了しました！\n\n書籍: ${bookTitle}\n新しい返却期限: ${formatDate(newDueDate)}`,
      data: {
        loanId: loanId,
        bookTitle: bookTitle,
        newDueDate: formatDate(newDueDate),
        redirectToMain: true
      }
    });

  } catch (error) {
    console.error('❌ 延長申請ステップ2エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。もう一度お試しください。'
    });
  }
});

// ========== 返却システムのAPIエンドポイント ==========

// 返却ステップ1: 書籍画像をアップロードして検索
app.post('/api/return-step1', uploadLimiter, upload.single('bookImage'), validateImageFile, verifyCsrfToken, async (req, res) => {
  try {
    const imageFile = req.file;

    console.log('🚀 返却ステップ1: 書籍検索を開始します');
    console.log('📸 画像ファイル:', imageFile ? imageFile.originalname : 'なし');

    if (!imageFile) {
      return res.status(400).json({ 
        success: false, 
        message: '画像ファイルが必要です' 
      });
    }

    // 画像をbase64エンコード
    const base64Image = imageFile.buffer.toString('base64');

    // 画像からテキストを抽出
    const extractedText = await extractTextFromImage(base64Image);
    if (!extractedText) {
      return res.status(400).json({ 
        success: false, 
        message: '画像からテキストを抽出できませんでした' 
      });
    }

    // 抽出されたテキストから書籍を検索
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    let bookFound = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 3) {
        bookFound = await searchBookInSupabase(trimmedLine);
        if (bookFound) {
          break;
        }
      }
    }

    if (!bookFound) {
      return res.status(404).json({ 
        success: false, 
        message: '申し訳ございませんが、この書籍は見つかりませんでした。' 
      });
    }

    // 書籍のステータスを確認（貸出中である必要がある）
    const bookStatus = bookFound.fields.status || bookFound.fields.Status;
    if (bookStatus !== '貸出中') {
      return res.status(400).json({ 
        success: false, 
        message: `この書籍は現在貸出中ではありません。（現在のステータス: ${bookStatus}）`
      });
    }

    // セッションに書籍情報を保存
    req.session.returnBook = bookFound;
    req.session.returnStep = 'book_found';

    res.json({
      success: true,
      message: '📚この本の返却処理を行います',
      data: {
        book: {
          id: bookFound.id,
          title: bookFound.fields.タイトル || bookFound.fields.Title,
          author: bookFound.fields.著者 || bookFound.fields.Author
        },
        step: 'return_book_found',
        nextAction: 'return_or_cancel'
      }
    });

  } catch (error) {
    console.error('❌ 返却ステップ1エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。もう一度お試しください。'
    });
  }
});

// 返却ステップ2: 「返却する」ボタンを押した時の処理
app.post('/api/return-step2', apiLimiter, verifyCsrfToken, (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'cancel') {
      req.session.destroy();
      return res.json({
        success: true,
        message: 'キャンセルしました。',
        data: { step: 'initial' }
      });
    }

    if (action === 'return' && req.session.returnBook) {
      req.session.returnStep = 'name_request';
      
      res.json({
        success: true,
        message: '📝名前を入力してください',
        data: {
          step: 'return_name_request',
          nextAction: 'enter_name'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

  } catch (error) {
    console.error('❌ 返却ステップ2エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// 返却ステップ3: 名前を入力した時の処理
app.post('/api/return-step3', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!req.session.returnBook) {
      return res.status(400).json({
        success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

    // 入力検証
    let validatedName;
    try {
      validatedName = validateInput(name, 'string', {
        required: true,
        fieldName: '名前',
        maxLength: 100,
        minLength: 1
      });
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

    // 名前で生徒を検索
    const student = await getStudentInfo(name);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: '申し訳ございませんが、その名前の生徒が見つかりませんでした。'
      });
    }

    // 貸出記録を検索
    const loanRecord = await findLoanRecord(req.session.returnBook, student);
    if (!loanRecord) {
      return res.status(404).json({
        success: false,
        message: 'この書籍の貸出記録が見つかりませんでした。別の方が借りているか、既に返却済みの可能性があります。'
      });
    }

    // セッションに生徒情報と貸出記録を保存
    req.session.returnStudent = student;
    req.session.loanRecord = loanRecord;
    req.session.returnStep = 'check_deadline';

    // 返却期限をチェック
    const dueDate = loanRecord.fields.返却期限;
    const deadlineCheck = checkReturnDeadline(dueDate);
    
    let message = '';
    if (deadlineCheck.isOverdue) {
      message = `⚠️返却期限を${Math.abs(deadlineCheck.daysRemaining)}日過ぎています。至急返却してください。`;
    } else if (deadlineCheck.isEarly) {
      message = `⏰まだ${deadlineCheck.daysRemaining}日残っていますが返却しますか？`;
    } else {
      message = `📅返却期限は${formatDate(new Date(dueDate))}です。返却処理を続行しますか？`;
    }

    res.json({
      success: true,
      message: message,
      data: {
        student: {
          name: student.fields.名前 || student.fields.Name,
          studentId: student.fields.生徒ID || student.fields.StudentID
        },
        dueDate: formatDate(new Date(dueDate)),
        daysRemaining: deadlineCheck.daysRemaining,
        isOverdue: deadlineCheck.isOverdue,
        step: 'return_check_deadline',
        nextAction: 'confirm_or_cancel'
      }
    });

  } catch (error) {
    console.error('❌ 返却ステップ3エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// 返却ステップ4: 返却確認
app.post('/api/return-step4', apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'cancel') {
      req.session.destroy();
      return res.json({
        success: true,
        message: 'キャンセルしました。',
        data: { step: 'initial' }
      });
    }

    if (action === 'confirm' && req.session.returnBook && req.session.returnStudent && req.session.loanRecord) {
      try {
        // 返却処理を実行
        await processReturn(req.session.loanRecord);
        
        // 書籍ステータスを「貸出可」に戻す
        await returnBookStatus(req.session.returnBook);

        const finalMessage = `✅返却処理が完了しました。ありがとうございました。`;

        // セッションをクリア
        req.session.destroy();

        res.json({
          success: true,
          message: finalMessage,
          data: {
            step: 'return_completed',
            redirectToMain: true
          }
        });
      } catch (returnError) {
        console.error('❌ 返却処理中にエラーが発生しました:', returnError);
        console.error('   - エラーメッセージ:', returnError.message);
        console.error('   - エラータイプ:', returnError.constructor.name);
        
        // セッションをクリア
        req.session.destroy();
        
        // 422エラーの場合は詳細なメッセージを返す
        if (returnError.statusCode === 422) {
          res.status(422).json({
      success: false,
            message: `返却処理に失敗しました: ${returnError.message}`,
            error: {
              type: 'supabase_update_error',
              details: returnError.originalError?.message || returnError.message
            }
          });
        } else {
          res.status(500).json({
            success: false,
            message: '返却処理中にエラーが発生しました。システム管理者にお問い合わせください。',
            error: {
              type: 'internal_server_error',
              message: returnError.message
            }
          });
        }
      }
    } else {
      res.status(400).json({
      success: false,
        message: 'セッションが無効です。最初からやり直してください。'
      });
    }

  } catch (error) {
    console.error('❌ 返却ステップ4エラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました。'
    });
  }
});

// デバッグ用: 特定の書籍の全貸出記録を確認
app.get('/api/debug/book/:bookId/loans', async (req, res) => {
  try {
    const { bookId } = req.params;
    console.log(`🔍 デバッグ: 書籍${bookId}の全貸出記録を取得`);
    
    const rows = await sb.debugLoansForBook(bookId);
    const bookLoans = rows.map((loan) => ({
      id: loan.id,
      fields: {
        本: [loan.book_id],
        生徒: [loan.student_id],
        貸出日: loan.loan_date,
        返却期限: loan.due_date,
        返却状況: loan.return_status,
        extend_count: loan.extend_count
      },
      createdTime: loan.created_at
    }));

    console.log(`📊 書籍${bookId}の貸出記録数: ${bookLoans.length}`);

    res.json({
      success: true,
      data: {
        bookId: bookId,
        totalRecords: bookLoans.length,
        loans: bookLoans
      }
    });
    
  } catch (error) {
    console.error('❌ 貸出記録デバッグエラー:', error);
    res.status(500).json({
      success: false,
      message: 'エラーが発生しました'
    });
  }
});

// 管理者認証
app.post('/api/admin/login', loginLimiter, (req, res) => {
  try {
    const { password } = req.body;
    // セキュリティ向上: 環境変数が設定されていない場合はログインを許可しない（または非常に強力なデフォルトにする）
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('❌ セキュリティ警告: ADMIN_PASSWORD環境変数が設定されていません。管理者ログインは無効化されています。');
      return res.status(500).json({ success: false, error: 'サーバー設定エラー: 管理者パスワードが設定されていません' });
    }
    
    // デバッグログ（パスワードそのものは出力しない）
    console.log('🔐 管理者認証試行:');
    console.log('  - 環境変数ADMIN_PASSWORDの状態:', process.env.ADMIN_PASSWORD ? `設定済み (長さ: ${process.env.ADMIN_PASSWORD.length}文字)` : '未設定 (デフォルト値を使用)');
    console.log('  - 使用中のパスワード長:', adminPassword.length, '文字');
    console.log('  - 入力されたパスワード長:', password ? password.length : 0, '文字');
    
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
        generateCsrfToken(req, res); // Cookie ベース CSRF（サーバレス対応）

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

// 管理者認証チェック
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ success: false, error: '管理者認証が必要です' });
  }
}

// 画像解析API（管理者専用）
app.post('/api/admin/analyze-image', requireAdmin, apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ success: false, error: '画像データが提供されていません' });
    }
    
    console.log('📸 管理者: 画像解析を開始');
    
    // Vision APIでテキスト抽出
    const extractedText = await extractTextFromImage(imageData);
    
    if (!extractedText) {
      return res.status(400).json({ success: false, error: '画像からテキストを抽出できませんでした' });
    }
    
    // 抽出されたテキストから書籍情報を解析
    const bookInfo = parseBookInfoFromText(extractedText);
    
    console.log('✅ 管理者: 画像解析完了', bookInfo);
    
    res.json({
      success: true,
      ...bookInfo
    });
    
  } catch (error) {
    console.error('❌ 管理者画像解析エラー:', error);
    res.status(500).json({ success: false, error: '画像解析中にエラーが発生しました' });
  }
});

// 書籍登録API（管理者専用）
app.post('/api/admin/register-book', requireAdmin, apiLimiter, verifyCsrfToken, async (req, res) => {
  try {
    const { title, author, isbn, publisher, description, tags, imageData } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, error: 'タイトルは必須です' });
    }
    
    console.log('📚 管理者: 書籍登録を開始', { title, author, isbn, publisher, tags });
    
    const bookRecord = await registerBookToSupabase({
      title,
      author,
      isbn,
      publisher,
      description,
      tags,
      imageData
    });
    
    console.log('✅ 管理者: 書籍登録完了', bookRecord.id);
    
    res.json({
      success: true,
      message: '書籍の登録が完了しました',
      bookId: bookRecord.id
    });
    
  } catch (error) {
    console.error('❌ 管理者書籍登録エラー:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    res.status(500).json({ 
      success: false, 
      error: '書籍登録中にエラーが発生しました',
      details: error.response?.data || error.message
    });
  }
});

// テキストから書籍情報を解析する関数
function parseBookInfoFromText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  let title = '';
  let author = '';
  let isbn = '';
  let publisher = '';
  let description = '';
  let tags = [];
  
  // タイトルは最初の行または「著者」の前の行を想定
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // ISBNの検出（13桁または10桁の数字）
    const isbnMatch = line.match(/\b(\d{10}|\d{13})\b/);
    if (isbnMatch && !isbn) {
      isbn = isbnMatch[1];
    }
    
    // 著者の検出（「著」「著者」「編」「編者」などのキーワード）
    if (line.includes('著') || line.includes('編') || line.includes('作')) {
      if (!author) {
        author = line.replace(/[著編作]/g, '').trim();
      }
    }
    
    // 出版社の検出（「出版」「社」「株式会社」などのキーワード）
    if (line.includes('出版') || line.includes('社') || line.includes('株式会社')) {
      if (!publisher) {
        publisher = line.trim();
      }
    }
  }
  
  // タグの自動提案（既存のタグのみ）
  const titleLower = title.toLowerCase();
  const authorLower = author.toLowerCase();
  
  // 既存のタグのみを使用
  if (titleLower.includes('英検') || titleLower.includes('英語') || authorLower.includes('旺文社')) {
    tags.push('英検');
  }
  if (titleLower.includes('過去問') || titleLower.includes('問題集')) {
    tags.push('過去問');
  }
  
  // 重複を除去
  tags = [...new Set(tags)];
  
  // タイトルは最初の有効な行を想定
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineIsbnMatch = line.match(/\b(\d{10}|\d{13})\b/);
    if (line && !line.includes('著') && !line.includes('編') && !line.includes('作') && 
        !line.includes('出版') && !line.includes('社') && !lineIsbnMatch) {
      title = line;
      break;
    }
  }
  
  return {
    title,
    author,
    isbn,
    publisher,
    description,
    tags
  };
}

async function registerBookToSupabase(bookData) {
  console.log('📚 Supabaseに書籍を登録中:', bookData.title);
  return sb.registerBook(bookData);
}

// ヘルスチェック（機密情報を非表示）
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    config: {
      hasGoogleVisionKey: !!config.googleCloud.apiKey,
      hasSupabase: sb.isConfigured(),
      hasAdminPassword: !!process.env.ADMIN_PASSWORD
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000
    }
  });
});

// 明示的な静的ファイル配信（Vercel対応）
app.get('/borrow.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'borrow.html'));
});

app.get('/return.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'return.html'));
});

app.get('/extend.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'extend.html'));
});

app.get('/borrow.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'borrow.js'));
});

app.get('/return.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'return.js'));
});

app.get('/extend.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'extend.js'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.js'));
});

app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin-register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // CSRFエラー
  if (err.message && err.message.includes('CSRF')) {
    return res.status(403).json({
      success: false,
      message: 'CSRFトークンが無効です。ページを再読み込みしてください。'
    });
  }
  
  // CORSエラー
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation'
    });
  }
  
  // Multerエラー（ファイルアップロード）
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'ファイルサイズが大きすぎます（最大10MB）'
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

// 404ハンドラー（全ての未定義ルート）
app.use('*', (req, res) => {
  console.log(`404 - リソースが見つかりません: ${req.method} ${req.originalUrl}`);
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      message: 'APIエンドポイントが見つかりません',
      path: req.originalUrl
    });
  } else {
    res.status(404).end();
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 サーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 ブラウザで http://localhost:${PORT} にアクセスしてください`);
}); 