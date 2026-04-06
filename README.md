# 📚 Book Lending Vision

Google Cloud Vision APIを使って画像から書名を抽出し、Airtableと照合して図書の貸出処理を行うウェブアプリケーション

## 🌐 デモ

- **完全機能版**: https://book-lending-vision-dqbvon9ua-ryo18375-6134s-projects.vercel.app/
- **GitHub Pages（静的版）**: https://ryo0815.github.io/ryo.0815/ (API機能は動作しません)

## 🚀 主要機能

### 📖 貸出機能
- **カメラ撮影 or ファイルアップロード**: 書籍の表紙を撮影またはファイルから選択
- **Google Cloud Vision APIによる文字認識**: 書籍タイトルの自動抽出
- **Airtableデータベース照合**: 書籍情報の自動検索
- **生徒情報管理**: 生徒名による貸出者確認・新規登録
- **貸出制限管理**: 一人4冊までの貸出制限
- **返却期限設定**: 2週間後の自動返却期限設定
- **リアルタイム処理**: 5段階のステップで安全な貸出処理

### 🔄 返却機能
- **書籍認識**: 返却する書籍の自動認識
- **貸出状況確認**: 現在の貸出状況と返却期限の確認
- **延滞チェック**: 返却期限を過ぎた書籍の延滞警告
- **返却処理**: 自動返却処理とデータベース更新
- **返却完了通知**: 返却完了の確認メッセージ

### ⏰ 延長申請機能
- **名前入力による貸出一覧取得**: 現在借りている書籍一覧の表示
- **延長可能性チェック**: 延長可能な書籍の自動判定
- **延長処理**: 7日間の延長処理
- **延長制限**: 最大1回までの延長制限
- **延長履歴管理**: 延長回数の記録と管理

### 🔧 管理者機能（新規追加）
- **管理者認証**: パスワードによる管理者認証
- **書籍登録**: Vision APIを使った自動書籍情報抽出
- **画像解析**: 書籍表紙からのタイトル・著者・ISBN自動認識
- **Airtable登録**: 解析結果の自動データベース登録
- **ドラッグ&ドロップ**: 直感的な画像アップロード機能

### 📷 カメラ機能
- **ブラウザカメラサポート**: すべてのページでカメラ機能を利用可能
- **リアルタイムプレビュー**: 撮影前のリアルタイムプレビュー
- **背面カメラ優先**: モバイルデバイスの背面カメラを自動選択
- **画像キャプチャ**: 高品質な画像キャプチャ機能
- **ファイル変換**: 撮影した画像の自動ファイル変換

## 💻 技術スタック

### Backend
- **Node.js**: サーバーサイド JavaScript ランタイム
- **Express**: Node.js ウェブアプリケーションフレームワーク
- **Multer**: ファイルアップロード処理
- **Express-session**: セッション管理
- **CORS**: クロスオリジンリソース共有

### Frontend
- **Vanilla JavaScript**: 純粋なJavaScriptによる実装
- **Bootstrap 5**: レスポンシブデザインフレームワーク
- **Font Awesome**: アイコンライブラリ
- **HTML5 Canvas**: 画像キャプチャ機能
- **MediaDevices API**: カメラアクセス機能

### Database & APIs
- **Airtable**: クラウドデータベース
- **Google Cloud Vision API**: 画像内テキスト認識
- **Axios**: HTTP クライアント

### Development & Deployment
- **Vercel**: クラウドプラットフォーム
- **GitHub**: ソースコード管理
- **npm**: パッケージマネージャー

## 🗂️ データベース構造

### Books テーブル
| フィールド | 型 | 説明 |
|-----------|-----|------|
| 書名 | Single line text | 書籍のタイトル |
| 著者 | Single line text | 著者名 |
| 出版社 | Single line text | 出版社名 |
| 貸出状況 | Single select | 「貸出可」「貸出中」 |
| 最終更新日 | Date | 最終更新日時 |

### Students テーブル
| フィールド | 型 | 説明 |
|-----------|-----|------|
| 生徒名 | Single line text | 生徒の名前 |
| 学年 | Single line text | 学年情報 |
| 貸出中冊数 | Number | 現在借りている本の数 |
| 登録日 | Date | 初回登録日 |

### Loans テーブル
| フィールド | 型 | 説明 |
|-----------|-----|------|
| 生徒 | Link to Students | 貸出者（Students テーブルとのリンク） |
| 書籍 | Link to Books | 貸出書籍（Books テーブルとのリンク） |
| 貸出日 | Date | 貸出日時 |
| 返却予定日 | Date | 返却期限 |
| 返却日 | Date | 実際の返却日時 |
| 返却状況 | Single select | 「貸出中」「返却済」「延滞」 |
| 延長済み | Checkbox | 延長処理の有無 |
| 延長回数 | Number | 延長回数 |

