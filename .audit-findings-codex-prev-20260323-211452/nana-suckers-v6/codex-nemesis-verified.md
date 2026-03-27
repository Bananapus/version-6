# N E M E S I S — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: 47 Solidity files in `src/` and `script/`
- Functions analyzed: 198
- Coupled state pairs mapped: 12
- Mutation paths traced: 31
- Nemesis loop iterations: 4 passes total (Feynman full -> State full -> Feynman targeted -> State targeted)

## Nemesis Map (Phase 1 Cross-Reference)
| Function | Coupled Pair / Invariant | Result |
|----|----|----|
| `JBSucker.prepare()` | outbox tree count ↔ outbox balance ↔ contract balance | cleared |
| `JBSucker.claim()` | inbox root ↔ executed bitmap ↔ add-to-balance amount | cleared |
| `JBSucker.exitThroughEmergencyHatch()` | outbox root ↔ emergency bitmap ↔ `numberOfClaimsSent` bound | cleared |
| `JBSucker.toRemote()` | fee extraction ↔ bridge transport budget | **feeds NM-001** |
| `JBArbitrumSucker._toL1()` | downstream bridge path ↔ derived transport budget | **gap** |
| `DeployScript.configureSphinx()` | deployment namespace ↔ helper/artifact namespace | **feeds NM-002** |
| `SuckerDeploymentLib.getDeployment()` | helper lookup namespace ↔ actual deployment namespace | **gap** |

## Verification Summary
| ID | Source | Coupled Pair | Breaking Op | Severity | Verdict |
|----|--------|-------------|-------------|----------|---------|
| NM-001 | Cross-feed P1->P2 | `msg.value` ↔ `transportPayment` | `JBArbitrumSucker._toL1()` | HIGH | TRUE POS |
| NM-002 | Feynman-only | deployment namespace ↔ helper/artifact namespace | `DeployScript.configureSphinx()` / `SuckerDeploymentLib.getDeployment()` | MEDIUM | TRUE POS |

## Verified Findings

### Finding NM-001: Non-zero registry fees permanently disable Arbitrum L2 -> L1 sends
**Severity:** HIGH  
**Source:** Cross-feed P1->P2  
**Verification:** Hybrid

**Coupled Pair:** raw `msg.value` ↔ derived `transportPayment`  
**Invariant:** bridge-specific transport logic must consume the post-fee value derived by `JBSucker.toRemote()`, not the stale external callvalue.

**Feynman Question that exposed it:**
> Why is `_toL1()` checking raw `msg.value` after `toRemote()` already separated fee collection from bridge transport?

**State Mapper gap that confirmed it:**
> `JBSucker.toRemote()` mutates the transport budget (`transportPayment`) but the Arbitrum L2 send path never reads that updated value and instead consults stale raw callvalue.

**Breaking Operation:** `JBArbitrumSucker._toL1()` at `src/JBArbitrumSucker.sol:L180-L186`
- Modifies / depends on State A: bridge send path selected after fee handling
- Does NOT update / honor State B: ignores `transportPayment`, rejects non-zero raw `msg.value`

**Trigger Sequence:**
1. Project leaves are prepared on Arbitrum L2.
2. Registry fee is non-zero (default deployment uses a non-zero fee).
3. User calls `toRemote{value: fee}(token)`.
4. `JBSucker.toRemote()` computes `transportPayment = msg.value - fee`.
5. L2 dispatch reaches `_toL1()`, which re-checks stale raw `msg.value`.
6. `_toL1()` reverts with `JBSucker_UnexpectedMsgValue`, so the root is never sent.

**Consequence:**
- L2->L1 bridging is unavailable whenever the global registry fee is non-zero.
- Prepared funds remain local and normal bridging halts until governance changes the fee or new contracts are deployed.

**Verification Evidence:**
- Code trace:
  - `src/JBSucker.sol:L683-L716`
  - `src/JBArbitrumSucker.sol:L146-L186`
- PoC:
  - `forge test --match-path test/audit/ArbitrumL2ToRemoteFeeDoS.t.sol -vvv`
  - Result: `test_toRemoteRevertsOnArbitrumL2WhenRegistryFeeIsNonZero()` passes.

**Fix:**
```solidity
// Thread the already-derived transportPayment into _toL1 and validate that.
if (transportPayment != 0) revert JBSucker_UnexpectedMsgValue(transportPayment);
```

---

### Finding NM-002: Deployment automation is split between v5 and v6 namespaces
**Severity:** MEDIUM  
**Source:** Feynman-only  
**Verification:** Code trace

**Coupled Pair:** deployment namespace constant ↔ deployment-file / artifact lookup namespace  
**Invariant:** the repo's deploy script, helper library, and package tooling must resolve the same logical deployment project.

**Feynman Question that exposed it:**
> Why does a v6 repo still publish proposals and read deployment JSON from `nana-suckers-v5` while the package artifact task requests `nana-suckers-v6`?

**State Mapper gap that confirmed it:**
> The namespace written by `DeployScript.configureSphinx()` is not the namespace read by `package.json` artifact automation or the helper lookup path.

**Breaking Operation:** deployment metadata resolution in:
- `script/Deploy.s.sol:L53-L57`
- `script/helpers/SuckerDeploymentLib.sol:L50-L91`
- `package.json:L15-L18`

**Trigger Sequence:**
1. Operator deploys from this v6 repo.
2. Sphinx proposal/deployment data is created under `nana-suckers-v5`.
3. Artifact retrieval or helper-based address resolution looks for a different namespace (`v6` in `package.json`, `v5` in helper code).
4. Tooling resolves stale v5 addresses or fails to resolve the new deployment set.

**Consequence:**
- Operators can configure projects against the wrong registry/deployer addresses.
- Peer-sensitive bridge deployments can be misconfigured from stale deployment metadata, risking stuck or misrouted bridge traffic.

**Verification Evidence:**
- `DeployScript.configureSphinx()` hardcodes `nana-suckers-v5`.
- `SuckerDeploymentLib.getDeployment()` reads every JSON artifact from `nana-suckers-v5`.
- `package.json` artifact command requests `nana-suckers-v6`, proving the toolchain is inconsistent inside the same repo.

**Fix:**
```solidity
sphinxConfig.projectName = "nana-suckers-v6";
```
and update all helper lookups to the same namespace.

## Feedback Loop Discoveries
- `NM-001` only became high-confidence after the state pass reframed the issue as a stale derived-value coupling:
  - Feynman pass flagged the suspicious ordering/value flow in `toRemote()`.
  - State pass confirmed the exact gap: the updated bridge budget (`transportPayment`) is never consumed on the Arbitrum L2 branch.

## False Positives Eliminated
- `fromRemote()` accepting nonce gaps:
  - append-only trees make earlier leaves provable against later roots; no verified fund-loss path.
- Emergency-exit bitmap slot collision:
  - no practical path to collide with a real token address and bypass replay protection.
- CCIP amount validation skip:
  - not independently exploitable from this codebase without assuming a compromised CCIP router.

## Summary
- Total functions analyzed: 198
- Coupled state pairs mapped: 12
- Nemesis loop iterations: 4 passes
- Raw findings (pre-verification): 0 CRITICAL | 1 HIGH | 1 MEDIUM | 0 LOW
- Feedback loop discoveries: 1
- After verification: 2 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 0 CRITICAL | 1 HIGH | 1 MEDIUM | 0 LOW
