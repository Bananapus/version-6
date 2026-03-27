# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed:
  - `src/Banny721TokenUriResolver.sol`
  - `src/interfaces/IBanny721TokenUriResolver.sol`
  - `script/Deploy.s.sol`
  - `script/Drop1.s.sol`
  - `script/Add.Denver.s.sol`
  - `script/helpers/MigrationHelper.sol`
  - `script/helpers/BannyverseDeploymentLib.sol`
- Functions analyzed: 75
- Coupled state pairs mapped: 3
- Mutation paths traced: 8
- Nemesis loop iterations: 4 passes (Feynman full → State full → Feynman targeted → State targeted)

## Nemesis Map (Phase 1 Cross-Reference)

| Function | Writes A | Writes B | A↔B Pair | Sync Status |
|----------|----------|----------|----------|-------------|
| `_decorateBannyWithBackground` | `_attachedBackgroundIdOf` | `_userOf` | background attachment ↔ user | `GAP` when old-background return fails |
| `_decorateBannyWithOutfits` | `_attachedOutfitIdsOf` | `_wearerOf` | outfit attachment ↔ wearer | `GAP` when old-outfit return fails |
| `setSvgHashesOf` | `svgHashOf` | — | svg hash ↔ content | synced by design |
| `setSvgContentsOf` | `_svgContentOf` | validates `svgHashOf` | svg hash ↔ content | synced |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P2→P3 | outfit/background attachment ↔ wearer/user | `decorateBannyWith()` | HIGH | TRUE POSITIVE |

## Verified Findings (TRUE POSITIVES only)

### Finding NM-001: HIGH — Best-effort unequip transfers can permanently strand live NFTs in resolver custody
**Severity:** HIGH
**Source:** Cross-feed P2→P3
**Verification:** Hybrid

**Coupled Pair:** `_attachedOutfitIdsOf` ↔ `_wearerOf`, `_attachedBackgroundIdOf` ↔ `_userOf`
**Invariant:** Every live equipped NFT held by the resolver must remain recoverable by the current owner of the body it is attached to.

**Feynman Question that exposed it:**
> What breaks if the outgoing `safeTransferFrom` reverts after the attachment state has already been cleared or overwritten?

**State Mapper gap that confirmed it:**
> The remove/replace paths update the attachment side of the pair even when the NFT never leaves resolver custody, and the read side (`userOf` / `wearerOf`) then masks the stale relationship because it trusts the cleared attachment side.

**Breaking Operation:** `decorateBannyWith()` at `src/Banny721TokenUriResolver.sol:983`
- Modifies State A:
  - background path writes `_attachedBackgroundIdOf[hook][bannyBodyId]` at `src/Banny721TokenUriResolver.sol:1213` and clears it at `src/Banny721TokenUriResolver.sol:1227`
  - outfit path overwrites `_attachedOutfitIdsOf[hook][bannyBodyId]` at `src/Banny721TokenUriResolver.sol:1392`
- Does NOT ensure State B remains consistent when the return transfer fails:
  - best-effort return calls at `src/Banny721TokenUriResolver.sol:1218`, `src/Banny721TokenUriResolver.sol:1231`, `src/Banny721TokenUriResolver.sol:1338`, `src/Banny721TokenUriResolver.sol:1380`
  - unconditional swallow at `src/Banny721TokenUriResolver.sol:1424-1426`

**Trigger Sequence:**
1. A body owned by a contract that rejects ERC-721 receipts equips a live background and live outfit.
2. The body owner later calls `decorateBannyWith(hook, bodyId, 0, [])` to unequip them.
3. `_tryTransferFrom` catches the outgoing transfer revert for the background/outfit return.
4. The resolver still owns the NFTs, but the body’s attachment state has already been cleared or overwritten.
5. `assetIdsOf`, `userOf`, and `wearerOf` now report nothing.
6. Re-attaching the same live NFTs reverts because the resolver is the owner and the items are no longer considered attached to any body.

**Consequence:**
- Conditional permanent custody loss of live outfits/backgrounds.
- Violates the repo’s stated recoverability invariant.
- Affects both background and outfit return flows.

**Masking Code**:
```solidity
try IERC721(hook).safeTransferFrom({from: from, to: to, tokenId: assetId}) {} catch {}
```

**Verification Evidence:**
- Code trace:
  - `src/Banny721TokenUriResolver.sol:1213-1218`
  - `src/Banny721TokenUriResolver.sol:1227-1231`
  - `src/Banny721TokenUriResolver.sol:1332-1392`
  - `src/Banny721TokenUriResolver.sol:1424-1426`
- PoC:
  - `test/audit/TryTransferFromStrandsAssets.t.sol`
  - Command: `forge test --match-path test/audit/TryTransferFromStrandsAssets.t.sol -vvv`
  - Result: pass
- Regression check:
  - Command: `forge test`
  - Result: full suite passed

**Fix:**
```solidity
// Only clear or overwrite attachment mappings after a successful outgoing transfer,
// or preserve a recoverable attachment record for all live-transfer failures.
```

## Feedback Loop Discoveries
- The issue required both auditors:
  - State pass identified the coupled-pair desync.
  - Feynman re-interrogation explained why the desync becomes permanent only when a live transfer failure, not a burn, is swallowed.

## False Positives Eliminated
- Burned-token and removed-tier paths are intentionally tolerated by `_tryTransferFrom`; those cases do not leave a live NFT trapped in resolver custody.
- No deployment-script finding survived verification.

## Downgraded Findings
- None.

## Summary
- Total functions analyzed: 75
- Coupled state pairs mapped: 3
- Nemesis loop iterations: 4
- Raw findings (pre-verification): 0 C | 1 H | 0 M | 0 L
- Feedback loop discoveries: 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
