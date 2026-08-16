#!/usr/bin/env bash
# Redeploy the Expense Manager on the VPS after a code change.
# Run this ON THE VPS from /opt/expense/expense.
set -euo pipefail

if [[ "${1:-}" != "--no-pull" ]]; then
  git pull
fi

npm ci
npm run build
npx prisma migrate deploy
systemctl restart expense
sleep 1
curl -sf http://127.0.0.1:4200/api/health && echo "Expense Manager: healthy"
