#!/bin/bash
set -euo pipefail

# ============================================
# vidium dev environment setup
# Ubuntu 24.04
# Run as root: sudo bash env-setup.sh
# ============================================

NODE_MAJOR=24

echo "=== Installing Node.js ${NODE_MAJOR} ==="
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt install -y nodejs
echo "Node.js: $(node --version)"
echo "npm:     $(npm --version)"

echo "=== Installing TypeScript and Biome (global) ==="
npm install -g typescript @biomejs/biome
echo "tsc:   $(tsc --version)"
echo "biome: $(biome --version)"

echo ""
echo "=== Done ==="
echo "  node --run check   — type check"
echo "  node --run format  — format"
echo "  node --run lint    — lint"
