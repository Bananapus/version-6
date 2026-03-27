#!/usr/bin/env bash
# Security Sweep — Build the orchestrator, then run it (FOREGROUND)
# Usage: ./run-security-sweep.sh [--repo REPO] [--discipline NUM]
# Logs: scripts/security/reports/YYYYMMDD-HHMMSS/
# Monitor: tail -f .audit-logs/security-sweep-*.log
#
# This script first builds the orchestrator (Tasks 1-6 from the plan),
# then runs it. Safe to re-run — skips building if already built.
#
# Everything runs in the foreground — progress streams directly to your terminal.

set -euo pipefail

BASE="/Users/jango/Documents/jb/v6/evm"
PLAN="$BASE/docs/superpowers/plans/2026-03-24-autonomous-security-orchestrator.md"
SECURITY_DIR="$BASE/scripts/security"
LOG_DIR="$BASE/.audit-logs"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)

mkdir -p "$LOG_DIR"

# ──────────────────────────────────────────────────────────────────────
# Helpers: colored output for console highlights
# ──────────────────────────────────────────────────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

banner()  { printf "\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════${RESET}\n"; }
header()  { printf "${BOLD}${CYAN}  %s${RESET}\n" "$*"; }
success() { printf "${GREEN}  ✓ %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}  ⚠ %s${RESET}\n" "$*"; }
fail()    { printf "${RED}  ✗ %s${RESET}\n" "$*"; }
info()    { printf "${DIM}  %s${RESET}\n" "$*"; }
elapsed() {
  local now=$(date +%s)
  local secs=$((now - START_TIME))
  local mins=$((secs / 60))
  local s=$((secs % 60))
  printf "%dm%02ds" "$mins" "$s"
}

banner
header "JB V6 SECURITY SWEEP"
header "$(date '+%Y-%m-%d %H:%M:%S')"
banner
echo ""

# ──────────────────────────────────────────────────────────────────────
# STEP 0: Check prerequisites
# ──────────────────────────────────────────────────────────────────────
header "Prerequisites"

PREREQ_OK=true

check_tool() {
  local name="$1"
  local install_hint="$2"
  if command -v "$name" &>/dev/null; then
    local ver
    ver=$("$name" --version 2>/dev/null | head -1 || echo "OK")
    success "$name: $ver"
  else
    fail "$name not found. Install: $install_hint"
    PREREQ_OK=false
  fi
}

check_tool "claude" "https://docs.anthropic.com/en/docs/claude-code"
check_tool "codex"  "npm install -g @openai/codex"
check_tool "forge"  "https://book.getfoundry.sh/getting-started/installation"
check_tool "jq"     "brew install jq"

# Check bash version (need 4.3+ for wait -n)
BASH_VERSION_MAJOR="${BASH_VERSINFO[0]}"
BASH_VERSION_MINOR="${BASH_VERSINFO[1]}"
if [ "$BASH_VERSION_MAJOR" -lt 4 ] || { [ "$BASH_VERSION_MAJOR" -eq 4 ] && [ "$BASH_VERSION_MINOR" -lt 3 ]; }; then
    fail "bash 4.3+ required (you have $BASH_VERSION). Install: brew install bash"
    info "Then run with: /opt/homebrew/bin/bash $0 $*"
    PREREQ_OK=false
else
    success "bash: $BASH_VERSION"
fi

if [ "$PREREQ_OK" = false ]; then
    echo ""
    fail "Missing prerequisites. Fix the above and re-run."
    exit 1
fi

echo ""

# ──────────────────────────────────────────────────────────────────────
# STEP 1: Build the orchestrator if not already built
# ──────────────────────────────────────────────────────────────────────
if [ ! -f "$SECURITY_DIR/orchestrate.sh" ]; then
    header "Building Orchestrator (first run)"
    info "This uses Claude to create all security scripts from the plan."
    info "Log: .audit-logs/security-build-$TIMESTAMP.log"
    echo ""

    if [ ! -f "$PLAN" ]; then
        fail "Plan not found at $PLAN"
        info "Run the brainstorming session first to generate the plan."
        exit 1
    fi

    BUILD_LOG="$LOG_DIR/security-build-$TIMESTAMP.log"

    # Run Claude in foreground — stream-json gives us real-time output
    cd "$BASE"
    claude -p "Read the implementation plan at $PLAN and execute Tasks 1 through 6 (everything up to but NOT including Task 7 'Smoke Test'). Create all files with the exact content specified in the plan. Do NOT run any tests or the orchestrator — just create the files.

