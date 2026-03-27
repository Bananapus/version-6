# N E M E S I S — Raw Findings

## Scope
- Files in scope:
  - `src/Banny721TokenUriResolver.sol`
  - `src/interfaces/IBanny721TokenUriResolver.sol`
  - `script/Deploy.s.sol`
  - `script/Drop1.s.sol`
  - `script/Add.Denver.s.sol`
  - `script/helpers/MigrationHelper.sol`
  - `script/helpers/BannyverseDeploymentLib.sol`
- Files intentionally ignored during analysis: `.audit/findings/*`

## Phase 0 — Nemesis Recon

**Language:** Solidity

**Attack Goals**
1. Permanently strand equipped NFTs inside the resolver.
2. Reassign or steal outfits/backgrounds without owning the item or the body wearing it.
3. Break attachment-state invariants so metadata and custody diverge.
4. Misdeploy the resolver/hook stack with bad initialization or chain-specific parameters.

**Novel Code**
- `src/Banny721TokenUriResolver.sol` — custom custody + SVG composition + lock logic.
- `script/Deploy.s.sol` — custom multi-protocol deployment composition (resolver + revnet + hook + suckers).

**Value Stores + Initial Coupling Hypothesis**
- Resolver-held NFTs
  - Outflows: `_tryTransferFrom`, `_transferFrom`, `decorateBannyWith`
  - Suspected coupled state:
    - `_attachedOutfitIdsOf` ↔ `_wearerOf`
    - `_attachedBackgroundIdOf` ↔ `_userOf`
- SVG storage
  - Outflows: token metadata reads
  - Suspected coupled state:
    - `svgHashOf` ↔ `_svgContentOf`

**Complex Paths**
- `decorateBannyWith` → `_decorateBannyWithBackground` + `_decorateBannyWithOutfits` with merge-style diffing and external ERC-721 transfers.
- `Deploy.s.sol::deploy()` composing deterministic resolver deployment with revnet + 721 hook deployment.

**Priority Order**
1. `decorateBannyWith` and its background/outfit helpers.
2. Outgoing custody return paths using `_tryTransferFrom`.
3. Deployment/configuration scripts.

## Phase 1 — Unified Nemesis Map

| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| `_decorateBannyWithBackground` | `_attachedBackgroundIdOf` | `_userOf` | background attachment ↔ user | Gap if outgoing transfer fails |
| `_decorateBannyWithOutfits` | `_attachedOutfitIdsOf` | `_wearerOf` | outfit attachment ↔ wearer | Gap if outgoing transfer fails |
| `setSvgHashesOf` | `svgHashOf` | — | svg hash ↔ content | Synced by later `setSvgContentsOf` |
| `setSvgContentsOf` | `_svgContentOf` | validates `svgHashOf` | svg hash ↔ content | Synced |

## Pass 1 — Feynman (Full)

### Primary Suspects
1. `_tryTransferFrom` swallows every transfer failure.
2. Background state is cleared/overwritten before old background return is known to have succeeded.
3. Outfit attachment array is overwritten after best-effort returns, regardless of whether the assets actually left resolver custody.

### Raw Feynman Finding
- `FF-RAW-001`
  - Severity: HIGH
  - Title: Silent outgoing transfer failures may leave live NFTs stranded after attachment state is cleared
  - Touched state:
    - `_attachedBackgroundIdOf`, `_userOf`
    - `_attachedOutfitIdsOf`, `_wearerOf`

## Pass 2 — State Inconsistency (Full)

### New Gaps
1. `_attachedBackgroundIdOf` can be cleared while the old background remains owned by the resolver.
2. `_attachedOutfitIdsOf` can be overwritten while removed outfits remain owned by the resolver.
3. `userOf` / `wearerOf` then lazily mask the stale mapping because they rely on the cleared attachment side.

### Mutation Matrix Delta
- Background remove/replace path: writes attachment side first, then performs best-effort outgoing transfer.
- Outfit remove/replace path: performs best-effort outgoing transfers, then overwrites array side even when the outgoing transfer failed.

## Pass 3 — Feynman Re-interrogation

### Root Cause
- The code assumes failed outgoing transfers only happen for dead assets (burned / removed-tier), but `_tryTransferFrom` also swallows live transfer failures such as a recipient contract rejecting ERC-721 receipts.

### Consequence
- Once the outgoing transfer revert is swallowed, the live NFT is still in resolver custody but no longer authorized for recovery because the “attached” side was already cleared.

## Pass 4 — State Re-analysis

### Confirmed Coupled-Pair Failure
- The same root cause breaks both coupled pairs:
  - `_attachedBackgroundIdOf` ↔ `_userOf`
  - `_attachedOutfitIdsOf` ↔ `_wearerOf`

## Convergence
- No additional verified findings surfaced in scripts or SVG storage after the fourth pass.

## Raw Findings Summary
| ID | Source | Severity | Status |
|----|--------|----------|--------|
| FF-RAW-001 / SI-RAW-001 | Feynman + State cross-feed | HIGH | Verified true positive |

## Verification Notes
- PoC added: `test/audit/TryTransferFromStrandsAssets.t.sol`
- PoC result: pass
- Full regression suite result: `forge test` passed