## 🔧 ローカル環境での起動

### 1. 環境変数の設定

`.env`ファイルを作成して以下の環境変数を設定：

```bash
# Google Cloud Vision API
GOOGLE_VISION_API_KEY=your_google_vision_api_key_here

# Airtable Database
AIRTABLE_API_KEY=your_airtable_api_key_here
AIRTABLE_BASE_ID=your_airtable_base_id_here
AIRTABLE_TABLE_BOOKS=Books
AIRTABLE_TABLE_STUDENTS=Students
AIRTABLE_TABLE_LOANS=Loans

# 管理者設定
ADMIN_PASSWORD=secure_admin_password_2024

# Optional: Session Secret
SESSION_SECRET=your_session_secret_here
```

### 2. インストール・実行

```bash
# リポジトリをクローン
git clone https://github.com/ryo0815/ryo.0815.git
cd ryo.0815

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev

# または本番環境での起動
npm start
```

アプリケーションは `http://localhost:3000` でアクセス可能です。

## 🚀 Vercelでのデプロイ

### 1. Vercelプロジェクトの作成

```bash
# Vercel CLIを使用
npx vercel

# または手動でVercelダッシュボードから設定
# 1. https://vercel.com/ にログイン
# 2. 「New Project」をクリック
# 3. GitHubリポジトリを選択
# 4. 自動的にビルド・デプロイが開始
```

### 2. 環境変数の設定

Vercelダッシュボードで以下の環境変数を設定：

```bash
GOOGLE_VISION_API_KEY=your_google_vision_api_key
GOOGLE_CLOUD_API_KEY=your_google_vision_api_key  # どちらでも動作
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
AIRTABLE_TABLE_BOOKS=Books
AIRTABLE_TABLE_STUDENTS=Students
AIRTABLE_TABLE_LOANS=Loans
ADMIN_PASSWORD=your_secure_admin_password  # 管理者パスワード
```

#### ⚠️ 重要: 環境変数変更後の再デプロイ

Vercelで環境変数を変更した場合、**必ず再デプロイが必要です**：

**方法1: Vercel Dashboard から再デプロイ**
1. Vercelダッシュボードでプロジェクトを選択
2. 「Settings」→「Environment Variables」で環境変数を変更
3. 「Deployments」タブに移動
4. 最新のデプロイメントの「...」メニューから「Redeploy」をクリック
5. または、GitHubにプッシュして自動デプロイをトリガー

**方法2: Vercel CLI から再デプロイ**
```bash
# プロジェクトディレクトリで実行
vercel --prod
```

**方法3: Git プッシュで自動デプロイ**
```bash
git commit --allow-empty -m "環境変数の反映のため再デプロイ"
git push origin main
```

#### 🔍 環境変数の確認方法

デプロイ後、以下のエンドポイントで環境変数が正しく設定されているか確認できます：

```bash
# ブラウザまたはcurlでアクセス
https://your-app-name.vercel.app/api/health
```

レスポンス例：
```json
{
  "status": "OK",
  "config": {
    "hasGoogleVisionKey": true,
    "hasAirtableKey": true,
    "hasAirtableBase": true,
    "hasAdminPassword": true,
    "adminPasswordLength": 20,
    "adminPasswordSource": "environment"
  }
}
```

- `hasAdminPassword`: true なら環境変数が設定されている
- `adminPasswordSource`: "environment" なら環境変数から読み込み、"default" ならデフォルト値
- `adminPasswordLength`: パスワードの文字数（パスワード自体は表示されません）

### 3. デプロイ設定

`vercel.json`ファイルで以下の設定を使用：

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

## 🎯 使用方法

### 📖 書籍の貸出

1. メインページで「貸出」をクリック
2. 書籍の表紙を撮影またはファイルから選択
3. Google Vision APIが自動で書名を認識
4. 認識結果を確認・修正
5. 生徒名を入力（新規の場合は自動登録）
6. 貸出確認画面で内容を確認
7. 貸出完了

### 🔄 書籍の返却

1. メインページで「返却」をクリック
2. 返却する書籍を撮影またはファイルから選択
3. 書籍の認識結果を確認
4. 現在の貸出状況を確認
5. 返却処理を実行
6. 返却完了

### ⏰ 延長申請

1. メインページで「延長申請」をクリック
2. 生徒名を入力
3. 現在借りている書籍一覧を確認
4. 延長したい書籍を選択
5. 延長処理を実行（7日間延長）
6. 延長完了

### 🔧 管理者機能

