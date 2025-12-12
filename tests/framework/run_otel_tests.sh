#!/usr/bin/env bash
#
# OpenTelemetry Tests Runner
#
# Runs all OTEL-related tests with proper configuration.
#

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   OpenTelemetry Integration Tests for Echelon Framework      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test file
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .ts)

    echo -e "${BLUE}Running: ${test_name}${NC}"

    if deno test --allow-all --quiet "$test_file"; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}✗ ${test_name} failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
}

echo "═══════════════════════════════════════════════════════════════"
echo "Unit Tests"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Run unit tests
run_test "tests/framework/otel_test.ts"
run_test "tests/framework/otel_metrics_test.ts"
run_test "tests/framework/otel_context_test.ts"
run_test "tests/framework/otel_bridge_test.ts"

echo "═══════════════════════════════════════════════════════════════"
echo "Integration Tests"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Run integration tests
run_test "tests/integration/otel_integration_test.ts"

echo "═══════════════════════════════════════════════════════════════"
echo "Test Summary"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${YELLOW}Failed:       $FAILED_TESTS${NC}"
    exit 1
else
    echo -e "${GREEN}Failed:       $FAILED_TESTS${NC}"
    echo ""
    echo -e "${GREEN}✓ All tests passed!${NC}"
fi
