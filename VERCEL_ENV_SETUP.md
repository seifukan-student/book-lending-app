# 🔐 Vercel 環境変数の設定ガイド

このガイドでは、Vercelで環境変数（特に管理者パスワード）を設定・変更する方法を詳しく説明します。

## ⚠️ 重要: 環境変数変更後は必ず再デプロイが必要

Vercelでは、環境変数を変更しても**自動的には反映されません**。環境変数は**ビルド時**に読み込まれるため、変更後は必ず再デプロイする必要があります。

---

## 📋 環境変数の設定手順

### 1. Vercel Dashboard にアクセス

1. https://vercel.com/dashboard にアクセス
2. プロジェクトを選択

### 2. 環境変数の設定画面を開く

1. 「Settings」タブをクリック
2. 左メニューから「Environment Variables」を選択

### 3. 管理者パスワードを設定

#### 新規追加の場合:

1. 「Add New」または「New Variable」ボタンをクリック
2. 以下の情報を入力:
   - **Name**: `ADMIN_PASSWORD`
   - **Value**: 任意の安全なパスワード（例: `MySecurePassword2024!`）
   - **Environment**: 
     - ✅ Production（本番環境）
     - ✅ Preview（プレビュー環境）- 必要に応じて
     - ✅ Development（開発環境）- 必要に応じて
3. 「Save」をクリック

#### 既存の値を変更する場合:

1. `ADMIN_PASSWORD` の行を見つける
2. 右側の「...」（3点メニュー）をクリック
3. 「Edit」を選択
4. 新しいパスワードを入力
5. 「Save」をクリック

---

## 🚀 再デプロイの実行

環境変数を変更したら、以下のいずれかの方法で再デプロイを実行します。

### 方法1: Vercel Dashboard から再デプロイ（推奨）

1. 「Deployments」タブに移動
2. 最新のデプロイメント（一番上）を見つける
3. 右側の「...」（3点メニュー）をクリック
4. 「Redeploy」を選択
5. 確認ダイアログで「Redeploy」をクリック
6. デプロイが完了するまで待つ（通常1-2分）

### 方法2: Git プッシュで自動デプロイ

```bash
# プロジェクトディレクトリで実行
cd /Users/Ryo/book-lending-vision

# 空コミットを作成（変更なしでもコミット可能）
git commit --allow-empty -m "環境変数の反映のため再デプロイ"

# GitHubにプッシュ
git push origin main

# Vercelが自動的に検知して再デプロイを開始
```

### 方法3: Vercel CLI で再デプロイ

```bash
# Vercel CLIがインストールされていない場合
npm i -g vercel

# プロジェクトディレクトリで実行
cd /Users/Ryo/book-lending-vision

# 本番環境に再デプロイ
vercel --prod

# デプロイが完了するまで待つ
```

---

## ✅ 環境変数が正しく反映されているか確認

### 1. /api/health エンドポイントで確認

デプロイ完了後、ブラウザまたはcurlで以下のURLにアクセス:

```bash
https://your-app-name.vercel.app/api/health
```

期待されるレスポンス:

```json
{
  "status": "OK",
  "timestamp": "2024-10-27T12:00:00.000Z",
  "config": {
    "hasGoogleVisionKey": true,
    "hasAirtableKey": true,
    "hasAirtableBase": true,
    "hasAdminPassword": true,
    "adminPasswordLength": 20,
    "adminPasswordSource": "environment",
    "tables": {
      "books": "BookM",
      "students": "StudentsM",
      "loans": "Loans"
    }
  },
  "environment": {
    "nodeEnv": "production",
    "port": 3000
  }
}
```

#### 確認ポイント:

- ✅ `hasAdminPassword`: **true** になっているか
- ✅ `adminPasswordSource`: **"environment"** になっているか（"default" の場合は環境変数が読み込まれていない）
- ✅ `adminPasswordLength`: 設定したパスワードの文字数と一致するか

### 2. 管理者ログインをテスト

1. アプリのトップページにアクセス
2. 「管理者ツール」をクリック
3. 新しく設定したパスワードを入力
4. ログインが成功すれば環境変数が正しく反映されている

### 3. Vercel ログで確認

```bash
# Vercel CLIでログを確認
vercel logs --follow

# または特定のデプロイメントのログを確認
vercel logs [deployment-url]
```

