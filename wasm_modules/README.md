# Echelon WASM Modules

WebAssembly modules for the Echelon framework.

## Modules

### 1. fibonacci.wasm (AssemblyScript)
Mathematical computation module with:
- `fibonacci(n)` - Calculate nth Fibonacci number
- `fibonacciSum(count)` - Sum of first n Fibonacci numbers
- `factorial(n)` - Calculate factorial
- `add(a, b)` - Add two numbers
- `multiply(a, b)` - Multiply two numbers
- `memoryTest(size)` - Memory allocation test

### 2. string_utils.wasm (Rust)
String processing module with:
- `count_vowels(s)` - Count vowels in string
- `reverse_string(s)` - Reverse a string
- `is_palindrome(s)` - Check if palindrome
- `hash_string(s)` - Simple string hash
- `longest_word_length(s)` - Find longest word
- `word_count(s)` - Count words
- `caesar_encrypt(s, shift)` - Caesar cipher encryption
- `memory_intensive(size)` - Memory test

## Building

### AssemblyScript Module

```bash
# Install dependencies
npm install

# Build fibonacci.wasm
npm run build

# Build debug version
npm run build:asc:debug
```

### Rust Module

```bash
cd rust_module

# Option 1: Using wasm-pack (recommended)
wasm-pack build --target web --release

# Option 2: Using cargo
cargo build --target wasm32-unknown-unknown --release

# Or use the build script
chmod +x build.sh
./build.sh
```

## Prerequisites

### AssemblyScript
```bash
npm install -g assemblyscript
```

### Rust
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack (optional but recommended)
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## Usage in Echelon

See `/api/wasm/*` routes for examples:
- `/api/wasm/demo` - Basic execution demo
- `/api/wasm/sandbox` - Sandboxed execution
- `/api/wasm/generate` - Code generation
- `/api/wasm/metrics` - Runtime metrics
