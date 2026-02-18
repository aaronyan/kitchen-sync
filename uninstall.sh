#!/usr/bin/env bash
set -e

BIN_DIR="$HOME/.local/bin"

rm -f "$BIN_DIR/kitchen-sync" "$BIN_DIR/ksync"

echo "Removed kitchen-sync and ksync from $BIN_DIR"
