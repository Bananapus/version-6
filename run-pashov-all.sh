#!/bin/bash
# Pashov Solidity Auditor (Claude) — automated run across all JB V6 repos
# Usage: ./run-pashov-all.sh [repo-name ...]
# Logs: .audit-logs/<repo>-pashov-<timestamp>.log
# Monitor: tail -f .audit-logs/pashov-summary-*.log
# Reports: .audit/findings/<repo>-claude-pashov-ai-audit-report-<timestamp>.md

set -euo pipefail

BASE="/Users/jango/Documents/jb/v6/evm"
LOG_DIR="$BASE/.audit-logs"
SKILL_ROOT="$BASE/.pashov-skills/solidity-auditor"
HOURLY_POLL_SECONDS=3600

mkdir -p "$LOG_DIR"

REPOS=(
  "nana-core-v6"
  "univ4-lp-split-hook-v6"
  "revnet-core-v6"
  "nana-router-terminal-v6"
  "nana-721-hook-v6"
  "univ4-router-v6"
  "nana-buyback-hook-v6"
  "nana-suckers-v6"
  "defifa"
  "croptop-core-v6"
  "banny-retail-v6"
  "nana-omnichain-deployers-v6"
  "nana-ownable-v6"
  "nana-privacy-v6"
  "nana-address-registry-v6"
  "nana-project-handles-v6"
  "nana-permission-ids-v6"
  "nana-fee-project-deployer-v6"
  "nana-distributor-v6"
  "deploy-all-v6"
)

if [ "$#" -gt 0 ]; then
  REQUESTED_REPOS=("$@")
  FILTERED_REPOS=()

  for requested_repo in "${REQUESTED_REPOS[@]}"; do
    found=false
    for repo in "${REPOS[@]}"; do
      if [ "$repo" = "$requested_repo" ]; then
        FILTERED_REPOS+=("$requested_repo")
        found=true
        break
      fi
    done

    if [ "$found" = false ]; then
      echo "Unknown repo: $requested_repo" >&2
      echo "Allowed repos: ${REPOS[*]}" >&2
      exit 1
    fi
  done

  REPOS=("${FILTERED_REPOS[@]}")
fi

pkg_to_repo() {
  case "$1" in
    "@bananapus/core-v6") echo "nana-core-v6" ;;
    "@bananapus/permission-ids-v6") echo "nana-permission-ids-v6" ;;
    "@bananapus/address-registry-v6") echo "nana-address-registry-v6" ;;
    "@bananapus/721-hook-v6") echo "nana-721-hook-v6" ;;
    "@bananapus/ownable-v6") echo "nana-ownable-v6" ;;
    "@bananapus/buyback-hook-v6") echo "nana-buyback-hook-v6" ;;
    "@bananapus/router-terminal-v6") echo "nana-router-terminal-v6" ;;
    "@bananapus/suckers-v6") echo "nana-suckers-v6" ;;
    "@bananapus/univ4-router-v6") echo "univ4-router-v6" ;;
    "@bananapus/univ4-lp-split-hook-v6") echo "univ4-lp-split-hook-v6" ;;
    "@bananapus/omnichain-deployers-v6") echo "nana-omnichain-deployers-v6" ;;
    "@bananapus/fee-project-deployer-v6") echo "nana-fee-project-deployer-v6" ;;
    "@bananapus/deploy-all-v6") echo "deploy-all-v6" ;;
    "@rev-net/core-v6") echo "revnet-core-v6" ;;
    "@croptop/core-v6") echo "croptop-core-v6" ;;
    "@bannynet/core-v6") echo "banny-retail-v6" ;;
    "@ballkidz/defifa") echo "defifa" ;;
    "@bananapus/project-handles-v6") echo "nana-project-handles-v6" ;;
    "@bananapus/distributor-v6") echo "nana-distributor-v6" ;;
    *) ;;
  esac
}

append_doc_if_present() {
  local repo="$1"
  local bundle="$2"
  local label="$3"
  local doc="$4"
  local path="$BASE/$repo/$doc"

  if [ -f "$path" ]; then
    echo "---" >> "$bundle"
    echo "## $label: $repo / $doc" >> "$bundle"
    echo "" >> "$bundle"
    cat "$path" >> "$bundle"
    echo "" >> "$bundle"
  fi
}

append_top_level_doc_if_present() {
  local bundle="$1"
  local doc="$2"
  local path="$BASE/$doc"

  if [ -f "$path" ]; then
    echo "---" >> "$bundle"
    echo "## PROTOCOL: $doc" >> "$bundle"
    echo "" >> "$bundle"
    cat "$path" >> "$bundle"
    echo "" >> "$bundle"
  fi
}

claude_out_of_credits() {
  local log_file="$1"

  if [ ! -f "$log_file" ]; then
    return 1
  fi

  grep -Eq '"error":"rate_limit"|"status":"rejected".*"out_of_credits"|You'\''re out of extra usage' "$log_file"
}

