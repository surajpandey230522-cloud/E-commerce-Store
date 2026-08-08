#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  build.sh — Render build script for TaskStore
#  Render runs this file automatically during every deployment.
#  Build Command on Render dashboard: bash build.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit immediately if any command fails

echo "──────────────────────────────────────────"
echo "  TaskStore — Build Script"
echo "──────────────────────────────────────────"

# 1. Print Node and npm versions for debugging
echo "Node version: $(node --version)"
echo "npm  version: $(npm --version)"

# 2. Clean install — use package-lock.json for exact reproducible installs
echo ""
echo "▶ Installing dependencies..."
npm ci --omit=dev

echo ""
echo "✓ Build complete. Dependencies installed."
echo "──────────────────────────────────────────"
