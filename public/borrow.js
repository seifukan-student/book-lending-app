// アプリケーションの状態管理
let currentStep = 'initial';
let selectedFile = null;
let cameraStream = null;
/** Vercel 等サーバレスではセッションが共有されないため、API に毎回送る */
let currentLendingBookId = null;
let currentLendingStudentRecordId = null;

// DOM要素の取得
const elements = {
    initialPrompt: document.getElementById('initialPrompt'),
    chatContainer: document.getElementById('chatContainer'),
    messages: document.getElementById('messages'),
    uploadSection: document.getElementById('uploadSection'),
    uploadArea: document.getElementById('uploadArea'),
    bookImage: document.getElementById('bookImage'),
    imagePreview: document.getElementById('imagePreview'),
    uploadBtn: document.getElementById('uploadBtn'),
    nameSection: document.getElementById('nameSection'),
    nameInput: document.getElementById('nameInput'),
    nameSubmitBtn: document.getElementById('nameSubmitBtn'),
    loading: document.getElementById('loading'),
    resetBtn: document.getElementById('resetBtn'),
    // カメラ関連の要素
    fileUploadBtn: document.getElementById('fileUploadBtn'),
    cameraBtn: document.getElementById('cameraBtn'),
    cameraSection: document.getElementById('cameraSection'),
    cameraPreview: document.getElementById('cameraPreview'),
    cameraVideo: document.getElementById('cameraVideo'),
    cameraCanvas: document.getElementById('cameraCanvas'),
    captureBtn: document.getElementById('captureBtn'),
    closeCameraBtn: document.getElementById('closeCameraBtn')
};

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    resetToInitialState();
}

function setupEventListeners() {
    // ファイルアップロード関連
    elements.fileUploadBtn.addEventListener('click', () => elements.bookImage.click());
    elements.bookImage.addEventListener('change', handleFileSelect);
    elements.uploadBtn.addEventListener('click', handleBorrowStep1);
    
    // カメラ関連
    elements.cameraBtn.addEventListener('click', openCamera);
    elements.captureBtn.addEventListener('click', capturePhoto);
    elements.closeCameraBtn.addEventListener('click', closeCamera);
    
    // 名前入力関連
    elements.nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleBorrowStep3();
        }
    });
    elements.nameSubmitBtn.addEventListener('click', handleBorrowStep3);
    
    // リセットボタン
    elements.resetBtn.addEventListener('click', resetSystem);
    
    // ドラッグ&ドロップ
    elements.uploadArea.addEventListener('dragover', handleDragOver);
    elements.uploadArea.addEventListener('dragleave', handleDragLeave);
    elements.uploadArea.addEventListener('drop', handleDrop);
}

function resetToInitialState() {
    currentStep = 'initial';
    currentLendingBookId = null;
    currentLendingStudentRecordId = null;
    selectedFile = null;
    
    // カメラストリームを停止
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // UI要素の表示/非表示
    elements.initialPrompt.style.display = 'block';
    elements.chatContainer.style.display = 'none';
    elements.uploadSection.style.display = 'block';
    elements.nameSection.style.display = 'none';
    elements.loading.style.display = 'none';
    elements.cameraSection.style.display = 'none';
    
    // フォームのリセット
    elements.bookImage.value = '';
    elements.nameInput.value = '';
    elements.uploadBtn.disabled = true;
    elements.imagePreview.innerHTML = '';
    elements.messages.innerHTML = '';
    elements.cameraVideo.srcObject = null;
}

function resetSystem() {
    fetch('/api/reset', {
        method: 'POST',
        credentials: 'include'
    });
    resetToInitialState();
}

// ファイル選択処理
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFile = file;
        showImagePreview(file);
        elements.uploadBtn.disabled = false;
    }
}

function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        // XSS対策: innerHTMLの代わりにcreateElementを使用
        elements.imagePreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'image-preview';
        img.alt = 'プレビュー';
        elements.imagePreview.appendChild(img);
    };
    reader.readAsDataURL(file);
}

// ドラッグ&ドロップ処理
function handleDragOver(event) {
    event.preventDefault();
    elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    elements.uploadArea.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            selectedFile = file;
            showImagePreview(file);
            elements.uploadBtn.disabled = false;
        }
    }
}

