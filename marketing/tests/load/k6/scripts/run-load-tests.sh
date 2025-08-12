#!/bin/bash

# K6 Load Testing Runner Script - OFM Social OS
# This script runs different types of load tests with proper configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
K6_BASE_URL="${K6_BASE_URL:-https://api-staging.ofm.social}"
K6_API_KEY="${K6_API_KEY:-}"
K6_TEST_CREATOR_ID="${K6_TEST_CREATOR_ID:-test-creator-001}"
K6_MAX_VUS="${K6_MAX_VUS:-100}"
K6_TEST_DURATION="${K6_TEST_DURATION:-10m}"
K6_PROMETHEUS_ENDPOINT="${K6_PROMETHEUS_ENDPOINT:-http://localhost:9090}"
K6_OUTPUT_DIR="${K6_OUTPUT_DIR:-./results}"

# Test types
AVAILABLE_TESTS=(
  "publish"     # Publishing endpoints
  "upload"      # Media upload tests
  "webhooks"    # Webhook processing
  "soak"        # 2-hour soak test
  "all"         # Run all scenarios
)

# Create output directory
mkdir -p "$K6_OUTPUT_DIR"

print_banner() {
  echo -e "${BLUE}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║              K6 Load Testing Suite - OFM Social OS           ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_config() {
  echo -e "${YELLOW}📋 Configuration:${NC}"
  echo "  Base URL: $K6_BASE_URL"
  echo "  API Key: ${K6_API_KEY:+***configured***}"
  echo "  Test Creator ID: $K6_TEST_CREATOR_ID"
  echo "  Max VUs: $K6_MAX_VUS"
  echo "  Test Duration: $K6_TEST_DURATION"
  echo "  Output Directory: $K6_OUTPUT_DIR"
  echo "  Prometheus: $K6_PROMETHEUS_ENDPOINT"
  echo ""
}

check_prerequisites() {
  echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
  
  # Check k6 installation
  if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed. Please install k6: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
  fi
  
  # Check k6 version
  K6_VERSION=$(k6 version | head -n1)
  echo -e "${GREEN}✅ k6 found: $K6_VERSION${NC}"
  
  # Check API endpoint
  echo "🔗 Testing API endpoint..."
  if curl -s --max-time 10 "$K6_BASE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ API endpoint is reachable${NC}"
  else
    echo -e "${RED}❌ API endpoint is not reachable: $K6_BASE_URL${NC}"
    echo "   Please check the URL and network connectivity"
    exit 1
  fi
  
  # Check Prometheus if specified
  if [[ "$K6_PROMETHEUS_ENDPOINT" != "http://localhost:9090" ]]; then
    echo "📊 Testing Prometheus endpoint..."
    if curl -s --max-time 5 "$K6_PROMETHEUS_ENDPOINT/api/v1/query?query=up" > /dev/null; then
      echo -e "${GREEN}✅ Prometheus endpoint is reachable${NC}"
    else
      echo -e "${YELLOW}⚠️  Prometheus endpoint not reachable (optional)${NC}"
    fi
  fi
  
  echo ""
}

run_test() {
  local test_type="$1"
  local scenario_file="./scenarios/${test_type}.js"
  
  if [[ ! -f "$scenario_file" ]]; then
    echo -e "${RED}❌ Scenario file not found: $scenario_file${NC}"
    return 1
  fi
  
  echo -e "${BLUE}🚀 Running $test_type load test...${NC}"
  
  # Generate output files
  local timestamp=$(date +"%Y%m%d_%H%M%S")
  local result_file="$K6_OUTPUT_DIR/${test_type}_${timestamp}"
  
  # K6 command with comprehensive output options
  k6 run \
    --env K6_BASE_URL="$K6_BASE_URL" \
    --env K6_API_KEY="$K6_API_KEY" \
    --env K6_TEST_CREATOR_ID="$K6_TEST_CREATOR_ID" \
    --env K6_MAX_VUS="$K6_MAX_VUS" \
    --env K6_TEST_DURATION="$K6_TEST_DURATION" \
    --env K6_PROMETHEUS_ENDPOINT="$K6_PROMETHEUS_ENDPOINT" \
    --out json="${result_file}.json" \
    --out csv="${result_file}.csv" \
    --summary-export="${result_file}_summary.json" \
    "$scenario_file"
  
  local exit_code=$?
  
  if [[ $exit_code -eq 0 ]]; then
    echo -e "${GREEN}✅ $test_type test completed successfully${NC}"
    generate_report "$test_type" "$result_file"
  else
    echo -e "${RED}❌ $test_type test failed with exit code $exit_code${NC}"
    return $exit_code
  fi
}

