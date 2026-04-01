#!/bin/bash
# Nemesis Audit (Codex) — Automated overnight run across all JB V6 repos
# Usage: ./run-nemesis-all-codex.sh
# Logs: .audit-logs/<repo>-codex-nemesis-<timestamp>.log
# Monitor: tail -f .audit-logs/codex-summary-*.log
#
# Safe to run in parallel with run-nemesis-all.sh (Claude).
# Codex writes to codex-nemesis-*.md / codex-feynman-*.md / codex-state-*.md
# so findings never collide with Claude's output.

set -euo pipefail

BASE="/Users/jango/Documents/jb/v6/evm"
LOG_DIR="$BASE/.audit-logs"
mkdir -p "$LOG_DIR"

# All repos in priority order (from NEMESIS_SCOPE.md)
REPOS=(
  "nana-core-v6"
  "univ4-lp-split-hook-v6"
  "revnet-core-v6"
  "nana-router-terminal-v6"
  "nana-721-hook-v6"
  "univ4-router-v6"
  "nana-buyback-hook-v6"
  "nana-suckers-v6"
  "defifa-collection-deployer-v6"
  "croptop-core-v6"
  "banny-retail-v6"
  "nana-omnichain-deployers-v6"
  "nana-ownable-v6"
  "nana-address-registry-v6"
  "nana-permission-ids-v6"
  "nana-fee-project-deployer-v6"
  "deploy-all-v6"
)

# ──────────────────────────────────────────────────────────────────────
# npm package name → repo directory mapping (bash 3.2 compatible)
# ──────────────────────────────────────────────────────────────────────
pkg_to_repo() {
  case "$1" in
    "@bananapus/core-v6")                echo "nana-core-v6" ;;
    "@bananapus/permission-ids-v6")      echo "nana-permission-ids-v6" ;;
    "@bananapus/address-registry-v6")    echo "nana-address-registry-v6" ;;
    "@bananapus/721-hook-v6")            echo "nana-721-hook-v6" ;;
    "@bananapus/ownable-v6")             echo "nana-ownable-v6" ;;
    "@bananapus/buyback-hook-v6")        echo "nana-buyback-hook-v6" ;;
    "@bananapus/router-terminal-v6")     echo "nana-router-terminal-v6" ;;
    "@bananapus/suckers-v6")             echo "nana-suckers-v6" ;;
    "@bananapus/univ4-router-v6")        echo "univ4-router-v6" ;;
    "@bananapus/univ4-lp-split-hook-v6") echo "univ4-lp-split-hook-v6" ;;
    "@bananapus/omnichain-deployers-v6") echo "nana-omnichain-deployers-v6" ;;
    "@rev-net/core-v6")                  echo "revnet-core-v6" ;;
    "@croptop/core-v6")                  echo "croptop-core-v6" ;;
    "@bannynet/core-v6")                 echo "banny-retail-v6" ;;
    "@ballkidz/defifa")                  echo "defifa-collection-deployer-v6" ;;
    "@bananapus/fee-project-deployer-v6") echo "nana-fee-project-deployer-v6" ;;
    *) ;;
  esac
}

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY="$LOG_DIR/codex-summary-$TIMESTAMP.log"

echo "=== Nemesis Audit (Codex) Run: $TIMESTAMP ===" | tee "$SUMMARY"
echo "Repos: ${#REPOS[@]}" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

# ──────────────────────────────────────────────────────────────────────
# STEP 0: Build per-repo docs bundles (own + deps + top-level only)
# ──────────────────────────────────────────────────────────────────────
BUNDLE_DIR="/tmp/codex-nemesis-docs-$TIMESTAMP"
mkdir -p "$BUNDLE_DIR"

# Helper: append a repo's docs to a bundle file
append_repo_docs() {
  local repo="$1"
  local bundle="$2"
  local label="$3"
  local repo_dir="$BASE/$repo"
  local doc="AUDIT_INSTRUCTIONS.md"
  if [ -f "$repo_dir/$doc" ]; then
    echo "---" >> "$bundle"
    echo "## $label: $repo / $doc" >> "$bundle"
    echo "" >> "$bundle"
    cat "$repo_dir/$doc" >> "$bundle"
    echo "" >> "$bundle"
  fi
}

# Resolve deps from package.json → list of repo names
get_dep_repos() {
  local repo="$1"
  local pkg="$BASE/$repo/package.json"
  if [ ! -f "$pkg" ]; then
    return
  fi
  python3 -c "
import json, sys
with open('$pkg') as f:
    p = json.load(f)
deps = p.get('dependencies', {})
pkgs = [k for k in deps if any(k.startswith(x) for x in ['@bananapus/', '@rev-net/', '@croptop/', '@bannynet/', '@ballkidz/'])]
for pkg in pkgs:
    print(pkg)
" 2>/dev/null || true
}

