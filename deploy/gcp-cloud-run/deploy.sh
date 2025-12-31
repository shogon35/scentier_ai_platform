#!/bin/bash
# =============================================================================
# Scentier AI Platform - Cloud Run Deployment Script
# =============================================================================
# Usage: ./deploy.sh [options]
#
# Options:
#   --project PROJECT_ID    GCP Project ID
#   --region REGION         GCP Region (default: asia-northeast1)
#   --env ENV               Environment: dev, staging, prod (default: prod)
#   --skip-build            Skip Docker build, deploy existing image
#   --setup                 Run initial setup (create resources)
#   --help                  Show this help message
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default values
PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-asia-northeast1}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
SERVICE_NAME="scentier-ai-platform"
SKIP_BUILD=false
RUN_SETUP=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -25 "$0" | tail -20
    exit 0
}

check_requirements() {
    log_info "Checking requirements..."

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi

    # Check docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker."
        exit 1
    fi

    # Check if logged in
    if ! gcloud auth print-identity-token &> /dev/null; then
        log_error "Not logged in to gcloud. Run: gcloud auth login"
        exit 1
    fi

    log_success "All requirements met"
}

get_project_id() {
    if [[ -z "$PROJECT_ID" ]]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [[ -z "$PROJECT_ID" ]]; then
            log_error "No project ID specified. Use --project or set gcloud default project"
            exit 1
        fi
    fi
    log_info "Using project: $PROJECT_ID"
}

enable_apis() {
    log_info "Enabling required APIs..."

    apis=(
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "artifactregistry.googleapis.com"
        "secretmanager.googleapis.com"
    )

    for api in "${apis[@]}"; do
        gcloud services enable "$api" --project="$PROJECT_ID" --quiet
    done

    log_success "APIs enabled"
}

create_artifact_registry() {
    local repo_name="scentier-ai"

    log_info "Creating Artifact Registry repository..."

    if gcloud artifacts repositories describe "$repo_name" \
        --location="$REGION" \
        --project="$PROJECT_ID" &>/dev/null; then
        log_info "Repository already exists"
    else
        gcloud artifacts repositories create "$repo_name" \
            --repository-format=docker \
            --location="$REGION" \
            --description="Scentier AI Platform container images" \
            --project="$PROJECT_ID"
        log_success "Repository created"
    fi
}

create_service_account() {
    local sa_name="scentier-ai-sa"
    local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"

    log_info "Creating service account..."

    if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null; then
        log_info "Service account already exists"
    else
        gcloud iam service-accounts create "$sa_name" \
            --display-name="Scentier AI Platform Service Account" \
            --project="$PROJECT_ID"
        log_success "Service account created"
    fi

    # Grant necessary roles
    log_info "Granting IAM roles..."

    roles=(
        "roles/secretmanager.secretAccessor"
        "roles/logging.logWriter"
        "roles/monitoring.metricWriter"
        "roles/cloudtrace.agent"
    )

    for role in "${roles[@]}"; do
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$sa_email" \
            --role="$role" \
            --quiet
    done

    log_success "IAM roles granted"
}

create_secrets() {
    log_info "Creating secrets in Secret Manager..."

    secrets=(
        "scentier-mongo-uri"
        "scentier-creds-key"
        "scentier-creds-iv"
        "scentier-jwt-secret"
        "scentier-jwt-refresh-secret"
        "scentier-meili-key"
    )

    for secret in "${secrets[@]}"; do
        if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
            log_info "Secret $secret already exists"
        else
            # Create empty secret (user needs to add value)
            echo -n "placeholder" | gcloud secrets create "$secret" \
                --data-file=- \
                --project="$PROJECT_ID" \
                --replication-policy="automatic"
            log_warning "Created placeholder for $secret - UPDATE WITH REAL VALUE!"
        fi
    done

    echo ""
    log_warning "=== IMPORTANT: Update secrets with real values ==="
    echo "Run the following commands to update each secret:"
    echo ""
    echo "  # MongoDB Atlas connection string"
    echo "  echo -n 'mongodb+srv://...' | gcloud secrets versions add scentier-mongo-uri --data-file=-"
    echo ""
    echo "  # Generate and set encryption keys"
    echo "  openssl rand -hex 32 | gcloud secrets versions add scentier-creds-key --data-file=-"
    echo "  openssl rand -hex 16 | gcloud secrets versions add scentier-creds-iv --data-file=-"
    echo "  openssl rand -hex 32 | gcloud secrets versions add scentier-jwt-secret --data-file=-"
    echo "  openssl rand -hex 32 | gcloud secrets versions add scentier-jwt-refresh-secret --data-file=-"
    echo "  openssl rand -hex 32 | gcloud secrets versions add scentier-meili-key --data-file=-"
    echo ""
}