ログで以下のような出力を確認:

```
🔧 環境変数設定:
  - GOOGLE_VISION_API_KEY: 設定済み
  - GOOGLE_CLOUD_API_KEY: 設定済み
  - AIRTABLE_API_KEY: 設定済み
  - AIRTABLE_BASE_ID: 設定済み
  - ADMIN_PASSWORD: 設定済み (長さ: 20文字)
```

---

## 🐛 トラブルシューティング

### 問題1: 環境変数を変更したが反映されない

**原因**: 再デプロイを忘れている

**解決法**:
1. 上記の「再デプロイの実行」セクションを参照
2. 必ず再デプロイを実行する
3. `/api/health` エンドポイントで確認

### 問題2: adminPasswordSource が "default" のまま

**原因**: 環境変数名が間違っている、またはスコープが正しく設定されていない

**解決法**:
1. Vercel Dashboard → Settings → Environment Variables
2. 変数名が正確に `ADMIN_PASSWORD` になっているか確認（大文字小文字を区別）
3. Production スコープにチェックが入っているか確認
4. 再デプロイを実行

### 問題3: 管理者ログインに失敗する

**原因**: パスワードが間違っている、または空白文字が含まれている

**解決法**:
1. Vercel Dashboard で環境変数の値を確認
2. 前後に空白がないか確認
3. 特殊文字が正しくエンコードされているか確認
4. 必要に応じてパスワードを再設定
5. 再デプロイを実行

### 問題4: ローカル環境とVercelで異なるパスワードになる

**これは正常な動作です**:

- **ローカル環境**: `.env` ファイルまたは `env-template.txt` の値を使用
- **Vercel環境**: Vercel Dashboard で設定した環境変数を使用

**ローカル環境のパスワードを変更する場合**:
1. プロジェクトルートに `.env` ファイルを作成（まだない場合）
2. 以下の内容を追加:
```bash
ADMIN_PASSWORD=your_local_admin_password
```
3. サーバーを再起動: `npm run dev`

---

## 📝 すべての環境変数のリスト

Vercelで設定すべき環境変数の完全なリスト:

| 変数名 | 必須 | 説明 | 例 |
|--------|------|------|-----|
| `GOOGLE_VISION_API_KEY` | ✅ | Google Vision API キー | `AIzaSy...` |
| `GOOGLE_CLOUD_API_KEY` | ⚪ | Google Vision API キー（代替） | `AIzaSy...` |
| `AIRTABLE_API_KEY` | ✅ | Airtable API キー | `patRe...` |
| `AIRTABLE_BASE_ID` | ✅ | Airtable ベースID | `appYrv...` |
| `AIRTABLE_TABLE_BOOKS` | ⚪ | 書籍テーブル名 | `BookM` |
| `AIRTABLE_TABLE_STUDENTS` | ⚪ | 生徒テーブル名 | `StudentsM` |
| `AIRTABLE_TABLE_LOANS` | ⚪ | 貸出テーブル名 | `Loans` |
| `ADMIN_PASSWORD` | ✅ | 管理者パスワード | `MySecure2024!` |

✅ = 必須
⚪ = オプション（デフォルト値あり）

---

## 🔒 セキュリティのベストプラクティス

### 強力なパスワードを使用する

- 最低12文字以上
- 大文字・小文字・数字・記号を組み合わせる
- 辞書にある単語を避ける

**良い例**:
- `MyB00kL3nd!ng@2024`
- `Sec#Adm!n9876Pass`
- `V3rc3l$AdminP@ssw0rd`

**悪い例**:
- `admin123`
- `password`
- `secure_admin_password_2024`（デフォルト値）

### 環境変数のスコープを適切に設定

- **Production**: 本番環境で必須
- **Preview**: プレビューデプロイでテストする場合は設定
- **Development**: ローカル開発では `.env` ファイルを使用することを推奨

### 定期的にパスワードを変更

セキュリティのため、3-6ヶ月ごとにパスワードを変更することを推奨します。

---

## 📞 サポート

問題が解決しない場合:

1. GitHub Issues: https://github.com/ryo0815/ryo.0815/issues
2. Vercel サポート: https://vercel.com/support
3. このドキュメントの最新版を確認

---

最終更新: 2024年10月27日

