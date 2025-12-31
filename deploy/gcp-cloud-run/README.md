# Scentier AI Platform - Google Cloud Run デプロイガイド

社内SaaSとしてCloud Runにデプロイするための完全ガイドです。

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                    GCP Cloud Run アーキテクチャ                   │
└─────────────────────────────────────────────────────────────────┘

                      ┌──────────────┐
                      │ Cloud Load   │
                      │ Balancer     │
                      │ + IAP (任意)  │
                      └──────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼────┐  ┌──────▼─────┐ ┌──────▼─────┐
        │Cloud Run │  │Cloud Run   │ │Cloud Run   │
        │LibreChat │  │RAG API     │ │Meilisearch │
        │(メイン)   │  │(オプション) │ │(オプション) │
        └────┬─────┘  └─────┬──────┘ └────────────┘
             │              │
    ┌────────┼──────────────┼────────────┐
    │        │              │            │
┌───▼───┐ ┌──▼────┐  ┌──────▼─────┐ ┌────▼────┐
│MongoDB│ │Memory │  │Cloud SQL   │ │Cloud    │
│Atlas  │ │store  │  │PostgreSQL  │ │Storage  │
│       │ │(Redis)│  │+pgvector   │ │(Files)  │
└───────┘ └───────┘  └────────────┘ └─────────┘
```

## 前提条件

- Google Cloud アカウントとプロジェクト
- `gcloud` CLI がインストール済み
- Docker がインストール済み
- MongoDB Atlas アカウント（無料枠で可）

## クイックスタート

### 1. 初回セットアップ

```bash
# gcloud にログイン
gcloud auth login

# プロジェクトを設定
gcloud config set project YOUR_PROJECT_ID

# 初回セットアップを実行
./deploy/gcp-cloud-run/deploy.sh --setup --project YOUR_PROJECT_ID
```

### 2. MongoDB Atlas の設定

1. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) にアカウント作成
2. 無料のM0クラスタを作成（asia-northeast1推奨）
3. Database Access でユーザーを作成
4. Network Access で `0.0.0.0/0` を許可（または Cloud Run のIPレンジ）
5. 接続文字列を取得

### 3. シークレットの設定

```bash
# MongoDB接続文字列
echo -n 'mongodb+srv://user:pass@cluster.mongodb.net/ScentierAI?retryWrites=true&w=majority' | \
  gcloud secrets versions add scentier-mongo-uri --data-file=-

# 暗号化キーを生成・設定
openssl rand -hex 32 | gcloud secrets versions add scentier-creds-key --data-file=-
openssl rand -hex 16 | gcloud secrets versions add scentier-creds-iv --data-file=-
openssl rand -hex 32 | gcloud secrets versions add scentier-jwt-secret --data-file=-
openssl rand -hex 32 | gcloud secrets versions add scentier-jwt-refresh-secret --data-file=-
openssl rand -hex 32 | gcloud secrets versions add scentier-meili-key --data-file=-
```

### 4. デプロイ

```bash
# ビルド＆デプロイ
./deploy/gcp-cloud-run/deploy.sh --project YOUR_PROJECT_ID

# 既存イメージでデプロイ（ビルドスキップ）
./deploy/gcp-cloud-run/deploy.sh --project YOUR_PROJECT_ID --skip-build
```

## 詳細設定

### 環境変数

`.env.cloudrun.example` を参考に、Cloud Run サービスの環境変数を設定します。

#### 必須の環境変数

| 変数名 | 説明 |
|--------|------|
| `MONGO_URI` | MongoDB Atlas 接続文字列 |
| `CREDS_KEY` | 資格情報暗号化キー (32バイト hex) |
| `CREDS_IV` | 資格情報初期化ベクトル (16バイト hex) |
| `JWT_SECRET` | JWT署名キー |
| `JWT_REFRESH_SECRET` | JWTリフレッシュトークン署名キー |

#### オプションの環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|------------|
| `APP_TITLE` | アプリケーション名 | LibreChat |
| `ALLOW_REGISTRATION` | ユーザー登録を許可 | false |
| `ALLOW_SOCIAL_LOGIN` | ソーシャルログインを許可 | true |
| `SEARCH` | 検索機能を有効化 | false |

### Google OAuth の設定（推奨）

社内SaaSではGoogle Workspaceアカウントでのログインを推奨します。

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) を開く
2. 「認証情報を作成」→「OAuthクライアントID」
3. アプリケーションの種類：「ウェブアプリケーション」
4. 承認済みのリダイレクトURI：
   - `https://your-service-url.run.app/oauth/google/callback`

```bash
# シークレットを追加
echo -n 'YOUR_CLIENT_ID' | gcloud secrets create scentier-google-client-id --data-file=-
echo -n 'YOUR_CLIENT_SECRET' | gcloud secrets create scentier-google-client-secret --data-file=-

# Cloud Run サービスを更新
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --update-secrets="GOOGLE_CLIENT_ID=scentier-google-client-id:latest,GOOGLE_CLIENT_SECRET=scentier-google-client-secret:latest" \
  --update-env-vars="GOOGLE_CALLBACK_URL=/oauth/google/callback"
```