build_and_push() {
    local image_name="${REGION}-docker.pkg.dev/${PROJECT_ID}/scentier-ai/${SERVICE_NAME}"
    local image_tag="${image_name}:$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"

    log_info "Building Docker image..."

    cd "$PROJECT_ROOT"

    # Configure Docker for Artifact Registry
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

    # Build image
    docker build \
        -f deploy/gcp-cloud-run/Dockerfile.cloudrun \
        -t "$image_tag" \
        -t "${image_name}:latest" \
        .

    log_success "Image built"

    log_info "Pushing image to Artifact Registry..."
    docker push "$image_tag"
    docker push "${image_name}:latest"

    log_success "Image pushed: $image_tag"

    echo "$image_tag"
}

deploy_service() {
    local image_name="${REGION}-docker.pkg.dev/${PROJECT_ID}/scentier-ai/${SERVICE_NAME}:latest"

    log_info "Deploying to Cloud Run..."

    gcloud run deploy "$SERVICE_NAME" \
        --image="$image_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --platform=managed \
        --allow-unauthenticated \
        --min-instances=0 \
        --max-instances=10 \
        --memory=2Gi \
        --cpu=2 \
        --timeout=300s \
        --concurrency=80 \
        --port=8080 \
        --cpu-boost \
        --execution-environment=gen2 \
        --service-account="scentier-ai-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --set-secrets="MONGO_URI=scentier-mongo-uri:latest,CREDS_KEY=scentier-creds-key:latest,CREDS_IV=scentier-creds-iv:latest,JWT_SECRET=scentier-jwt-secret:latest,JWT_REFRESH_SECRET=scentier-jwt-refresh-secret:latest,MEILI_MASTER_KEY=scentier-meili-key:latest" \
        --set-env-vars="NODE_ENV=production,CONSOLE_JSON=true,TRUST_PROXY=1,NO_INDEX=true,APP_TITLE=Scentier AI Platform,ALLOW_REGISTRATION=false,ALLOW_SOCIAL_LOGIN=true,SEARCH=false,DEBUG_LOGGING=false,OPENAI_API_KEY=user_provided,ANTHROPIC_API_KEY=user_provided,GOOGLE_KEY=user_provided" \
        --labels="app=scentier-ai,env=${ENVIRONMENT},team=platform"

    log_success "Deployment complete!"

    # Get service URL
    local service_url
    service_url=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format='value(status.url)')

    echo ""
    echo "=========================================="
    echo -e "${GREEN}Deployment Successful!${NC}"
    echo "=========================================="
    echo "Service URL: $service_url"
    echo ""
    echo "Update DOMAIN_CLIENT and DOMAIN_SERVER in your configuration:"
    echo "  DOMAIN_CLIENT=$service_url"
    echo "  DOMAIN_SERVER=$service_url"
    echo ""
}

run_setup() {
    log_info "Running initial setup..."

    get_project_id
    enable_apis
    create_artifact_registry
    create_service_account
    create_secrets

    echo ""
    log_success "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Update secrets with real values (see commands above)"
    echo "  2. Create MongoDB Atlas cluster and get connection string"
    echo "  3. Run: ./deploy.sh --project $PROJECT_ID"
    echo ""
}

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --setup)
            RUN_SETUP=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# =============================================================================
# Main
# =============================================================================
main() {
    echo "=========================================="
    echo "Scentier AI Platform - Cloud Run Deploy"
    echo "=========================================="
    echo ""

    check_requirements
    get_project_id

    if [[ "$RUN_SETUP" == true ]]; then
        run_setup
        exit 0
    fi

    if [[ "$SKIP_BUILD" == false ]]; then
        build_and_push
    fi

    deploy_service
}

main