1. メインページ右上の「管理者ツール」をクリック
2. 管理者パスワードを入力（デフォルト: admin123）
3. 書籍登録ページで書籍の表紙を撮影またはアップロード
4. Vision APIが自動で書籍情報を抽出
5. 抽出された情報を確認・修正
6. 「書籍を登録」ボタンでAirtableに登録

## 📱 対応デバイス

### 📱 スマートフォン
- **iOS Safari**: 完全対応
- **Android Chrome**: 完全対応
- **カメラ機能**: 背面カメラ優先で自動選択

### 💻 PC・タブレット
- **Chrome**: 完全対応
- **Firefox**: 完全対応
- **Safari**: 完全対応
- **Edge**: 完全対応

### 📷 カメラ機能
- **リアルタイムプレビュー**: 撮影前の映像確認
- **高解像度撮影**: 1280x720の高品質画像
- **JPEG圧縮**: 効率的なファイルサイズ管理

## 🔐 セキュリティ

### 🔒 データ保護
- **環境変数管理**: 機密情報の適切な管理
- **セッションベース**: 安全な状態管理
- **CORS設定**: クロスオリジンリクエストの制御

### 🛡️ API セキュリティ
- **API キー保護**: サーバーサイドでのAPI キー管理
- **リクエスト制限**: 不正なリクエストの防止
- **エラーハンドリング**: 適切なエラー処理

## 📊 システム要件

### 最低要件
- **Node.js**: 16.0.0以上
- **ブラウザ**: モダンブラウザ（ES6対応）
- **カメラ**: デバイスカメラ（オプション）
- **インターネット**: 安定したインターネット接続

### 推奨要件
- **Node.js**: 18.0.0以上
- **メモリ**: 512MB以上
- **ストレージ**: 100MB以上

## 🐛 トラブルシューティング

### 画像認識の問題
```bash
# 問題: 書籍タイトルが正しく認識されない
# 解決法:
1. 明るい場所で撮影
2. 書籍の表紙全体をフレームに収める
3. 文字がはっきり見えるよう調整
4. 手ブレを避ける
```

### カメラアクセスの問題
```bash
# 問題: カメラが起動しない
# 解決法:
1. ブラウザの設定でカメラアクセスを許可
2. HTTPSでアクセス（本番環境）
3. 他のアプリケーションがカメラを使用していないか確認
```

### データベース接続の問題
```bash
# 問題: データベースに接続できない
# 解決法:
1. Airtable API キーの確認
2. ベースIDの確認
3. テーブル名の確認
4. ネットワーク接続の確認
```

### デプロイメントの問題
```bash
# 問題: Vercelでのデプロイが失敗する
# 解決法:
1. 環境変数の設定確認
2. vercel.json の設定確認
3. ビルドログの確認
4. 依存関係の更新
```

### 管理者パスワードの問題
```bash
# 問題: Vercelで管理者パスワードを変更したが反映されない
# 原因: 環境変数を変更した後、再デプロイしていない

# 解決法:
1. Vercelダッシュボードで環境変数が正しく設定されているか確認
   - Settings → Environment Variables
   - ADMIN_PASSWORD が正しい値になっているか確認
   - Production/Preview/Development のスコープを確認

2. 再デプロイを実行
   方法A: Deployments → 最新デプロイの「...」→「Redeploy」
   方法B: git commit --allow-empty -m "Redeploy" && git push
   方法C: vercel --prod コマンドを実行

3. /api/health エンドポイントで確認
   - adminPasswordSource が "environment" になっているか確認
   - adminPasswordLength が期待する文字数になっているか確認

4. Vercel CLI でログを確認
   vercel logs [deployment-url] --follow

# ログで以下を確認:
# "ADMIN_PASSWORD: 設定済み (長さ: XX文字)"
# が表示されていれば環境変数が正しく読み込まれています
```

## 🔄 更新履歴

### v1.0.0 (2024-01-01)
- 初回リリース
- 基本的な貸出・返却機能
- Google Cloud Vision API統合
- Airtableデータベース統合

### v1.1.0 (2024-01-15)
- 延長申請機能追加
- UIデザインの改善
- エラーハンドリングの強化

### v1.2.0 (2024-02-01)
- カメラ機能の追加
- レスポンシブデザイン対応
- セッション管理の改善

### v1.3.0 (2024-02-15)
- 延長申請UIの修正
- JavaScript エラーの修正
- デプロイメントの最適化

## 📄 ライセンス

ISC License

## 🤝 貢献

プルリクエストや Issue は歓迎します！

### 貢献方法
1. このリポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 お問い合わせ

- **GitHub**: https://github.com/ryo0815/ryo.0815
- **Issues**: https://github.com/ryo0815/ryo.0815/issues

## 🙏 謝辞

- Google Cloud Vision API
- Airtable
- Vercel
- Bootstrap
- Font Awesome 