// ========== カメラ機能 ==========

// カメラを開く
async function openCamera() {
    try {
        // カメラアクセス権限を要求
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // 背面カメラを優先
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        // ビデオ要素にストリームを設定
        elements.cameraVideo.srcObject = cameraStream;
        elements.cameraSection.style.display = 'block';
        
        // カメラが開いたらプレビューを開始
        elements.cameraVideo.addEventListener('loadedmetadata', () => {
            elements.cameraVideo.play();
        });
        
    } catch (error) {
        console.error('カメラアクセスエラー:', error);
        alert('カメラにアクセスできませんでした。ブラウザの設定を確認してください。');
    }
}

// 写真を撮影
function capturePhoto() {
    if (!cameraStream) return;
    
    const canvas = elements.cameraCanvas;
    const video = elements.cameraVideo;
    const context = canvas.getContext('2d');
    
    // キャンバスサイズをビデオサイズに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // ビデオフレームをキャンバスに描画
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // キャンバスから画像データを取得
    const dataURL = canvas.toDataURL('image/jpeg', 0.8);
    
    // dataURLをFileオブジェクトに変換
    const file = dataURLtoFile(dataURL, 'captured_image.jpg');
    selectedFile = file;
    
    // プレビューを表示
    showImagePreview(file);
    
    // アップロードボタンを有効化
    elements.uploadBtn.disabled = false;
    
    // カメラを閉じる
    closeCamera();
}

// カメラを閉じる
function closeCamera() {
    if (cameraStream) {
        // ストリームの全トラックを停止
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // UI要素を隠す
    elements.cameraSection.style.display = 'none';
    elements.cameraVideo.srcObject = null;
}

// DataURLをFileオブジェクトに変換するヘルパー関数
function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, { type: mime });
}

// メッセージ表示関数
function addMessage(content, type = 'bot', buttons = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    
    if (buttons) {
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'action-buttons';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `btn btn-action ${button.class || ''}`;
            // XSS対策: innerHTMLの代わりにtextContentを使用（アイコンは別途追加）
            if (button.text && button.text.includes('<i class')) {
                if (typeof DOMPurify !== 'undefined') {
                    btn.innerHTML = DOMPurify.sanitize(button.text, {
                        ALLOWED_TAGS: ['i'],
                        ALLOWED_ATTR: ['class']
                    });
                } else {
                    btn.textContent = button.text.replace(/<[^>]*>/g, '');
                }
            } else {
                btn.textContent = button.text || '';
            }
            btn.onclick = button.action;
            buttonsDiv.appendChild(btn);
        });
        
        messageDiv.appendChild(buttonsDiv);
    }
    
    elements.messages.appendChild(messageDiv);
    
    // チャットコンテナを表示
    elements.chatContainer.style.display = 'block';
    elements.initialPrompt.style.display = 'none';
    
    // スクロールを下に
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function showLoading(message = '処理中...') {
    elements.loading.style.display = 'block';
    elements.loading.querySelector('.text-muted').textContent = message;
}

function hideLoading() {
    elements.loading.style.display = 'none';
}

// ========== 貸出システムのフロー ==========

