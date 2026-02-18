#!/usr/bin/env bash
set -e

# Check for bun
if ! command -v bun &> /dev/null; then
  echo "bun is required. Install it: https://bun.sh"
  exit 1
fi

echo "Installing dependencies..."
bun install

echo "Building..."
bun run build

# Install to ~/.local/bin (no sudo needed, works everywhere)
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
DIST="$(cd "$(dirname "$0")" && pwd)/dist/index.js"

ln -sf "$DIST" "$BIN_DIR/kitchen-sync"
ln -sf "$DIST" "$BIN_DIR/ksync"

# Ensure ~/.local/bin is in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
  SHELL_RC=""
  if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
  fi

  if [ -n "$SHELL_RC" ]; then
    if ! grep -q '.local/bin' "$SHELL_RC"; then
      echo '' >> "$SHELL_RC"
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
      echo "Added ~/.local/bin to PATH in $SHELL_RC"
      echo "Run: source $SHELL_RC"
    fi
  fi

  export PATH="$BIN_DIR:$PATH"
fi

echo ""
echo "Done! Run: kitchen-sync init"
