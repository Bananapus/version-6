# N E M E S I S — Raw Findings

## Scope
- Language: Solidity 0.8.26
- Files reviewed: 47 Solidity files under `src/` and `script/`
- Functions/constructors reviewed: 198
- Fresh round: no `.audit/findings/*` inputs were read

## Phase 0 Recon

### Attack Goals
1. Mint bridged project tokens without matching backing assets.
2. Double-claim or double-spend a merkle leaf across chains or emergency exit paths.
3. Brick a bridge direction so prepared funds become stuck or operations become unavailable.
4. Misdeploy or misconfigure peers/deployers so cross-chain messages point at stale or wrong contracts.

### Novel / High-Bug-Density Areas
- `src/JBSucker.sol`: custom merkle inbox/outbox accounting, emergency exit, fee handling, deprecation lifecycle.
- `src/JBArbitrumSucker.sol`: non-atomic two-ticket transport and layer-dependent bridge logic.
- `src/JBCCIPSucker.sol`: CCIP router receive/send flow and wrapped-native handling.
- `script/Deploy.s.sol` and `script/helpers/SuckerDeploymentLib.sol`: hardcoded project/deployment namespace logic.

### Value Stores / Initial Coupling Hypotheses
- `JBSucker._outboxOf[token]`
  - Outflows: `_sendRoot`, `exitThroughEmergencyHatch`
  - Coupled state: contract token/native balance, `numberOfClaimsSent`, `tree.count`, `nonce`
- `JBSucker._inboxOf[token]`
  - Outflows: `claim`
  - Coupled state: `_executedFor[token]`, authenticated remote root ordering
- `JBSucker._remoteTokenFor[token]`
  - Outflows: `prepare`, `toRemote`, `mapToken(s)`, emergency hatch
  - Coupled state: `enabled`, `emergencyHatch`, `addr`, `minGas`
- `JBSuckerRegistry.toRemoteFee`
  - Outflows: `JBSucker.toRemote`
  - Coupled state: bridge-specific transport expectations

## Phase 1 Nemesis Map (condensed)

| Function | Writes | Coupled Counterpart | Status |
|---|---|---|---|
| `JBSucker.prepare` | `_outboxOf[token].tree`, `_outboxOf[token].balance` | contract balance, mapping enabled flag | synced |
| `JBSucker.toRemote` | fee payment side effect, `_sendRoot` path | `transportPayment`, bridge-specific fee expectations | suspect |
| `JBSucker._sendRoot` | `outbox.balance=0`, `outbox.nonce++`, `numberOfClaimsSent=count` | actual bridge transfer, AMB message | synced by design |
| `JBArbitrumSucker._sendRootOverAMB` | consumes `transportPayment` | `_toL1` / `_toL2` payment checks | gap on L2 |
| `JBArbitrumSucker._toL1` | reads raw `msg.value` | post-fee `transportPayment` | gap |
| `DeployScript.configureSphinx` | deployment namespace | package scripts / helper lookup namespace | suspect |
| `SuckerDeploymentLib.getDeployment` | deployment file path selection | Sphinx project name / artifact namespace | gap |

## Raw Findings

### NM-RAW-001
- Severity: HIGH
- Title: Arbitrum L2 `toRemote()` reverts whenever the global registry fee is non-zero
- Affected code:
  - `src/JBSucker.sol:L683-L716`
  - `src/JBArbitrumSucker.sol:L146-L186`
- Hypothesis:
  - `JBSucker.toRemote()` derives `transportPayment = msg.value - toRemoteFee`, but the Arbitrum L2 path ignores that derived value and re-checks raw `msg.value` inside `_toL1`.
  - Any non-zero `toRemoteFee` therefore causes `_toL1` to revert with `JBSucker_UnexpectedMsgValue`, blocking all L2->L1 sends.

### NM-RAW-002
- Severity: MEDIUM
- Title: Deployment tooling still targets the v5 Sphinx/deployment namespace inside the v6 repo
- Affected code:
  - `script/Deploy.s.sol:L53-L57`
  - `script/helpers/SuckerDeploymentLib.sol:L50-L91`
  - `package.json:L15-L18`
- Hypothesis:
  - The deploy script proposes under `nana-suckers-v5`, helper lookups read `nana-suckers-v5`, but package artifact retrieval uses `nana-suckers-v6`.
  - This can resolve stale or missing deployment metadata and point operators at the wrong registry/deployer set.

## Raw Suspects Eliminated During Verification Queueing
- `fromRemote()` nonce-gap acceptance:
  - append-only merkle roots make skipped roots provable against later roots; not a local auth or double-claim bug.
- Emergency-exit bitmap slot collision:
  - requires a practical preimage collision against a 160-bit truncated keccak-derived slot; not realistically reachable.
- CCIP delivered-amount skip:
  - not independently exploitable from this codebase without assuming CCIP itself violates delivery guarantees.

## Verification Queue
- `NM-RAW-001`: Hybrid verification with dedicated Foundry PoC.
- `NM-RAW-002`: Deep code trace across deploy script, helper library, and package scripts.
