// 延長申請システムのJavaScript

// アプリケーションの状態管理
let currentStep = 'initial';
let selectedFile = null;
let cameraStream = null;

// DOM要素の取得
const elements = {
    chatContainer: document.getElementById('chatContainer'),
    uploadSection: document.getElementById('uploadSection'),
    uploadArea: document.getElementById('uploadArea'),
    bookImage: document.getElementById('bookImage'),
    imagePreview: document.getElementById('imagePreview'),
    uploadBtn: document.getElementById('uploadBtn'),
    nameSection: document.getElementById('nameSection'),
    nameInput: document.getElementById('nameInput'),
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loadingText'),
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

// 現在のステップ
let currentStudent = null;
let currentLoans = [];

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('延長申請システムが初期化されました');
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // 名前入力セクションを表示
    elements.nameSection.style.display = 'block';
    elements.uploadSection.style.display = 'none';
    elements.nameInput.focus();
});

// メッセージを追加する関数
function addMessage(text, type, buttons = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    if (type === 'bot') {
        messageDiv.innerHTML = `<strong>${text}</strong>`;
    } else {
        messageDiv.textContent = text;
    }
    
    elements.chatContainer.appendChild(messageDiv);
    
    // ボタンがある場合は追加
    if (buttons && buttons.length > 0) {
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'buttons-container';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `action-btn ${button.class || ''}`;
            btn.innerHTML = button.text;
            btn.onclick = button.action;
            buttonsContainer.appendChild(btn);
        });
        
        messageDiv.appendChild(buttonsContainer);
    }
    
    // スクロールを最下部に移動
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// ローディング表示
function showLoading(text = '処理中...') {
    if (elements.loadingText) {
        elements.loadingText.textContent = text;
    }
    elements.loading.style.display = 'block';
}

// ローディング非表示
function hideLoading() {
    elements.loading.style.display = 'none';
}

// ファイル選択の処理
function handleFileSelect(event) {
    selectedFile = event.target.files[0];
    if (selectedFile) {
        showImagePreview(selectedFile);
        elements.uploadBtn.disabled = false;
    } else {
        elements.imagePreview.innerHTML = '';
        elements.uploadBtn.disabled = true;
    }
}

