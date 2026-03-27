# State Inconsistency Audit — Verified Findings

## Coupled State Dependency Map

| Coupled Pair | Invariant | Primary Mutation Points |
|-------------|-----------|-------------------------|
| `_attachedOutfitIdsOf[hook][body]` ↔ `_wearerOf[hook][outfit]` | Every equipped outfit held by the resolver must still resolve to the wearing body, and every tracked worn outfit must remain in the attachment array | `decorateBannyWith`, `_decorateBannyWithOutfits` |
| `_attachedBackgroundIdOf[hook][body]` ↔ `_userOf[hook][background]` | Every equipped background held by the resolver must still resolve to the using body, and vice versa | `decorateBannyWith`, `_decorateBannyWithBackground` |
| `svgHashOf[upc]` ↔ `_svgContentOf[upc]` | Stored SVG content must match the committed hash and remain immutable once set | `setSvgHashesOf`, `setSvgContentsOf` |

## Mutation Matrix

| State Variable | Mutating Function | Updates Coupled State? |
|---------------|-------------------|------------------------|
| `_attachedBackgroundIdOf` | `_decorateBannyWithBackground` | Partially — clears/overwrites attachment before confirming outgoing transfer |
| `_userOf` | `_decorateBannyWithBackground` | Partially — new background updated, previous background left stale/lazily ignored |
| `_attachedOutfitIdsOf` | `_decorateBannyWithOutfits` | Partially — overwritten even if outgoing transfer fails |
| `_wearerOf` | `_decorateBannyWithOutfits` | Partially — new outfits updated, removed outfits left stale/lazily ignored |

## Parallel Path Comparison

| Coupled State | Incoming Equip Path | Outgoing Replace/Unequip Path |
|---------------|---------------------|-------------------------------|
| Background attachment ↔ user mapping | Hard-fails if incoming transfer fails | Soft-fails if outgoing transfer fails |
| Outfit attachment ↔ wearer mapping | Hard-fails if incoming transfer fails | Soft-fails if outgoing transfer fails |

## Verification Summary
| ID | Coupled Pair | Breaking Op | Original Severity | Verdict | Final Severity |
|----|-------------|-------------|-------------------|---------|----------------|
| SI-001 | `_attachedOutfitIdsOf/_wearerOf`, `_attachedBackgroundIdOf/_userOf` | `decorateBannyWith()` | HIGH | TRUE POSITIVE | HIGH |

## Verified Findings

### Finding SI-001: HIGH — Failed best-effort returns desynchronize custody mappings from real NFT ownership and strand live assets
**Severity:** HIGH
**Verification:** Hybrid — code trace + PoC

**Coupled Pair:** `_attachedOutfitIdsOf[hook][body]` ↔ `_wearerOf[hook][outfit]`, `_attachedBackgroundIdOf[hook][body]` ↔ `_userOf[hook][background]`
**Invariant:** Any live NFT held by the resolver because it is equipped must remain recoverable through the body it is attached to.

**Breaking Operation:** `decorateBannyWith()` in `src/Banny721TokenUriResolver.sol`
- Modifies attachment state: `src/Banny721TokenUriResolver.sol:L1213-L1214`, `src/Banny721TokenUriResolver.sol:L1227`, `src/Banny721TokenUriResolver.sol:L1355`, `src/Banny721TokenUriResolver.sol:L1392`
- Does not require successful coupled-state reconciliation on outgoing transfers: `src/Banny721TokenUriResolver.sol:L1218`, `src/Banny721TokenUriResolver.sol:L1231`, `src/Banny721TokenUriResolver.sol:L1338`, `src/Banny721TokenUriResolver.sol:L1380`, `src/Banny721TokenUriResolver.sol:L1424-L1426`

**Trigger Sequence:**
1. A body owner that cannot receive ERC-721s equips a background and/or outfit.
2. The body owner calls `decorateBannyWith(..., 0, [])` or replaces the assets.
3. `_tryTransferFrom` catches the outgoing transfer revert.
4. The resolver keeps owning the NFT, but the body’s attachment state has already been cleared or overwritten.
5. Subsequent reads treat the asset as unattached, and subsequent writes reject it as unauthorized because the resolver itself is now the owner.

**Consequence:**
- The NFT is live and still owned by the resolver.
- `assetIdsOf`, `wearerOf`, and `userOf` stop exposing the relationship.
- The current body owner cannot reclaim the asset, so custody is permanently lost unless a bespoke rescue mechanism is added.

**Masking Code:**
```solidity
try IERC721(hook).safeTransferFrom({from: from, to: to, tokenId: assetId}) {} catch {}
```

**Fix:**
```solidity
// Defer clearing attachment mappings until the outgoing transfer succeeds, or
// explicitly preserve a recoverable attachment record for all non-burn failures.
```

## False Positives Eliminated
- Lazy reconciliation of stale `_userOf` / `_wearerOf` entries is harmless when the asset is actually gone (burned / removed-tier path).
- The verified issue only remains when the asset is still live and still owned by the resolver.

## Summary
- Coupled state pairs mapped: 3
- Mutation paths analyzed: 8
- Raw findings (pre-verification): 1
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE
- Final: 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