// ステップ1: 画像アップロード
async function handleBorrowStep1() {
    if (!selectedFile) {
        alert('画像を選択してください');
        return;
    }
    
    addMessage('この書籍を借りたい', 'user');
    showLoading('画像を解析しています...');
    
    // アップロードセクションを隠す
    elements.uploadSection.style.display = 'none';
    
    const formData = new FormData();
    formData.append('bookImage', selectedFile);
    
    try {
        // CSRFトークンを取得してヘッダーに追加
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        
        const response = await fetch('/api/step1', {
            method: 'POST',
            headers: {
                'X-CSRF-Token': csrfData.csrfToken
            },
            body: formData,
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            currentLendingBookId = (data.data && data.data.book && data.data.book.id) ? data.data.book.id : null;
            const buttons = [
                { text: '<i class="fas fa-check"></i> 借りる', action: () => handleBorrowStep2('borrow') },
                { text: '<i class="fas fa-times"></i> キャンセル', action: () => handleBorrowStep2('cancel'), class: 'btn-cancel' }
            ];
            
            addMessage(data.message, 'bot', buttons);
            currentStep = 'book_found';
        } else {
            addMessage(data.message, 'bot');
            // エラーの場合は最初に戻る
            setTimeout(() => {
                resetToInitialState();
            }, 3000);
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。もう一度お試しください。', 'bot');
        setTimeout(() => {
            resetToInitialState();
        }, 3000);
    }
}

// ステップ2: 「借りる」ボタンを押した時の処理
async function handleBorrowStep2(action) {
    if (action === 'cancel') {
        addMessage('キャンセル', 'user');
        addMessage('キャンセルしました。', 'bot');
        setTimeout(() => {
            resetToInitialState();
        }, 2000);
        return;
    }
    
    addMessage('借りる', 'user');
    showLoading();
    
    try {
        // CSRFトークンを取得
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        
        const response = await fetch('/api/step2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfData.csrfToken
            },
            body: JSON.stringify({ action: 'borrow', bookId: currentLendingBookId }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            addMessage(data.message, 'bot');
            elements.nameSection.style.display = 'block';
            elements.nameInput.focus();
            currentStep = 'name_request';
        } else {
            addMessage(data.message, 'bot');
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。', 'bot');
    }
}

// ステップ3: 名前入力
async function handleBorrowStep3() {
    const name = elements.nameInput.value.trim();
    if (!name) {
        alert('名前を入力してください');
        return;
    }
    
    addMessage(name, 'user');
    showLoading();
    elements.nameSection.style.display = 'none';
    
    try {
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        
        const response = await fetch('/api/step3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfData.csrfToken
            },
            body: JSON.stringify({ name: name, bookId: currentLendingBookId }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            currentLendingStudentRecordId =
                (data.data && data.data.student && data.data.student.recordId) ? data.data.student.recordId : null;
            const buttons = [
                { text: '<i class="fas fa-check"></i> 同意', action: () => handleBorrowStep4('agree') },
                { text: '<i class="fas fa-times"></i> キャンセル', action: () => handleBorrowStep4('cancel'), class: 'btn-cancel' }
            ];
            
            addMessage(data.message, 'bot', buttons);
            currentStep = 'confirm_period';
        } else {
            addMessage(data.message, 'bot');
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。', 'bot');
    }
}

// ステップ4: 貸出期間の同意
async function handleBorrowStep4(action) {
    if (action === 'cancel') {
        addMessage('キャンセル', 'user');
        addMessage('キャンセルしました。', 'bot');
        setTimeout(() => {
            resetToInitialState();
        }, 2000);
        return;
    }
    
    addMessage('同意', 'user');
    showLoading();
    
    try {
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        
        const response = await fetch('/api/step4', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfData.csrfToken
            },
            body: JSON.stringify({
                action: 'agree',
                bookId: currentLendingBookId,
                studentId: currentLendingStudentRecordId
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            const buttons = [
                { text: '<i class="fas fa-check"></i> 同意', action: () => handleBorrowStep5('agree') },
                { text: '<i class="fas fa-times"></i> キャンセル', action: () => handleBorrowStep5('cancel'), class: 'btn-cancel' }
            ];
            
            addMessage(data.message, 'bot', buttons);
            currentStep = 'show_rules';
        } else {
            addMessage(data.message, 'bot');
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。', 'bot');
    }
}

// ステップ5: 貸出ルールの同意（最終処理）
async function handleBorrowStep5(action) {
    if (action === 'cancel') {
        addMessage('キャンセル', 'user');
        addMessage('キャンセルしました。', 'bot');
        setTimeout(() => {
            resetToInitialState();
        }, 2000);
        return;
    }
    
    addMessage('同意', 'user');
    showLoading('貸出処理を実行しています...');
    
    try {
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        
        const response = await fetch('/api/step5', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfData.csrfToken
            },
            body: JSON.stringify({
                action: 'agree',
                bookId: currentLendingBookId,
                studentId: currentLendingStudentRecordId
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            addMessage(data.message, 'bot');
            currentStep = 'completed';
            
            // 完了後、3秒後にメインページに戻る
            setTimeout(() => {
                if (data.data && data.data.redirectToMain) {
                    window.location.href = '/';
                } else {
                    resetToInitialState();
                }
            }, 3000);
        } else {
            addMessage(data.message, 'bot');
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。', 'bot');
    }
} 