const fs = require('fs');

/**
 * 画像ファイルをbase64エンコードして.envファイルを自動更新するスクリプト
 * 使用方法: node updateEnvWithImage.js [画像ファイルのパス]
 */

function updateEnvWithImage(imagePath) {
  try {
    // ファイルの存在確認
    if (!fs.existsSync(imagePath)) {
      console.error('❌ ファイルが見つかりません:', imagePath);
      return;
    }

    // 画像をbase64エンコード
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('✅ 画像を正常にbase64エンコードしました');
    console.log('📁 ファイル:', imagePath);
    console.log('📊 サイズ:', imageBuffer.length, 'バイト');

    // .envファイルを読み込み
    const envPath = '.env';
    if (!fs.existsSync(envPath)) {
      console.error('❌ .envファイルが見つかりません');
      return;
    }

    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // TEST_IMAGE_BASE64の値を置換
    const oldPattern = /TEST_IMAGE_BASE64=.*/;
    const newLine = `TEST_IMAGE_BASE64=${base64Image}`;
    
    if (envContent.match(oldPattern)) {
      envContent = envContent.replace(oldPattern, newLine);
      console.log('🔄 既存のTEST_IMAGE_BASE64を更新しました');
    } else {
      // 存在しない場合は追加
      envContent += `\n${newLine}`;
      console.log('➕ TEST_IMAGE_BASE64を追加しました');
    }

    // .envファイルに書き込み
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ .envファイルを更新しました');
    console.log('');
    console.log('🚀 以下のコマンドでアプリケーションをテストできます:');
    console.log('node lendBookFromImage.js');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  }
}

// コマンドライン引数から画像パスを取得
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('使用方法: node updateEnvWithImage.js [画像ファイルのパス]');
  console.log('');
  console.log('例:');
  console.log('  node updateEnvWithImage.js ./book-cover.jpg');
  console.log('  node updateEnvWithImage.js "/Users/username/Pictures/book.png"');
} else {
  updateEnvWithImage(imagePath);
} 