Important:
- Create the directory structure first: mkdir -p scripts/security/{lib,prompts/{claude,codex,review,synthesis},configs,reports}
- Write each file exactly as specified in the plan
- Make orchestrate.sh executable (chmod +x)
- The prompts should include the full Report Format and Quality Bar sections from the spec at docs/superpowers/specs/2026-03-24-autonomous-security-orchestrator-design.md
- Verify all .sh files parse correctly with bash -n" \
        --dangerously-skip-permissions \
        --max-turns 80 \
        --output-format stream-json \
        --verbose \
        2>&1 | tee "$BUILD_LOG"

    echo ""

    if [ ! -f "$SECURITY_DIR/orchestrate.sh" ]; then
        fail "Build failed — orchestrate.sh not created."
        info "Check log: $BUILD_LOG"
        exit 1
    fi

    success "Orchestrator built successfully. [$(elapsed)]"
    echo ""
else
    success "Orchestrator already built at $SECURITY_DIR/orchestrate.sh"
    echo ""
fi

# ──────────────────────────────────────────────────────────────────────
# STEP 2: Run the orchestrator (foreground, with progress highlights)
# ──────────────────────────────────────────────────────────────────────
SWEEP_LOG="$LOG_DIR/security-sweep-$TIMESTAMP.log"

banner
header "RUNNING SECURITY SWEEP"
header "Args: ${*:-<none>}"
header "Log:  $SWEEP_LOG"
banner
echo ""

# The orchestrator outputs phase markers that we highlight in real-time.
# We use a line-by-line filter that both logs everything AND highlights
# key progress lines to the console with color.

cd "$BASE"
"$SECURITY_DIR/orchestrate.sh" "$@" 2>&1 | while IFS= read -r line; do
    # Always write to log
    printf '%s\n' "$line" >> "$SWEEP_LOG"

    # Highlight key progress lines to console
    case "$line" in
        *"=== Phase"*|*"PHASE"*)
            banner
            header "$line"
            banner
            ;;
        *"Spawning"*|*"spawning"*|*"Starting"*|*"starting"*)
            printf "${CYAN}  → %s${RESET}\n" "$line"
            ;;
        *"Complete"*|*"complete"*|*"Finished"*|*"finished"*|*"DONE"*|*"done"*)
            success "$line"
            ;;
        *"ERROR"*|*"FAIL"*|*"error"*|*"fail"*)
            fail "$line"
            ;;
        *"WARNING"*|*"WARN"*|*"warning"*|*"warn"*)
            warn "$line"
            ;;
        *"Finding"*|*"finding"*|*"CONFIRMED"*|*"LIKELY"*|*"DISPUTED"*)
            printf "${YELLOW}  ▸ %s${RESET}\n" "$line"
            ;;
        *"Summary"*|*"SUMMARY"*|*"Report"*|*"report"*)
            printf "${BOLD}  ◆ %s${RESET}\n" "$line"
            ;;
        *"Agent"*|*"agent"*|*"claude"*|*"codex"*)
            printf "${DIM}  │ %s${RESET}\n" "$line"
            ;;
        *"Budget"*|*"budget"*|*"cost"*|*"Cost"*)
            printf "${YELLOW}  $ %s${RESET}\n" "$line"
            ;;
        *"Repo:"*|*"repo:"*|*"━"*|*"───"*|*"==="*)
            printf "${BOLD}  %s${RESET}\n" "$line"
            ;;
        *)
            # Regular output: print dimmed so highlights stand out
            printf "${DIM}  %s${RESET}\n" "$line"
            ;;
    esac
done

EXIT_CODE=${PIPESTATUS[0]}

echo ""
banner
if [ "$EXIT_CODE" -eq 0 ]; then
    header "SWEEP COMPLETE [$(elapsed)]"
else
    printf "${BOLD}${RED}  SWEEP FAILED (exit $EXIT_CODE) [$(elapsed)]${RESET}\n"
fi
banner
echo ""

info "Log: $SWEEP_LOG"

# Show the report summary without overriding the orchestrator's exit code when
# no report directory was created.
LATEST_REPORT=""
if [ -d "$SECURITY_DIR/reports" ]; then
    LATEST_REPORT=$(find "$SECURITY_DIR/reports" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort -r | head -1 || true)
fi
if [ -n "$LATEST_REPORT" ]; then
    info "Report: ${LATEST_REPORT}SUMMARY.md"
    echo ""
    if [ -f "${LATEST_REPORT}SUMMARY.md" ]; then
        header "FINDINGS SUMMARY"
        echo ""
        head -80 "${LATEST_REPORT}SUMMARY.md"
        echo ""
        info "(Full report: ${LATEST_REPORT}SUMMARY.md)"
    fi
fi

exit "$EXIT_CODE"
