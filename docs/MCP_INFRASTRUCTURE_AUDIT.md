# Scentier AI Platform - MCP基盤 調査レポート

**作成日**: 2026-02-09
**調査対象**: MCPサーバー設定の読み込み・デプロイ基盤全体

---

## 1. エグゼクティブサマリー

MCPサーバーが「設定されているのに起動しない」問題を調査した結果、**設定ファイル（librechat.yaml）がアプリケーションに到達していない**ことが根本原因であると判明した。ローカル環境・Cloud Run本番環境の両方で、設定ファイルの受け渡しに不備があった。

加えて、Cloud Buildのデプロイパイプラインにも**リージョン不一致・Dockerfile参照ミス**が存在し、自動デプロイが正常に機能していなかった。

---

## 2. 発見された課題一覧

### 2.1 ローカル環境（Docker Compose）

| # | 課題 | 深刻度 | 状態 |
|---|---|---|---|
| L-1 | `docker-compose.override.yml` に `librechat.yaml` のボリュームマウントが欠落 | 高 | **解決済** |

**詳細**:
- `docker-compose.yml` のボリュームマウントに `.env` はあるが `librechat.yaml` が含まれていなかった
- コンテナ内の `/app/librechat.yaml` にホスト側の設定が渡されず、MCPサーバー定義が認識されなかった

**修正内容**:
```yaml
# docker-compose.override.yml に追加
- ./librechat.yaml:/app/librechat.yaml
```

---

### 2.2 Cloud Run本番環境（asia-northeast1）

| # | 課題 | 深刻度 | 状態 |
|---|---|---|---|
| C-1 | `Dockerfile.cloudrun` のランタイムステージで `librechat.yaml` がCOPYされていない | 高 | **解決済** |
| C-2 | `CONFIG_PATH` 環境変数が Secret Manager のパスを指している | 情報 | 既存設計 |
| C-3 | Secret Manager の `scentier-librechat-config` が最新の `librechat.yaml` と同期されているか不明 | 中 | **要確認** |

**C-1 の詳細**:
- マルチステージビルドのランタイムステージ（Stage 2）で、個別ファイルを`COPY`しているが `librechat.yaml` が漏れていた
- ビルドステージ（Stage 1）では `COPY . .` で全ファイルが入っているため見落としやすい

**C-2 の詳細**:
- `asia-northeast1` のCloud Runサービスには以下が設定されている:
  - 環境変数: `CONFIG_PATH=/secrets/config/librechat.yaml`
  - ボリュームマウント: Secret Manager `scentier-librechat-config` → `/secrets/config/librechat.yaml`
- つまり、Dockerfile に `COPY` した `/app/librechat.yaml` ではなく、**Secret Manager から取得した `librechat.yaml` が使われる**
- Dockerfileへの `COPY` 追加はフォールバックとして有用だが、**実際にMCP設定を反映するには Secret Manager の内容を更新する必要がある**

**C-3 の詳細**:
- Secret Manager に格納されている `librechat.yaml` の内容が、リポジトリ内の最新設定と一致しているか不明
- MCP サーバー追加時は、Secret Manager のシークレットも更新する運用が必要

---

### 2.3 Cloud Build パイプライン

| # | 課題 | 深刻度 | 状態 |
|---|---|---|---|
| B-1 | デプロイリージョンが `us-central1` で、本番環境 `asia-northeast1` と不一致 | 高 | **解決済** |
| B-2 | Artifact Registry リポジトリが `cloud-run-source-deploy`（us-central1）を参照 | 高 | **解決済** |
| B-3 | Dockerfileパスが `Dockerfile`（ルート）で、`deploy/gcp-cloud-run/Dockerfile.cloudrun` でない | 高 | **解決済** |
| B-4 | `us-central1` のCloud Runサービスに環境変数・Secretが未設定 | 中 | 未対応（不要サービス） |

**B-1〜B-3 の詳細**:
Cloud Buildトリガー（GitHub連携、mainブランチへのpush時に自動実行）の substitutions が誤っていた。

