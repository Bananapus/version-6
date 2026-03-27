# Feynman Audit — Verified Findings

## Scope
- Language: Solidity 0.8.26
- Modules analyzed: `src/Banny721TokenUriResolver.sol`, `src/interfaces/IBanny721TokenUriResolver.sol`, `script/Deploy.s.sol`, `script/Drop1.s.sol`, `script/Add.Denver.s.sol`, `script/helpers/MigrationHelper.sol`, `script/helpers/BannyverseDeploymentLib.sol`
- Functions analyzed: 75
- Lines interrogated: full in-scope Solidity review

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |

## Function-State Matrix
Focused high-risk entries:

| Function | Reads | Writes | Guards | Calls |
|----------|-------|--------|--------|-------|
| `decorateBannyWith` | body owner, body category, lock, attached background/outfits | `_attachedBackgroundIdOf`, `_userOf`, `_attachedOutfitIdsOf`, `_wearerOf` | body ownership, body category, lock, `nonReentrant` | hook `ownerOf`, hook `safeTransferFrom`, store `tierOfTokenId` |
| `_decorateBannyWithBackground` | previous background, background owner, background user, background tier | `_attachedBackgroundIdOf`, `_userOf` | caller/background ownership rules, lock inheritance | `_tryTransferFrom`, `_transferFrom` |
| `_decorateBannyWithOutfits` | previous outfits, outfit owner, outfit wearer, outfit tiers | `_attachedOutfitIdsOf`, `_wearerOf` | caller/outfit ownership rules, ordering/conflict rules, lock inheritance | `_tryTransferFrom`, `_transferFrom` |
| `lockOutfitChangesFor` | body owner, existing lock | `outfitLockedUntil` | body ownership | hook `ownerOf` |
| `setSvgContentsOf` | `svgHashOf`, `_svgContentOf` | `_svgContentOf` | hash existence/match | none |
| `setSvgHashesOf` | `svgHashOf` | `svgHashOf` | `onlyOwner` | none |

## Guard Consistency Analysis
- Custody-changing paths consistently require body ownership on entry, but return paths do not require successful asset delivery.
- `_transferFrom` is hard-fail for incoming custody, while `_tryTransferFrom` is soft-fail for outgoing custody. That asymmetry is the root cause of the verified issue below.

## Inverse Operation Parity
- Equip path: writes custody state, then requires incoming `safeTransferFrom` to succeed.
- Unequip/replace path: clears or overwrites custody state first, but silently ignores failed outgoing `safeTransferFrom`.
- Result: equip and unequip are not true inverses when the receiver cannot accept ERC-721s or transfers are otherwise blocked.

## Verified Findings (TRUE POSITIVES only)

### Finding FF-001: HIGH — Silent return-transfer failures permanently strand live equipped NFTs in the resolver
**Severity:** HIGH
**Module:** `Banny721TokenUriResolver`
**Function:** `_decorateBannyWithBackground`, `_decorateBannyWithOutfits`, `_tryTransferFrom`
**Lines:** `src/Banny721TokenUriResolver.sol:L1212-L1231`, `src/Banny721TokenUriResolver.sol:L1332-L1392`, `src/Banny721TokenUriResolver.sol:L1424-L1426`
**Verification:** Hybrid — code trace + PoC (`test/audit/TryTransferFromStrandsAssets.t.sol`)

**Feynman Question that exposed this:**
> What breaks if the outgoing `safeTransferFrom` fails after state has already been cleared or overwritten?

**The code:**
```solidity
_attachedBackgroundIdOf[hook][bannyBodyId] = 0;
_tryTransferFrom({hook: hook, from: address(this), to: _msgSender(), assetId: previousBackgroundId});

...

_tryTransferFrom({hook: hook, from: address(this), to: _msgSender(), assetId: previousOutfitId});
...
_attachedOutfitIdsOf[hook][bannyBodyId] = outfitIds;

...

try IERC721(hook).safeTransferFrom({from: from, to: to, tokenId: assetId}) {} catch {}
```

**Why this is wrong:**
The resolver treats a failed outgoing NFT transfer as non-fatal, but it updates the attachment mappings before or regardless of whether the transfer succeeded. If the recipient cannot receive ERC-721s, or any other live transfer failure occurs, the NFT stays owned by the resolver while `userOf`, `wearerOf`, and `assetIdsOf` stop exposing it as attached. From that point onward, authorization also breaks: the caller no longer owns the NFT, and the NFT is no longer considered attached to any body, so there is no path to reclaim it.

**Verification evidence:**
- Code trace:
  - Background path clears `_attachedBackgroundIdOf` before `_tryTransferFrom` at `src/Banny721TokenUriResolver.sol:L1227-L1231`.
  - Outfit path eventually overwrites `_attachedOutfitIdsOf` after best-effort return transfers at `src/Banny721TokenUriResolver.sol:L1372-L1392`.
  - `userOf` and `wearerOf` only acknowledge assets still present in the attachment mappings at `src/Banny721TokenUriResolver.sol:L497-L527`.
  - `_tryTransferFrom` swallows every revert at `src/Banny721TokenUriResolver.sol:L1424-L1426`.
- PoC:
  - `forge test --match-path test/audit/TryTransferFromStrandsAssets.t.sol -vvv`
  - Result: pass
  - Demonstrated sequence: a body owned by a contract that rejects ERC-721 receipts equips a background and outfit, then undresses; both return transfers fail silently; both NFTs remain owned by the resolver; `userOf`, `wearerOf`, and `assetIdsOf` report nothing; subsequent reclaim attempts revert with `UnauthorizedOutfit` / `UnauthorizedBackground`.

**Attack scenario:**
1. A body is owned by a contract account that does not implement `IERC721Receiver`, or a live transfer failure is otherwise induced on outgoing returns.
2. The contract equips a background and/or outfit, transferring them into resolver custody.
3. The body owner later replaces or removes those assets.
4. `_tryTransferFrom` catches the revert, leaving the live NFT inside the resolver.
5. Attachment state is already cleared or overwritten, so the NFT is no longer recoverable through normal decoration flows.

**Impact:**
- Conditional permanent NFT custody loss.
- Breaks the repo’s stated invariant that every equipped NFT held by the resolver is recoverable by the current body owner.
- Affects both outfits and backgrounds, not just burned or removed-tier assets.

**Suggested fix:**
```solidity
// Only clear attachment state after a successful outgoing transfer, and
// distinguish expected terminal cases (burned token / removed tier) from
// recoverable live-transfer failures.
```

## False Positives Eliminated
- None material after verification.

## Downgraded Findings
- None.

## LOW Findings (verified by inspection)
- None worth reporting.

## Summary
- Total functions analyzed: 75
- Raw findings (pre-verification): 0 CRITICAL | 1 HIGH | 0 MEDIUM | 0 LOW
- After verification: 1 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 1 HIGH | 0 MEDIUM | 0 LOW