generate_report() {
  local test_type="$1"
  local result_file="$2"
  
  echo -e "${YELLOW}📊 Generating test report for $test_type...${NC}"
  
  # Check if jq is available for JSON processing
  if command -v jq &> /dev/null; then
    local summary_file="${result_file}_summary.json"
    
    if [[ -f "$summary_file" ]]; then
      echo "📈 Test Summary:"
      echo "=================="
      
      # Extract key metrics using jq
      jq -r '
        "🎯 Test Results:",
        "  Duration: " + (.root_group.checks.duration // "N/A"),
        "  Total Requests: " + (.metrics.http_reqs.values.count // 0 | tostring),
        "  Failed Requests: " + (.metrics.http_req_failed.values.rate // 0 | tostring),
        "  Avg Response Time: " + (.metrics.http_req_duration.values.avg // 0 | tostring) + "ms",
        "  P95 Response Time: " + (.metrics.http_req_duration.values."p(95)" // 0 | tostring) + "ms",
        "  P99 Response Time: " + (.metrics.http_req_duration.values."p(99)" // 0 | tostring) + "ms"
      ' "$summary_file"
      
      echo ""
      echo "📁 Result files:"
      echo "  JSON: ${result_file}.json"
      echo "  CSV: ${result_file}.csv"
      echo "  Summary: ${summary_file}"
    fi
  else
    echo "📁 Result files generated:"
    echo "  JSON: ${result_file}.json"
    echo "  CSV: ${result_file}.csv"
    echo "  Summary: ${result_file}_summary.json"
    echo ""
    echo "💡 Install 'jq' for detailed report parsing"
  fi
  
  echo ""
}

run_soak_test() {
  echo -e "${BLUE}🔥 Starting 2-hour soak test...${NC}"
  echo -e "${YELLOW}⚠️  This test will run for 2 hours with progressive load${NC}"
  echo -e "${YELLOW}   Monitor system resources and cancel with Ctrl+C if needed${NC}"
  echo ""
  
  read -p "Do you want to continue with the soak test? (y/N): " -n 1 -r
  echo ""
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "soak"
  else
    echo "Soak test cancelled."
  fi
}

run_all_tests() {
  echo -e "${BLUE}🎯 Running all load test scenarios...${NC}"
  echo ""
  
  local failed_tests=()
  
  for test in "publish" "upload" "webhooks"; do
    echo -e "${BLUE}▶️ Starting $test test...${NC}"
    if ! run_test "$test"; then
      failed_tests+=("$test")
    fi
    echo ""
    sleep 5  # Brief pause between tests
  done
  
  # Summary
  echo -e "${BLUE}📋 Test Suite Summary:${NC}"
  echo "======================="
  
  if [[ ${#failed_tests[@]} -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed successfully!${NC}"
  else
    echo -e "${RED}❌ Some tests failed:${NC}"
    for test in "${failed_tests[@]}"; do
      echo -e "${RED}  - $test${NC}"
    done
    exit 1
  fi
}

show_usage() {
  echo "Usage: $0 [test_type] [options]"
  echo ""
  echo "Available test types:"
  for test in "${AVAILABLE_TESTS[@]}"; do
    case $test in
      "publish")
        echo "  $test     - Test publishing endpoints (single/multi-platform)"
        ;;
      "upload")
        echo "  $test      - Test media upload endpoints (standard/multipart)"
        ;;
      "webhooks")
        echo "  $test   - Test webhook processing (TikTok/Meta signatures)"
        ;;
      "soak")
        echo "  $test       - Run 2-hour soak test with progressive load"
        ;;
      "all")
        echo "  $test        - Run all test scenarios (except soak)"
        ;;
    esac
  done
  echo ""
  echo "Environment variables:"
  echo "  K6_BASE_URL           - API base URL (default: staging)"
  echo "  K6_API_KEY            - API authentication key"
  echo "  K6_TEST_CREATOR_ID    - Test creator ID"
  echo "  K6_MAX_VUS            - Maximum virtual users"
  echo "  K6_TEST_DURATION      - Test duration (for non-soak tests)"
  echo "  K6_OUTPUT_DIR         - Results output directory"
  echo ""
  echo "Examples:"
  echo "  $0 publish              # Run publishing test"
  echo "  $0 soak                 # Run 2-hour soak test"
  echo "  K6_MAX_VUS=50 $0 all    # Run all tests with 50 max VUs"
}

main() {
  print_banner
  
  if [[ $# -eq 0 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    show_usage
    exit 0
  fi
  
  local test_type="$1"
  
  # Validate test type
  if [[ ! " ${AVAILABLE_TESTS[*]} " =~ " ${test_type} " ]]; then
    echo -e "${RED}❌ Invalid test type: $test_type${NC}"
    echo ""
    show_usage
    exit 1
  fi
  
  print_config
  check_prerequisites
  
  case "$test_type" in
    "all")
      run_all_tests
      ;;
    "soak")
      run_soak_test
      ;;
    *)
      run_test "$test_type"
      ;;
  esac
  
  echo -e "${GREEN}🎉 Load testing completed!${NC}"
  echo ""
  echo -e "${YELLOW}📊 Next Steps:${NC}"
  echo "1. Review test results in: $K6_OUTPUT_DIR"
  echo "2. Check Grafana dashboard for detailed metrics"
  echo "3. Analyze performance trends and bottlenecks"
  echo "4. Update SLO thresholds based on results"
}

# Script entry point
main "$@"