| 設定項目 | 旧（誤） | 新（正） |
|---|---|---|
| `_DEPLOY_REGION` | `us-central1` | `asia-northeast1` |
| `_AR_HOSTNAME` | `us-central1-docker.pkg.dev` | `asia-northeast1-docker.pkg.dev` |
| `_AR_REPOSITORY` | `cloud-run-source-deploy` | `scentier-ai` |
| Dockerfile | `Dockerfile` | `deploy/gcp-cloud-run/Dockerfile.cloudrun` |

**B-4 の詳細**:
- `us-central1` にも `scentier-ai-platform` サービスが存在するが、MONGO_URI 等の必須環境変数が未設定
- コンテナ起動時に `Error: Please define the MONGO_URI environment variable` で即座にクラッシュ
- 今後使用予定がなければ削除を推奨

---

### 2.4 MCP初期化コードの設計上の注意点

| # | 課題 | 深刻度 | 状態 |
|---|---|---|---|
| D-1 | MCP初期化エラーが握りつぶされ、アプリ起動が「成功」として扱われる | 中 | 既存設計 |

**詳細**:
- `api/server/services/initializeMCPs.js` において、`Promise.allSettled()` と `try/catch` でエラーをログ出力のみで処理
- アプリケーション起動自体は正常に完了するため、MCP サーバーの接続失敗に気づきにくい
- ログ（Cloud Logging）で `[MCP]` プレフィックスのエラーを監視する運用が必要

---

## 3. 現在のアーキテクチャ（as-is）

### 3.1 設定ファイルの流れ

```
                    ┌──────────────────────────────┐
                    │  リポジトリ                    │
                    │  librechat.yaml               │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
         ローカル環境      Cloud Build         Secret Manager
              │                │                    │
    docker-compose         Dockerfile            手動更新
    override.yml           .cloudrun                │
    ボリュームマウント      COPY → イメージ内       │
              │                │                    │
              ▼                ▼                    ▼
    /app/librechat.yaml   /app/librechat.yaml   /secrets/config/
    (コンテナ内)           (イメージ内)           librechat.yaml
                                                 (ボリュームマウント)
                                                    │
                                          CONFIG_PATH環境変数で
                                          こちらが優先される
```

### 3.2 デプロイフロー

```
  開発者が main に push
         │
         ▼
  Cloud Build トリガー発火
         │
         ├── Step 1: Docker Build (Dockerfile.cloudrun)
         │            → asia-northeast1-docker.pkg.dev にイメージ保存
         │
         ├── Step 2: Docker Push
         │
         └── Step 3: gcloud run services update
                      → asia-northeast1 の scentier-ai-platform を更新
                      → CONFIG_PATH=/secrets/config/librechat.yaml
                      → Secret Manager からマウント
```

### 3.3 環境一覧

| 環境 | リージョン | 状態 | 用途 |
|---|---|---|---|
| ローカル Docker Compose | - | 稼働中 | 開発・テスト |
| Cloud Run (asia-northeast1) | asia-northeast1 | **本番** | ユーザー向けサービス |
| Cloud Run (us-central1) | us-central1 | 非稼働 | 不要（削除推奨） |

---

## 4. あるべき姿（to-be）

### 4.1 設定ファイル管理の一元化

**現状の問題**: `librechat.yaml` がリポジトリ、Secret Manager、Dockerイメージの3箇所に分散し、同期が保証されていない。

**あるべき姿**:

```
  リポジトリ内 librechat.yaml
         │
         │  (Single Source of Truth)
         │
         ├──→ ローカル: docker-compose でボリュームマウント
         │
         └──→ Cloud Run: デプロイパイプラインで Secret Manager を自動更新
                         → Cloud Run がマウント → CONFIG_PATH で読み込み
```

**具体的な改善策**:
1. Cloud Build パイプラインに「Secret Manager 更新ステップ」を追加
2. リポジトリの `librechat.yaml` を変更 → push → Secret Manager が自動更新 → Cloud Run に反映
3. 手動での Secret Manager 更新を不要にする

