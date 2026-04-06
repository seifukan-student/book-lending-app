const fs = require('fs');
const path = require('path');

/**
 * 画像ファイルをbase64エンコードするヘルパースクリプト
 * 使用方法: node convertImageToBase64.js [画像ファイルのパス]
 */

function convertImageToBase64(imagePath) {
  try {
    // ファイルの存在確認
    if (!fs.existsSync(imagePath)) {
      console.error('❌ ファイルが見つかりません:', imagePath);
      return;
    }

    // ファイルを読み込んでbase64エンコード
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('✅ 画像を正常にbase64エンコードしました');
    console.log('📁 ファイル:', imagePath);
    console.log('📊 サイズ:', imageBuffer.length, 'バイト');
    console.log('📝 base64データ長:', base64Image.length, '文字');
    console.log('');
    console.log('🔗 以下の値を.envファイルのTEST_IMAGE_BASE64に設定してください:');
    console.log('================================');
    console.log(base64Image);
    console.log('================================');
    
    // .envファイルを自動更新するかの確認
    console.log('');
    console.log('💡 .envファイルを自動更新したい場合は、以下のコマンドを実行してください:');
    console.log(`node updateEnvWithImage.js "${imagePath}"`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  }
}

// コマンドライン引数から画像パスを取得
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('使用方法: node convertImageToBase64.js [画像ファイルのパス]');
  console.log('');
  console.log('例:');
  console.log('  node convertImageToBase64.js ./book-cover.jpg');
  console.log('  node convertImageToBase64.js "/Users/username/Pictures/book.png"');
} else {
  convertImageToBase64(imagePath);
} 