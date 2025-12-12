/**
 * Rust WASM Module - String and Data Processing
 *
 * Demonstrates WASM with Rust for string manipulation and data processing.
 */

use wasm_bindgen::prelude::*;

/// Count vowels in a string
#[wasm_bindgen]
pub fn count_vowels(s: &str) -> usize {
    s.chars()
        .filter(|c| matches!(c.to_ascii_lowercase(), 'a' | 'e' | 'i' | 'o' | 'u'))
        .count()
}

/// Reverse a string
#[wasm_bindgen]
pub fn reverse_string(s: &str) -> String {
    s.chars().rev().collect()
}

/// Check if string is palindrome
#[wasm_bindgen]
pub fn is_palindrome(s: &str) -> bool {
    let cleaned: String = s.chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();

    cleaned == cleaned.chars().rev().collect::<String>()
}

/// Calculate hash of string (simple DJB2 hash)
#[wasm_bindgen]
pub fn hash_string(s: &str) -> u32 {
    let mut hash: u32 = 5381;
    for c in s.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(c as u32);
    }
    hash
}

/// Find longest word in a string
#[wasm_bindgen]
pub fn longest_word_length(s: &str) -> usize {
    s.split_whitespace()
        .map(|word| word.len())
        .max()
        .unwrap_or(0)
}

/// Count word occurrences
#[wasm_bindgen]
pub fn word_count(s: &str) -> usize {
    s.split_whitespace().count()
}

/// Simple encryption (Caesar cipher)
#[wasm_bindgen]
pub fn caesar_encrypt(s: &str, shift: u8) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_lowercase() {
                ((((c as u8 - b'a') + shift) % 26) + b'a') as char
            } else if c.is_ascii_uppercase() {
                ((((c as u8 - b'A') + shift) % 26) + b'A') as char
            } else {
                c
            }
        })
        .collect()
}

/// Add two numbers (for testing)
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Multiply two numbers
#[wasm_bindgen]
pub fn multiply(a: i32, b: i32) -> i32 {
    a * b
}

/// Memory allocation test - creates a vector and sums it
#[wasm_bindgen]
pub fn memory_intensive(size: usize) -> i32 {
    let vec: Vec<i32> = (0..size as i32).collect();
    vec.iter().sum()
}
