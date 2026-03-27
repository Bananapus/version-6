#!/bin/bash
set -e

ROOT=$(pwd)
BRANCH="chore/solc-0.8.28"
REPOS=(
  banny-retail-v6
  croptop-core-v6
  defifa-collection-deployer-v6
  deploy-all-v6
  nana-721-hook-v6
  nana-address-registry-v6
  nana-buyback-hook-v6
  nana-core-v6
  nana-fee-project-deployer-v6
  nana-omnichain-deployers-v6
  nana-ownable-v6
  nana-permission-ids-v6
  nana-router-terminal-v6
  nana-suckers-v6
  revnet-core-v6
  univ4-lp-split-hook-v6
  univ4-router-v6
)

for repo in "${REPOS[@]}"; do
  echo ""
  echo "=========================================="
  echo "Processing: $repo"
  echo "=========================================="
  cd "$ROOT/$repo"

  DEFAULT_BRANCH="main"
  echo "Default branch: $DEFAULT_BRANCH"

  # Checkout default branch and pull
  git checkout "$DEFAULT_BRANCH" 2>/dev/null
  git pull origin "$DEFAULT_BRANCH" 2>/dev/null

  # Create new branch
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH" 2>/dev/null

  # 1. Update foundry.toml
  if [ -f "foundry.toml" ]; then
    sed -i '' "s/solc = '0.8.26'/solc = '0.8.28'/" foundry.toml
    echo "  Updated foundry.toml"
  fi

  # 2. Update exact pragma solidity 0.8.26 -> 0.8.28 in all .sol files
  find . -name "*.sol" -not -path "*/lib/*" -not -path "*/node_modules/*" -not -path "*/out/*" -not -path "*/cache/*" -type f | while read f; do
    sed -i '' 's/pragma solidity 0\.8\.26;/pragma solidity 0.8.28;/g' "$f"
    sed -i '' 's/pragma solidity \^0\.8\.26;/pragma solidity ^0.8.28;/g' "$f"
  done
  echo "  Updated pragma versions"

  # 3. Bump npm version (patch)
  if [ -f "package.json" ]; then
    npm version patch --no-git-tag-version 2>/dev/null
    NEW_VERSION=$(node -p "require('./package.json').version")
    echo "  npm version bumped to $NEW_VERSION"
  fi

  echo "  Done with changes for $repo"
done

echo ""
echo "=========================================="
echo "All changes applied. Now building each repo..."
echo "=========================================="

FAILED_BUILDS=""
for repo in "${REPOS[@]}"; do
  echo ""
  echo "--- Building: $repo ---"
  cd "$ROOT/$repo"
  if forge build 2>&1; then
    echo "  BUILD SUCCESS: $repo"
  else
    echo "  BUILD FAILED: $repo"
    FAILED_BUILDS="$FAILED_BUILDS $repo"
  fi
done

if [ -n "$FAILED_BUILDS" ]; then
  echo ""
  echo "FAILED BUILDS:$FAILED_BUILDS"
  echo "Fix these before committing."
  exit 1
fi

echo ""
echo "=========================================="
echo "All builds passed! Committing and pushing..."
echo "=========================================="

for repo in "${REPOS[@]}"; do
  echo ""
  echo "--- Committing: $repo ---"
  cd "$ROOT/$repo"

  DEFAULT_BRANCH="main"

  git add -A
  git commit -m "$(cat <<'EOF'
chore: bump solc to 0.8.28

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

  git push -u origin "$BRANCH"

  # Create PR
  gh pr create \
    --title "chore: bump solc to 0.8.28" \
    --body "$(cat <<'EOF'
## Summary
- Bump Solidity compiler version from 0.8.26 to 0.8.28
- Update `foundry.toml`, all `pragma solidity` statements, and npm package version

## Test plan
- [x] `forge build` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
    --base "$DEFAULT_BRANCH"

  echo "  PR created for $repo"
done

echo ""
echo "=========================================="
echo "ALL DONE!"
echo "=========================================="
