/**
 * AssemblyScript WASM Module - Fibonacci Calculator
 *
 * Demonstrates basic WASM computation with AssemblyScript.
 * This module calculates Fibonacci numbers efficiently.
 */

/**
 * Calculate the nth Fibonacci number
 * @param n - The position in the Fibonacci sequence
 * @returns The nth Fibonacci number
 */
export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;

  let a: i32 = 0;
  let b: i32 = 1;

  for (let i: i32 = 2; i <= n; i++) {
    const temp: i32 = a + b;
    a = b;
    b = temp;
  }

  return b;
}

/**
 * Calculate multiple Fibonacci numbers and return sum
 * @param count - How many Fibonacci numbers to calculate
 * @returns Sum of first count Fibonacci numbers
 */
export function fibonacciSum(count: i32): i32 {
  let sum: i32 = 0;
  for (let i: i32 = 0; i < count; i++) {
    sum += fibonacci(i);
  }
  return sum;
}

/**
 * Factorial calculation (demonstrates recursion)
 * @param n - Number to calculate factorial for
 * @returns n!
 */
export function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Memory-intensive operation for testing limits
 * Allocates and fills an array with values
 * @param size - Size of array to create
 * @returns Sum of all values
 */
export function memoryTest(size: i32): i32 {
  const arr = new Array<i32>(size);
  for (let i: i32 = 0; i < size; i++) {
    arr[i] = i;
  }

  let sum: i32 = 0;
  for (let i: i32 = 0; i < size; i++) {
    sum += arr[i];
  }

  return sum;
}

/**
 * Add two numbers (simple test function)
 */
export function add(a: i32, b: i32): i32 {
  return a + b;
}

/**
 * Multiply two numbers
 */
export function multiply(a: i32, b: i32): i32 {
  return a * b;
}
