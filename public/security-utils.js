// セキュリティユーティリティ関数

// CSRFトークンの管理
let csrfToken = null;

// CSRFトークンを取得
async function getCsrfToken() {
    if (!csrfToken) {
        try {
            const response = await fetch('/api/csrf-token', {
                credentials: 'include'
            });
            const data = await response.json();
            csrfToken = data.csrfToken;
        } catch (error) {
            console.error('CSRFトークンの取得に失敗しました:', error);
        }
    }
    return csrfToken;
}

// セキュアなAPI呼び出し
async function secureApiCall(url, options = {}) {
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

// XSS対策: HTMLを安全にサニタイズ
function sanitizeHTML(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['i', 'strong', 'em', 'br'],
            ALLOWED_ATTR: ['class']
        });
    }
    // DOMPurifyが読み込まれていない場合は、HTMLタグを除去
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

// 安全な要素作成
function createSafeElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    // 属性を設定（XSS対策）
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'innerHTML') {
            element.innerHTML = sanitizeHTML(value);
        } else if (key === 'onclick' || key.startsWith('on')) {
            // イベントハンドラは直接設定しない（セキュリティ上の理由）
            console.warn(`警告: ${key}属性はセキュリティ上の理由で設定されませんでした`);
        } else {
            element.setAttribute(key, value);
        }
    }
    
    // テキストコンテンツを設定
    if (textContent) {
        element.textContent = textContent;
    }
    
    return element;
}

