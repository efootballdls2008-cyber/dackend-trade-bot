#!/bin/bash
set -euo pipefail

echo "🚀 Railway Production Database Bootstrap"
echo "========================================"

if ! command -v railway &> /dev/null; then
  echo "❌ Railway CLI not found. Install: npm install -g @railway/cli"
  exit 1
fi

# Pull admin seed vars from the backend service, run bootstrap via MySQL TCP proxy
ADMIN_SEED_EMAIL="$(railway variables --service dackend-trade-bot 2>/dev/null | awk -F'│' '/ADMIN_SEED_EMAIL/ {gsub(/ /,"",$2); print $2}')"
ADMIN_SEED_PASSWORD="$(railway variables --service dackend-trade-bot 2>/dev/null | awk -F'│' '/ADMIN_SEED_PASSWORD/ {gsub(/ /,"",$2); print $2}')"
ADMIN_SEED_FIRST_NAME="$(railway variables --service dackend-trade-bot 2>/dev/null | awk -F'│' '/ADMIN_SEED_FIRST_NAME/ {gsub(/ /,"",$2); print $2}')"
ADMIN_SEED_LAST_NAME="$(railway variables --service dackend-trade-bot 2>/dev/null | awk -F'│' '/ADMIN_SEED_LAST_NAME/ {gsub(/ /,"",$2); print $2}')"

export ADMIN_SEED_EMAIL ADMIN_SEED_PASSWORD ADMIN_SEED_FIRST_NAME ADMIN_SEED_LAST_NAME

railway run --service MySQL node bootstrap-railway-db.js