// 名前入力の処理
async function handleNameSubmit() {
    const name = elements.nameInput.value.trim();
    if (!name) {
        alert('名前を入力してください');
        return;
    }
    
    addMessage(name, 'user');
    showLoading('貸出一覧を取得しています...');
    elements.nameSection.style.display = 'none';
    
    try {
        const response = await fetch('/api/extend-step1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: name }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            currentStudent = data.data.student;
            currentLoans = data.data.loans;
            
            if (currentLoans.length === 0) {
                addMessage('📚 現在借りている本がありません。', 'bot');
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            } else {
                addMessage(`📚 ${currentStudent.name}さんの貸出一覧を表示します`, 'bot');
                displayLoanList();
            }
        } else {
            addMessage(data.message, 'bot');
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。もう一度お試しください。', 'bot');
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    }
}

// 貸出一覧を表示する関数
function displayLoanList() {
    const loanListDiv = document.createElement('div');
    loanListDiv.className = 'loan-list';
    
    currentLoans.forEach((loan, index) => {
        const loanItem = document.createElement('div');
        loanItem.className = 'loan-item';
        
        const title = loan.title || '不明な書籍';
        const dueDate = loan.dueDate || '不明';
        const isOverdue = loan.isOverdue || false;
        const canExtend = loan.canExtend || false;
        const extendCount = loan.extendCount || 0;
        
        let statusText = '';
        if (isOverdue) {
            statusText = '<span style="color: red;">⚠️ 延滞中</span>';
        } else if (extendCount > 0) {
            statusText = `<span style="color: orange;">🔄 延長済み (${extendCount}回)</span>`;
        } else {
            statusText = '<span style="color: green;">✅ 正常</span>';
        }
        
        loanItem.innerHTML = `
            <h5>${title}</h5>
            <p>返却期限: ${dueDate}</p>
            <p>状態: ${statusText}</p>
            ${canExtend ? 
                `<button class="extend-btn" onclick="requestExtension(${index})">
                    <i class="fas fa-clock"></i> 延長申請 (+7日)
                </button>` : 
                `<button class="extend-btn" disabled>
                    <i class="fas fa-ban"></i> 延長不可
                </button>`
            }
        `;
        
        loanListDiv.appendChild(loanItem);
    });
    
    // チャットコンテナに追加
    elements.chatContainer.appendChild(loanListDiv);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// 延長申請を送信する関数
async function requestExtension(loanIndex) {
    const loan = currentLoans[loanIndex];
    if (!loan) {
        alert('エラーが発生しました');
        return;
    }
    
    const confirmMessage = `「${loan.title}」の返却期限を7日間延長しますか？\n\n現在の期限: ${loan.dueDate}\n延長後の期限: ${loan.newDueDate}`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    addMessage(`「${loan.title}」の延長申請を送信しています...`, 'user');
    showLoading('延長処理を実行しています...');
    
    try {
        const response = await fetch('/api/extend-step2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                loanId: loan.id,
                studentName: currentStudent.name
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            addMessage(`✅ 延長申請が完了しました！\n\n新しい返却期限: ${data.data.newDueDate}`, 'bot');
            
            // 3秒後にメインページに戻る
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        } else {
            addMessage(data.message, 'bot');
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。もう一度お試しください。', 'bot');
    }
}

// ファイルアップロードの処理（書籍画像から延長申請）
async function handleExtendStep1() {
    if (!selectedFile) {
        alert('書籍のカバー画像を選択してください。');
        return;
    }

    addMessage('書籍のカバー画像をアップロードしています...', 'user');
    showLoading('書籍情報を取得しています...');

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await fetch('/api/extend-step1', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();
        hideLoading();

        if (data.success) {
            currentStudent = data.data.student;
            currentLoans = data.data.loans;
            
            if (currentLoans.length === 0) {
                addMessage('📚 現在借りている本がありません。', 'bot');
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            } else {
                addMessage(`📚 ${currentStudent.name}さんの貸出一覧を表示します`, 'bot');
                displayLoanList();
            }
        } else {
            addMessage(data.message, 'bot');
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
        
    } catch (error) {
        hideLoading();
        addMessage('エラーが発生しました。もう一度お試しください。', 'bot');
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    }
}

// カメラ関連の関数
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

// 画像プレビュー表示
function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        elements.imagePreview.innerHTML = `
            <img src="${e.target.result}" class="image-preview" alt="プレビュー">
        `;
    };
    reader.readAsDataURL(file);
}

// ドラッグ&ドロップの処理
function handleDragOver(event) {
    event.preventDefault();
    elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
    elements.uploadArea.classList.remove('dragover');
}

async function handleDrop(event) {
    event.preventDefault();
    elements.uploadArea.classList.remove('dragover');

    const file = event.dataTransfer.files[0];
    if (file) {
        selectedFile = file;
        showImagePreview(file);
        elements.uploadBtn.disabled = false;
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // ファイルアップロード関連
    elements.fileUploadBtn.addEventListener('click', () => elements.bookImage.click());
    elements.bookImage.addEventListener('change', handleFileSelect);
    elements.uploadBtn.addEventListener('click', handleExtendStep1);
    
    // カメラ関連
    elements.cameraBtn.addEventListener('click', openCamera);
    elements.captureBtn.addEventListener('click', capturePhoto);
    elements.closeCameraBtn.addEventListener('click', closeCamera);
    
    // 名前入力関連
    elements.nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleNameSubmit();
        }
    });
    
    // ドラッグ&ドロップ
    elements.uploadArea.addEventListener('dragover', handleDragOver);
    elements.uploadArea.addEventListener('dragleave', handleDragLeave);
    elements.uploadArea.addEventListener('drop', handleDrop);
}

// 初期状態にリセット
function resetToInitialState() {
    currentStep = 'initial';
    selectedFile = null;
    currentStudent = null;
    currentLoans = [];
    
    // カメラストリームを停止
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // UI要素の表示/非表示
    elements.chatContainer.innerHTML = '<div class="message bot"><strong>📝 延長申請を開始します</strong><br>まず、お名前を入力してください。現在借りている本の一覧を表示します。</div>';
    elements.uploadSection.style.display = 'none';
    elements.nameSection.style.display = 'block';
    elements.loading.style.display = 'none';
    elements.cameraSection.style.display = 'none';
    
    // フォームのリセット
    elements.bookImage.value = '';
    elements.nameInput.value = '';
    elements.uploadBtn.disabled = true;
    elements.imagePreview.innerHTML = '';
    elements.cameraVideo.srcObject = null;
    
    // 名前入力にフォーカス
    elements.nameInput.focus();
}

// システムをリセットする関数
function resetSystem() {
    resetToInitialState();
}

// エラーハンドリング
window.addEventListener('error', function(e) {
    console.error('JavaScript Error:', e.error);
    hideLoading();
});

// 未キャッチプロミス拒否のハンドリング
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    hideLoading();
});

console.log('延長申請システムのJavaScriptが読み込まれました'); 