get_dep_repos() {
  local repo="$1"
  local pkg="$BASE/$repo/package.json"

  if [ ! -f "$pkg" ]; then
    return
  fi

  python3 -c "
import json
with open('$pkg') as f:
    pkg = json.load(f)
deps = pkg.get('dependencies', {})
prefixes = ('@bananapus/', '@rev-net/', '@croptop/', '@bannynet/', '@ballkidz/')
for name in deps:
    if name.startswith(prefixes):
        print(name)
" 2>/dev/null || true
}

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY="$LOG_DIR/pashov-summary-$TIMESTAMP.log"

echo "=== Pashov Solidity Auditor (Claude) Run: $TIMESTAMP ===" | tee "$SUMMARY"
echo "Repos: ${#REPOS[@]}" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

if [ ! -d "$SKILL_ROOT" ]; then
  echo "Skill directory not found: $SKILL_ROOT" | tee -a "$SUMMARY"
  exit 1
fi

PROMPT_DIR="/tmp/pashov-prompts-$TIMESTAMP"
mkdir -p "$PROMPT_DIR"

STATIC_SKILL_BUNDLE="$PROMPT_DIR/pashov-skill-static.md"
cat \
  "$SKILL_ROOT/SKILL.md" \
  "$SKILL_ROOT/references/report-formatting.md" \
  "$SKILL_ROOT/references/judging.md" \
  "$SKILL_ROOT/references/attack-vectors/attack-vectors.md" \
  "$SKILL_ROOT/references/hacking-agents/vector-scan-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/math-precision-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/access-control-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/economic-security-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/execution-trace-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/invariant-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/periphery-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/first-principles-agent.md" \
  "$SKILL_ROOT/references/hacking-agents/shared-rules.md" \
  > "$STATIC_SKILL_BUNDLE"

STATIC_LINES=$(wc -l < "$STATIC_SKILL_BUNDLE" | tr -d ' ')
echo "Static skill bundle: $STATIC_LINES lines" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

for REPO in "${REPOS[@]}"; do
  BUNDLE="$PROMPT_DIR/$REPO-context.md"

  echo "# Audit Context for $REPO" > "$BUNDLE"
  echo "" >> "$BUNDLE"
  echo "This bundle contains top-level protocol docs, repo docs, and direct dependency audit docs." >> "$BUNDLE"
  echo "" >> "$BUNDLE"

  append_top_level_doc_if_present "$BUNDLE" "AUDIT_INSTRUCTIONS.md"
  append_top_level_doc_if_present "$BUNDLE" "ARCHITECTURE.md"
  append_top_level_doc_if_present "$BUNDLE" "RISKS.md"

  append_doc_if_present "$REPO" "$BUNDLE" "THIS REPO" "AUDIT_INSTRUCTIONS.md"
  append_doc_if_present "$REPO" "$BUNDLE" "THIS REPO" "ARCHITECTURE.md"
  append_doc_if_present "$REPO" "$BUNDLE" "THIS REPO" "RISKS.md"

  SEEN_DEPS=""
  while IFS= read -r pkg_name; do
    [ -z "$pkg_name" ] && continue
    dep_repo="$(pkg_to_repo "$pkg_name")"
    if [ -n "$dep_repo" ] && [ "$dep_repo" != "$REPO" ]; then
      case " $SEEN_DEPS " in
        *" $dep_repo "*) ;;
        *)
          SEEN_DEPS="$SEEN_DEPS $dep_repo"
          append_doc_if_present "$dep_repo" "$BUNDLE" "DEPENDENCY" "AUDIT_INSTRUCTIONS.md"
          ;;
      esac
    fi
  done < <(get_dep_repos "$REPO")

  BUNDLE_LINES=$(wc -l < "$BUNDLE" | tr -d ' ')
  BUNDLE_KB=$(echo "scale=1; $(wc -c < "$BUNDLE") / 1024" | bc)
  echo "  $REPO: ${BUNDLE_KB}KB context ($BUNDLE_LINES lines) [deps:$SEEN_DEPS]" | tee -a "$SUMMARY"
done

echo "" | tee -a "$SUMMARY"

PREV_DIR="$BASE/.audit-findings-pashov-claude-prev-$TIMESTAMP"
mkdir -p "$PREV_DIR"
HIDDEN_COUNT=0