### Identity-Aware Proxy (IAP) の設定（高セキュリティ）

社内限定アクセスにはIAPを使用します。

```bash
# IAP を有効化
gcloud services enable iap.googleapis.com

# ロードバランサーを作成（IAP対応）
# ... (詳細な手順は GCP ドキュメントを参照)
```

### VPC コネクタの設定（プライベートリソースアクセス）

Cloud SQL や Memorystore にアクセスする場合：

```bash
# VPC コネクタを作成
gcloud compute networks vpc-access connectors create scentier-vpc-connector \
  --region=asia-northeast1 \
  --subnet=default \
  --min-instances=2 \
  --max-instances=10

# Cloud Run サービスを更新
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --vpc-connector=scentier-vpc-connector \
  --vpc-egress=private-ranges-only
```

## CI/CD パイプライン

### Cloud Build トリガーの設定

```bash
# GitHub リポジトリを接続
gcloud builds triggers create github \
  --name="scentier-ai-deploy" \
  --repo-name="scentier_ai_platform" \
  --repo-owner="your-org" \
  --branch-pattern="^main$" \
  --build-config="deploy/gcp-cloud-run/cloudbuild.yaml" \
  --substitutions="_PROJECT_ID=${PROJECT_ID},_REGION=asia-northeast1"
```

### 手動ビルドの実行

```bash
gcloud builds submit \
  --config=deploy/gcp-cloud-run/cloudbuild.yaml \
  --substitutions="_PROJECT_ID=${PROJECT_ID},_REGION=asia-northeast1" \
  .
```

## 運用

### ログの確認

```bash
# Cloud Logging でログを確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=scentier-ai-platform" \
  --limit=100 \
  --format="table(timestamp,severity,textPayload)"

# リアルタイムログ
gcloud alpha run services logs tail scentier-ai-platform --region=asia-northeast1
```

### スケーリングの調整

```bash
# 最小インスタンス数を変更（コールドスタート回避）
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --min-instances=1

# 最大インスタンス数を変更
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --max-instances=20
```

### バックアップとリストア

MongoDB Atlasのバックアップ機能を使用：

1. Atlas Console → Backup → Take Snapshot
2. または自動バックアップスケジュールを設定

### モニタリング

Cloud Monitoring でダッシュボードを作成：

```bash
# カスタムダッシュボードの作成（例）
gcloud monitoring dashboards create --config-from-file=monitoring/dashboard.json
```

## トラブルシューティング

### よくある問題

#### 1. コンテナ起動エラー

```bash
# ログを確認
gcloud run revisions logs read --region=asia-northeast1

# 健全性チェックのエラー
# → /api/health エンドポイントが正しく動作しているか確認
```

#### 2. MongoDB接続エラー

- Atlas の Network Access で `0.0.0.0/0` を許可しているか確認
- 接続文字列のユーザー名/パスワードが正しいか確認
- `retryWrites=true&w=majority` パラメータが含まれているか確認

#### 3. メモリ不足

```bash
# メモリを増加
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --memory=4Gi
```

#### 4. タイムアウト

```bash
# タイムアウトを延長
gcloud run services update scentier-ai-platform \
  --region=asia-northeast1 \
  --timeout=600s
```

## コスト最適化

### 推奨設定

| 設定 | 開発環境 | 本番環境 |
|------|----------|----------|
| min-instances | 0 | 1-2 |
| max-instances | 2 | 10-20 |
| memory | 1Gi | 2Gi |
| cpu | 1 | 2 |

### コスト見積もり（月額、asia-northeast1）

- **最小構成**: $30-50/月
  - Cloud Run: ~$20
  - MongoDB Atlas M0: 無料
  - Secret Manager: ~$1

- **本番構成**: $100-300/月
  - Cloud Run (min-instances=2): ~$100
  - MongoDB Atlas M10: ~$60
  - Cloud Memorystore: ~$50
  - その他: ~$20

## ファイル構成

```
deploy/gcp-cloud-run/
├── Dockerfile.cloudrun      # Cloud Run最適化Dockerfile
├── .env.cloudrun.example    # 環境変数テンプレート
├── cloudbuild.yaml          # Cloud Build設定
├── cloudrun-service.yaml    # Cloud Runサービス定義
├── deploy.sh                # デプロイスクリプト
└── README.md                # このファイル
```

## 参考リンク

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [MongoDB Atlas ドキュメント](https://www.mongodb.com/docs/atlas/)
- [LibreChat ドキュメント](https://www.librechat.ai/docs)
- [Cloud Build ドキュメント](https://cloud.google.com/build/docs)
