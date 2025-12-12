#!/bin/bash
# Build Rust WASM module

set -e

echo "Building Rust WASM module..."

# Build with wasm-pack (if available)
if command -v wasm-pack &> /dev/null; then
    wasm-pack build --target web --release
    cp pkg/echelon_wasm_bg.wasm ../string_utils.wasm
    echo "✓ Built with wasm-pack: string_utils.wasm"
else
    # Fallback to cargo build
    cargo build --target wasm32-unknown-unknown --release
    cp target/wasm32-unknown-unknown/release/echelon_wasm.wasm ../string_utils.wasm
    echo "✓ Built with cargo: string_utils.wasm"
fi

echo "Done!"