for REPO in "${REPOS[@]}"; do
  REPORTS_DIR="$BASE/$REPO/.audit/findings"
  if [ -d "$REPORTS_DIR" ]; then
    REPORT_FILES=$(find "$REPORTS_DIR" -maxdepth 1 -name "*-claude-pashov-ai-audit-report-*.md" 2>/dev/null)
    if [ -n "$REPORT_FILES" ]; then
      mkdir -p "$PREV_DIR/$REPO"
      cp -a "$REPORTS_DIR"/*-claude-pashov-ai-audit-report-*.md "$PREV_DIR/$REPO/" 2>/dev/null || true
      rm -f "$REPORTS_DIR"/*-claude-pashov-ai-audit-report-*.md
      HIDDEN_COUNT=$((HIDDEN_COUNT + 1))
    fi
  fi
done

echo "Cleared prior Claude Pashov reports from $HIDDEN_COUNT repos → $PREV_DIR" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

for i in "${!REPOS[@]}"; do
  REPO="${REPOS[$i]}"
  REPO_DIR="$BASE/$REPO"
  LOG_FILE="$LOG_DIR/${REPO}-pashov-${TIMESTAMP}.log"
  CONTEXT_BUNDLE="$PROMPT_DIR/$REPO-context.md"

  echo "[$((i+1))/${#REPOS[@]}] Starting: $REPO" | tee -a "$SUMMARY"
  echo "  Log: $LOG_FILE" | tee -a "$SUMMARY"
  echo "  Started: $(date)" | tee -a "$SUMMARY"

  if [ ! -d "$REPO_DIR" ]; then
    echo "  SKIPPED: directory not found" | tee -a "$SUMMARY"
    echo "" | tee -a "$SUMMARY"
    continue
  fi

  PASHOV_PROMPT="You are running the local Pashov Audit Group 'solidity-auditor' skill for this repository.

Repository root: $REPO_DIR
Skill root: $SKILL_ROOT

Treat this as ONE repo-level audit, not one report per file. Review the repo's Solidity attack surface using the Solidity Auditor methodology and produce exactly one final report file with --file-output semantics.

Operational constraints:
- This is a non-interactive Claude CLI run. Do not rely on slash commands or editor-specific UI features.
- If the skill asks for agent orchestration, emulate the intended eight specialist passes using the tools available in this session. Parallelize when available, otherwise do the passes serially.
- Skip the remote VERSION curl check silently if network access is unavailable.
- Use the skill's exclude pattern: skip interfaces/, lib/, mocks/, test/, .security-worktrees/, *.t.sol, *Test*.sol, *Mock*.sol unless a file outside those paths is needed to validate a cross-contract path.
- Audit deployment/configuration scripts too when they are security-relevant, but keep the final report repo-level.
- Ignore prior findings under .audit/findings/ and any stale report artifacts.
- Write the markdown report to .audit/findings/{project-name}-claude-pashov-ai-audit-report-{timestamp}.md in this repo.

Deliverable requirements:
- Produce the final report in the exact Pashov report format.
- Include only confirmed findings and leads that survive the judging gates in the supplied references.
- Keep duplicate root causes merged.

Begin immediately."

  : > "$LOG_FILE"
  ATTEMPT=1
  while true; do
    echo "  Claude attempt $ATTEMPT: $(date)" | tee -a "$SUMMARY"
    {
      echo "=== Claude attempt $ATTEMPT: $(date) ==="
      (
        cd "$REPO_DIR"
        mkdir -p "$REPO_DIR/.audit/findings"
        unset CLAUDECODE 2>/dev/null || true
        claude -p "$PASHOV_PROMPT" \
          --append-system-prompt "$(cat "$STATIC_SKILL_BUNDLE")

---
$(cat "$CONTEXT_BUNDLE")" \
          --dangerously-skip-permissions \
          --max-turns 100 \
          --output-format stream-json \
          --verbose \
          2>&1
      )
      echo ""
    } >> "$LOG_FILE" 2>&1 || true

    if claude_out_of_credits "$LOG_FILE"; then
      NEXT_CHECK_AT=$(date -v+1H '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date -d '+1 hour' '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date)
      echo "  Claude credits exhausted; retrying $REPO in 1 hour (next check: $NEXT_CHECK_AT)" | tee -a "$SUMMARY"
      echo "=== Claude credits exhausted; sleeping ${HOURLY_POLL_SECONDS}s before retry ===" >> "$LOG_FILE"
      sleep "$HOURLY_POLL_SECONDS"
      ATTEMPT=$((ATTEMPT + 1))
      continue
    fi

    break
  done

  echo "  Finished: $(date)" | tee -a "$SUMMARY"

  if [ -d "$REPO_DIR/.audit/findings" ]; then
    REPORT_COUNT=$(find "$REPO_DIR/.audit/findings" -maxdepth 1 -name "*-claude-pashov-ai-audit-report-*.md" | wc -l | tr -d ' ')
    echo "  Claude Pashov reports: $REPORT_COUNT files" | tee -a "$SUMMARY"
  else
    echo "  No .audit/findings directory created" | tee -a "$SUMMARY"
  fi

  echo "" | tee -a "$SUMMARY"
done

echo "=== All repos complete (Claude): $(date) ===" | tee -a "$SUMMARY"
echo "Previous Claude Pashov reports backed up to: $PREV_DIR" | tee -a "$SUMMARY"
echo "Summary: $SUMMARY"
