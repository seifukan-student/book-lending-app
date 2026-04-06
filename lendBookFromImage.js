const axios = require('axios');
require('dotenv').config();

/**
 * Google Cloud Vision APIを使って画像から書名を抽出し、
 * Airtableと照合して図書の貸出処理を行うNode.jsアプリ
 */

// 環境変数の設定
const config = {
  googleCloud: {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
    apiUrl: 'https://vision.googleapis.com/v1/images:annotate'
  },
  airtable: {
    apiKey: process.env.AIRTABLE_API_KEY,
    baseId: process.env.AIRTABLE_BASE_ID,
    baseUrl: 'https://api.airtable.com/v0',
    tables: {
      books: process.env.BOOKS_TABLE || 'Books',
      students: process.env.STUDENTS_TABLE || 'Students',
      loans: process.env.LOANS_TABLE || 'Loans'
    }
  }
};

/**
 * Google Cloud Vision APIを使って画像からテキストを抽出
 * @param {string} base64Image - base64でエンコードされた画像
 * @returns {Promise<string>} - 抽出されたテキスト
 */
async function extractTextFromImage(base64Image) {
  try {
    console.log('📸 画像からテキストを抽出中...');
    
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

    const response = await axios.post(
      `${config.googleCloud.apiUrl}?key=${config.googleCloud.apiKey}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
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
    console.error('❌ Google Cloud Vision API エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Airtableから書籍を検索
 * @param {string} title - 検索する書籍タイトル
 * @returns {Promise<Object|null>} - 見つかった書籍レコード
 */
async function searchBookInAirtable(title) {
  try {
    console.log('📚 書籍を検索中:', title);
    
    const url = `${config.airtable.baseUrl}/${config.airtable.baseId}/${config.airtable.tables.books}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${config.airtable.apiKey}`
      },
      params: {
        filterByFormula: `SEARCH("${title.toLowerCase()}", LOWER({Title})) > 0`
      }
    });

    if (response.data.records && response.data.records.length > 0) {
      const book = response.data.records[0];
      console.log('✅ 書籍が見つかりました:', book.fields.Title);
      console.log('📖 ステータス:', book.fields.Status);
      return book;
    } else {
      console.log('⚠️  書籍が見つかりませんでした');
      return null;
    }
  } catch (error) {
    console.error('❌ Airtable書籍検索エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 生徒情報を取得
 * @param {string} studentId - 生徒ID
 * @returns {Promise<Object|null>} - 生徒レコード
 */
async function getStudentInfo(studentId) {
  try {
    console.log('👤 生徒情報を取得中:', studentId);
    
    const url = `${config.airtable.baseUrl}/${config.airtable.baseId}/${config.airtable.tables.students}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${config.airtable.apiKey}`
      },
      params: {
        filterByFormula: `{StudentID} = "${studentId}"`
      }
    });

    if (response.data.records && response.data.records.length > 0) {
      const student = response.data.records[0];
      console.log('✅ 生徒情報を取得しました:', student.fields.Name);
      return student;
    } else {
      console.log('⚠️  生徒が見つかりませんでした');
      return null;
    }
  } catch (error) {
    console.error('❌ 生徒情報取得エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 貸出レコードを作成
 * @param {Object} book - 書籍レコード
 * @param {Object} student - 生徒レコード
 * @returns {Promise<Object>} - 作成された貸出レコード
 */
async function createLoanRecord(book, student) {
  try {
    console.log('📝 貸出レコードを作成中...');
    
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 14); // 14日後
    
    const url = `${config.airtable.baseUrl}/${config.airtable.baseId}/${config.airtable.tables.loans}`;
    
    const requestBody = {
      records: [
        {
          fields: {
            BookID: book.id,
            StudentID: student.id,
            StartDate: today.toISOString().split('T')[0], // YYYY-MM-DD形式
            DueDate: dueDate.toISOString().split('T')[0]
          }
        }
      ]
    };

    const response = await axios.post(url, requestBody, {
      headers: {
        'Authorization': `Bearer ${config.airtable.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const loanRecord = response.data.records[0];
    console.log('✅ 貸出レコードを作成しました:', loanRecord.id);
    console.log('📅 貸出日:', loanRecord.fields.StartDate);
    console.log('📅 返却期限:', loanRecord.fields.DueDate);
    
    return loanRecord;
  } catch (error) {
    console.error('❌ 貸出レコード作成エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 書籍のステータスを「貸出中」に更新
 * @param {Object} book - 書籍レコード
 * @returns {Promise<Object>} - 更新された書籍レコード
 */
async function updateBookStatus(book) {
  try {
    console.log('📚 書籍ステータスを更新中...');
    
    const url = `${config.airtable.baseUrl}/${config.airtable.baseId}/${config.airtable.tables.books}/${book.id}`;
    
    const requestBody = {
      fields: {
        Status: '貸出中'
      }
    };

    const response = await axios.patch(url, requestBody, {
      headers: {
        'Authorization': `Bearer ${config.airtable.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ 書籍ステータスを「貸出中」に更新しました');
    return response.data;
  } catch (error) {
    console.error('❌ 書籍ステータス更新エラー:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * メイン処理
 * @param {string} base64Image - base64でエンコードされた画像
 * @param {string} studentId - 生徒ID
 */
async function main(base64Image, studentId) {
  console.log('🚀 図書貸出処理を開始します');
  console.log('========================');
  
  try {
    // 必要な環境変数の確認
    if (!config.googleCloud.apiKey) {
      throw new Error('GOOGLE_CLOUD_API_KEY が設定されていません');
    }
    if (!config.airtable.apiKey) {
      throw new Error('AIRTABLE_API_KEY が設定されていません');
    }
    if (!config.airtable.baseId) {
      throw new Error('AIRTABLE_BASE_ID が設定されていません');
    }

    // 1. 画像からテキストを抽出
    const extractedText = await extractTextFromImage(base64Image);
    if (!extractedText) {
      console.log('❌ 画像からテキストを抽出できませんでした');
      return;
    }

    // 2. 抽出されたテキストから書籍を検索
    // 簡易的な書籍タイトル抽出（実際の実装では、より高度なテキスト処理が必要）
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    let bookFound = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 3) { // 最低3文字以上
        bookFound = await searchBookInAirtable(trimmedLine);
        if (bookFound) {
          break;
        }
      }
    }

    if (!bookFound) {
      console.log('❌ 抽出されたテキストから書籍を見つけることができませんでした');
      return;
    }

    // 3. 書籍のステータスを確認
    if (bookFound.fields.Status !== '貸出可') {
      console.log('❌ この書籍は現在貸出中です:', bookFound.fields.Status);
      return;
    }

    // 4. 生徒情報を取得
    const student = await getStudentInfo(studentId);
    if (!student) {
      console.log('❌ 指定された生徒IDが見つかりません');
      return;
    }

    // 5. 貸出レコードを作成
    const loanRecord = await createLoanRecord(bookFound, student);

    // 6. 書籍のステータスを更新
    await updateBookStatus(bookFound);

    console.log('========================');
    console.log('🎉 図書貸出処理が完了しました！');
    console.log('📚 書籍:', bookFound.fields.Title);
    console.log('👤 生徒:', student.fields.Name);
    console.log('📅 返却期限:', loanRecord.fields.DueDate);
    console.log('========================');

  } catch (error) {
    console.error('❌ 処理中にエラーが発生しました:', error.message);
    console.error('詳細:', error);
  }
}

// 実行例（テスト用）
if (require.main === module) {
  // 実際の使用時は、以下のパラメータを適切に設定してください
  const testBase64Image = process.env.TEST_IMAGE_BASE64 || '';
  const testStudentId = process.env.TEST_STUDENT_ID || 'STU001';
  
  if (!testBase64Image) {
    console.log('⚠️  テスト実行するには TEST_IMAGE_BASE64 環境変数を設定してください');
    console.log('');
    console.log('使用方法:');
    console.log('1. .env ファイルを作成して以下の変数を設定:');
    console.log('   GOOGLE_CLOUD_API_KEY=your_api_key');
    console.log('   AIRTABLE_API_KEY=your_api_key');
    console.log('   AIRTABLE_BASE_ID=your_base_id');
    console.log('   TEST_IMAGE_BASE64=your_base64_image');
    console.log('   TEST_STUDENT_ID=your_student_id');
    console.log('');
    console.log('2. コードから直接呼び出し:');
    console.log('   main(base64Image, studentId)');
  } else {
    main(testBase64Image, testStudentId);
  }
}

module.exports = { main }; 