#!/usr/bin/env bash
set -euo pipefail

# dev-run.sh — start port-forwards and the Next.js dev server.
# Run this after dev-setup.sh. Stop everything with Ctrl+C.

cleanup() {
  echo ""
  echo "==> Stopping port-forwards..."
  kill "${PF_PIDS[@]}" 2>/dev/null || true
  wait "${PF_PIDS[@]}" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

echo "==> Starting port-forwards..."
kubectl port-forward svc/playball-postgresql 5432:5432 &
PF_PIDS=($!)
kubectl port-forward svc/playball-redis-master 6379:6379 &
PF_PIDS+=($!)
kubectl port-forward svc/playball-exe-sdk 3001:3000 &
PF_PIDS+=($!)

# Give the port-forwards a moment to establish before starting the app.
sleep 1

echo "==> Starting Next.js dev server at http://localhost:3000 ..."
npm run dev