for REPO in "${REPOS[@]}"; do
  BUNDLE="$BUNDLE_DIR/$REPO-docs.md"

  echo "# Audit Context for $REPO" > "$BUNDLE"
  echo "" >> "$BUNDLE"
  echo "Includes: top-level protocol docs, this repo's AUDIT_INSTRUCTIONS, and" >> "$BUNDLE"
  echo "AUDIT_INSTRUCTIONS from direct dependencies (resolved from package.json)." >> "$BUNDLE"
  echo "" >> "$BUNDLE"

  # 1. Top-level docs (protocol-wide)
  for doc in "$BASE/AUDIT.md" "$BASE/AUDIT_INSTRUCTIONS.md"; do
    if [ -f "$doc" ]; then
      echo "---" >> "$BUNDLE"
      echo "## PROTOCOL: $(basename "$doc")" >> "$BUNDLE"
      echo "" >> "$BUNDLE"
      cat "$doc" >> "$BUNDLE"
      echo "" >> "$BUNDLE"
    fi
  done

  # 2. This repo's own docs
  append_repo_docs "$REPO" "$BUNDLE" "THIS REPO"

  # 3. Direct dependency docs (from package.json)
  SEEN_DEPS=""
  while IFS= read -r pkg_name; do
    [ -z "$pkg_name" ] && continue
    dep_repo="$(pkg_to_repo "$pkg_name")"
    if [ -n "$dep_repo" ] && [ "$dep_repo" != "$REPO" ]; then
      # Deduplicate
      case " $SEEN_DEPS " in
        *" $dep_repo "*) ;;
        *)
          SEEN_DEPS="$SEEN_DEPS $dep_repo"
          append_repo_docs "$dep_repo" "$BUNDLE" "DEPENDENCY"
          ;;
      esac
    fi
  done < <(get_dep_repos "$REPO")

  BUNDLE_LINES=$(wc -l < "$BUNDLE" | tr -d ' ')
  BUNDLE_KB=$(echo "scale=1; $(wc -c < "$BUNDLE") / 1024" | bc)
  echo "  $REPO: ${BUNDLE_KB}KB docs ($BUNDLE_LINES lines) [deps:$SEEN_DEPS]" | tee -a "$SUMMARY"
done

echo "" | tee -a "$SUMMARY"

# ──────────────────────────────────────────────────────────────────────
# STEP 1: Clear prior Codex findings (leave Claude findings untouched)
# ──────────────────────────────────────────────────────────────────────
PREV_DIR="$BASE/.audit-findings-codex-prev-$TIMESTAMP"
mkdir -p "$PREV_DIR"
HIDDEN_COUNT=0

for REPO in "${REPOS[@]}"; do
  FINDINGS_DIR="$BASE/$REPO/.audit/findings"
  if [ -d "$FINDINGS_DIR" ]; then
    # Only touch codex-prefixed files
    CODEX_FILES=$(find "$FINDINGS_DIR" -name "codex-*.md" 2>/dev/null)
    if [ -n "$CODEX_FILES" ]; then
      mkdir -p "$PREV_DIR/$REPO"
      cp -a "$FINDINGS_DIR"/codex-*.md "$PREV_DIR/$REPO/" 2>/dev/null || true
      rm -f "$FINDINGS_DIR"/codex-*.md
      HIDDEN_COUNT=$((HIDDEN_COUNT + 1))
    fi
  fi
done

echo "Cleared prior Codex findings from $HIDDEN_COUNT repos → $PREV_DIR" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

# ──────────────────────────────────────────────────────────────────────
# STEP 2: Run nemesis on each repo via Codex
# ──────────────────────────────────────────────────────────────────────
for i in "${!REPOS[@]}"; do
  REPO="${REPOS[$i]}"
  REPO_DIR="$BASE/$REPO"
  LOG_FILE="$LOG_DIR/${REPO}-codex-nemesis-${TIMESTAMP}.log"
  BUNDLE="$BUNDLE_DIR/$REPO-docs.md"

  echo "[$((i+1))/${#REPOS[@]}] Starting: $REPO" | tee -a "$SUMMARY"
  echo "  Log: $LOG_FILE" | tee -a "$SUMMARY"
  echo "  Started: $(date)" | tee -a "$SUMMARY"

  if [ ! -d "$REPO_DIR" ]; then
    echo "  SKIPPED: directory not found" | tee -a "$SUMMARY"
    echo "" | tee -a "$SUMMARY"
    continue
  fi

  SKILLS_DIR="$REPO_DIR/.claude/skills"
  NEMESIS_SKILL="$SKILLS_DIR/nemesis-auditor/SKILL.md"
  FEYNMAN_SKILL="$SKILLS_DIR/feynman-auditor/SKILL.md"
  STATE_SKILL="$SKILLS_DIR/state-inconsistency-auditor/SKILL.md"

  if [ ! -f "$NEMESIS_SKILL" ]; then
    echo "  SKIPPED: nemesis skill not installed" | tee -a "$SUMMARY"
    echo "" | tee -a "$SUMMARY"
    continue
  fi

  # Concatenate all three skills
  COMBINED_SKILLS="$(cat "$NEMESIS_SKILL")"
  [ -f "$FEYNMAN_SKILL" ] && COMBINED_SKILLS="$COMBINED_SKILLS