### 4.2 Cloud Build パイプラインの整備

**あるべき姿**:

| ステップ | 内容 |
|---|---|
| Step 0 (新規) | `librechat.yaml` を Secret Manager に同期 |
| Step 1 | Docker Build (`Dockerfile.cloudrun`) |
| Step 2 | Docker Push (asia-northeast1) |
| Step 3 | Cloud Run デプロイ (asia-northeast1) |
| Step 4 (新規) | デプロイ後のヘルスチェック |

### 4.3 不要リソースの整理

| リソース | アクション |
|---|---|
| Cloud Run `scentier-ai-platform` (us-central1) | 削除 |
| Artifact Registry `cloud-run-source-deploy` (us-central1) | 不要イメージの削除検討 |

### 4.4 MCP設定変更の運用フロー

**あるべき姿**:

```
1. librechat.yaml を編集（MCPサーバー追加・変更）
2. git commit && git push origin main
3. Cloud Build が自動実行:
   a. Secret Manager の scentier-librechat-config を更新
   b. Docker イメージをビルド・プッシュ
   c. Cloud Run サービスを更新（新リビジョン作成）
4. Cloud Run が新リビジョンで起動
   → CONFIG_PATH=/secrets/config/librechat.yaml を読み込み
   → MCPサーバーが初期化される
```

### 4.5 監視・可観測性

| 項目 | あるべき姿 |
|---|---|
| MCP初期化ログ | Cloud Logging で `[MCP]` をフィルタしたアラート設定 |
| ヘルスチェック | `/api/health` に加え、MCP接続状態を含むエンドポイント検討 |
| デプロイ通知 | Cloud Build 完了時に Slack/Teams 通知 |

---

## 5. 実施済みの修正

| # | 修正内容 | ファイル | 日付 |
|---|---|---|---|
| 1 | `librechat.yaml` のボリュームマウント追加 | `docker-compose.override.yml` | 2026-02-09 |
| 2 | ランタイムステージに `librechat.yaml` のCOPY追加 | `deploy/gcp-cloud-run/Dockerfile.cloudrun` | 2026-02-09 |
| 3 | Cloud Build トリガーのリージョンを `asia-northeast1` に修正 | Cloud Build トリガー設定 | 2026-02-09 |
| 4 | Cloud Build トリガーの AR リポジトリを `scentier-ai` に修正 | Cloud Build トリガー設定 | 2026-02-09 |
| 5 | Cloud Build トリガーの Dockerfile パスを修正 | Cloud Build トリガー設定 | 2026-02-09 |

---

## 6. 未対応・要検討事項

| # | 項目 | 優先度 | 備考 |
|---|---|---|---|
| 1 | Secret Manager の `scentier-librechat-config` が最新か確認・更新 | **高** | MCP設定が反映されるかの最終確認 |
| 2 | Cloud Build に Secret Manager 自動更新ステップを追加 | 中 | 運用効率化 |
| 3 | `us-central1` の不要 Cloud Run サービスの削除 | 低 | コスト削減 |
| 4 | MCP初期化エラーの監視アラート設定 | 中 | 障害早期検知 |
| 5 | 現在実行中の Cloud Build（f09e98c4）の結果確認 | **高** | デプロイ成功確認 |

---

## 付録: MCPサーバー現在の設定

`librechat.yaml` に定義されている MCPサーバー:

| サーバー名 | タイプ | URL | タイムアウト |
|---|---|---|---|
| `analyzer` | streamable-http | `https://bq-mcp-server-....run.app/mcp` | 30秒 |
| `scentier_creative` | streamable-http | `https://api.dify.ai/mcp/server/.../mcp` | 180秒 |
| `scentier_material_creation` | streamable-http | `https://api.dify.ai/mcp/server/.../mcp` | 280秒 |
| `multi_model_output` | streamable-http | `https://api.dify.ai/mcp/server/.../mcp` | 180秒 |
