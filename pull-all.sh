#!/usr/bin/env bash
# Pulls the latest changes from origin/main for each submodule repo.

set -euo pipefail

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

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

for repo in "${REPOS[@]}"; do
  dir="$ROOT_DIR/$repo"
  if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
    echo "SKIP  $repo — not a git repo"
    continue
  fi
  echo "PULL  $repo"
  git -C "$dir" fetch origin main && git -C "$dir" checkout main && git -C "$dir" pull origin main \
    || echo "FAIL  $repo"
done

echo "Done."