---
$(cat "$FEYNMAN_SKILL")"
  [ -f "$STATE_SKILL" ] && COMBINED_SKILLS="$COMBINED_SKILLS

---
$(cat "$STATE_SKILL")"

  # Append the per-repo docs bundle
  COMBINED_SKILLS="$COMBINED_SKILLS

---
$(cat "$BUNDLE")"

  # Build the full prompt (skills + instructions in one block for Codex)
  CODEX_PROMPT="You are running a Nemesis security audit. Follow the nemesis-auditor skill instructions below EXACTLY.

SCOPE: Perform ONE integrated audit for THIS REPOSITORY.
Treat the repo as a single system with shared invariants, cross-file coupling, deployment flows, and dependency boundaries.
Review ALL Solidity files in BOTH src/ and script/ directories (recursively) as inputs to that single repo-level audit:
- src/**/*.sol — all contracts, interfaces, structs, enums, libraries, utils
- script/**/*.sol — all deployment and configuration scripts
Do NOT skip deploy scripts. They are in-scope and may contain hardcoded addresses, initialization parameter errors, or deployment ordering bugs.

CRITICAL — EXECUTION UNIT:
Run Nemesis ONCE for the repo, NOT once per file.
Do NOT restart the audit separately for each Solidity file.
Do NOT create per-file audit loops or per-file summaries.
Instead, do one Recon phase for the whole repo, build one shared hit list, then run the iterative passes over the repo's combined attack surface.
Use individual files only as evidence while tracing whole-repo invariants, call graphs, state coupling, and multi-contract attack paths.

CRITICAL — FRESH ROUND:
This is a COMPLETELY FRESH audit round. You have NO prior findings, NO previous context.
Do NOT read or reference any files in .audit/findings/ — that directory may contain findings from a parallel Claude audit run. Ignore them entirely.
Approach every contract as if you are seeing it for the first time.

CRITICAL — DEPENDENCY-AWARE CONTEXT:
The audit context section below includes AUDIT_INSTRUCTIONS.md from this repo AND all its direct dependencies (resolved from package.json), plus the top-level protocol-wide AUDIT.md. Use this to find bugs at dependency boundaries — e.g., assumptions about how a dependency behaves that are actually wrong.

CRITICAL — SKILL LOADING INSTRUCTIONS:
The nemesis skill references '.claude/skills/feynman-auditor/SKILL.md' and '.claude/skills/state-inconsistency-auditor/SKILL.md'. DO NOT attempt to load these files — their FULL content is already included below (separated by ---). When the nemesis skill says to 'Load' or 'Run' the feynman-auditor or state-inconsistency-auditor, just follow the instructions already provided.
Similarly, do NOT invoke /feynman or /state-audit as slash commands — just follow the skill instructions directly.

CRITICAL — OUTPUT FILE NAMING:
Since this audit is running via Codex (in parallel with a Claude audit), you MUST prefix ALL output filenames with 'codex-' to avoid collisions:
- Write raw findings to: .audit/findings/codex-nemesis-raw.md (NOT nemesis-raw.md)
- Write verified findings to: .audit/findings/codex-nemesis-verified.md (NOT nemesis-verified.md)
- Write feynman findings to: .audit/findings/codex-feynman-verified.md (NOT feynman-verified.md)
- Write state findings to: .audit/findings/codex-state-inconsistency-verified.md (NOT state-inconsistency-verified.md)
- Any other output files should also be prefixed with 'codex-'

CRITICAL — OUTPUT SHAPE:
Produce repo-level outputs, not one output section per file.
Consolidate duplicate observations across files into shared root causes, affected paths, and exploit sequences.
Prioritize cross-contract and cross-script interactions when they matter.

Begin the audit now. Start with Phase 0 (Recon) then proceed through all passes until convergence.

=== SKILL INSTRUCTIONS AND AUDIT CONTEXT ===

$COMBINED_SKILLS"

  (
    cd "$REPO_DIR"
    echo "$CODEX_PROMPT" | codex exec \
      -C "$REPO_DIR" \
      --dangerously-bypass-approvals-and-sandbox \
      --json \
      - \
      2>&1
  ) > "$LOG_FILE" 2>&1 || true

  echo "  Finished: $(date)" | tee -a "$SUMMARY"

  # Check if .audit/findings/ has codex output
  if [ -d "$REPO_DIR/.audit/findings" ]; then
    FINDING_COUNT=$(find "$REPO_DIR/.audit/findings" -name "codex-*.md" | wc -l | tr -d ' ')
    echo "  Codex findings: $FINDING_COUNT files" | tee -a "$SUMMARY"
  else
    echo "  No .audit/findings/ directory created" | tee -a "$SUMMARY"
  fi

  echo "" | tee -a "$SUMMARY"
done

echo "=== All repos complete (Codex): $(date) ===" | tee -a "$SUMMARY"
echo "Previous Codex findings backed up to: $PREV_DIR" | tee -a "$SUMMARY"
echo "Summary: $SUMMARY"
