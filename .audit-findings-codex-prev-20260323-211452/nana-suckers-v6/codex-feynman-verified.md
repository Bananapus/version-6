# Feynman Audit — Verified Findings

## Scope
- Language: Solidity
- Modules analyzed: 47 Solidity files in `src/` and `script/`
- Functions analyzed: 198
- Lines interrogated: focused full-pass on all entrypoints, deep-pass on bridge transport and deployment scripts

## Verification Summary
| ID | Original Severity | Verdict | Final Severity |
|----|-------------------|---------|----------------|
| FF-001 | HIGH | TRUE POSITIVE | HIGH |
| FF-002 | MEDIUM | TRUE POSITIVE | MEDIUM |

## Verified Findings

### Finding FF-001: Arbitrum L2 fee handling bricks `toRemote()`
**Severity:** HIGH  
**Module:** `JBArbitrumSucker` / `JBSucker`  
**Function:** `toRemote()` -> `_sendRootOverAMB()` -> `_toL1()`  
**Lines:** `src/JBSucker.sol:L683-L716`, `src/JBArbitrumSucker.sol:L146-L186`  
**Verification:** Hybrid — code trace + PoC (`test/audit/ArbitrumL2ToRemoteFeeDoS.t.sol`)

**Feynman Question that exposed this:**
> Why does the L2 bridge path re-read raw `msg.value` after `toRemote()` already derived and passed a bridge-specific `transportPayment`?

**Why this is wrong:**
`JBSucker.toRemote()` always starts from the caller's raw `msg.value`, peels off `REGISTRY.toRemoteFee()`, and forwards only the remainder as `transportPayment`. That is the value each bridge implementation is supposed to reason about.  
The Arbitrum L2 path does not use that derived value. `_sendRootOverAMB()` dispatches into `_toL1()`, and `_toL1()` rejects any non-zero raw `msg.value`. Because internal calls preserve the original callvalue, a non-zero registry fee means `_toL1()` always sees `msg.value > 0` and reverts before sending the message.

**Verification evidence:**
- Code trace:
  - `JBSucker.toRemote()` computes `transportPayment = msg.value - _toRemoteFee` and calls `_sendRoot(...)`.
  - `JBArbitrumSucker._sendRootOverAMB()` passes control to `_toL1(...)` on L2 without forwarding `transportPayment`.
  - `JBArbitrumSucker._toL1()` reverts on `if (msg.value != 0)`.
- PoC:
  - `forge test --match-path test/audit/ArbitrumL2ToRemoteFeeDoS.t.sol -vvv`
  - Result: `test_toRemoteRevertsOnArbitrumL2WhenRegistryFeeIsNonZero()` passes by proving the revert path with `JBSucker_UnexpectedMsgValue(1)`.

**Attack / trigger scenario:**
1. The registry owner sets `toRemoteFee > 0` (default deployment does this).
2. A user prepares a bridge leaf on Arbitrum L2.
3. The user calls `toRemote{value: fee}(...)`.
4. `toRemote()` deducts the fee conceptually, but `_toL1()` still sees the original non-zero callvalue and reverts.
5. All L2->L1 bridge sends are unavailable until the global fee is reset to zero or code is upgraded/redeployed.

**Impact:**
- Permanent functional DoS for one bridge direction under a normal fee configuration.
- Prepared leaves remain unsent, pushing users into deprecation/emergency-hatch recovery instead of normal bridging.

**Suggested fix:**
Use `transportPayment`, not raw `msg.value`, in the Arbitrum L2 path. `_toL1()` should either:
- take `transportPayment` explicitly and require it to be zero, or
- rely solely on the already-validated caller-facing logic in `toRemote()`.

### Finding FF-002: v6 deployment automation still points at the v5 namespace
**Severity:** MEDIUM  
**Module:** `Deploy.s.sol`, `SuckerDeploymentLib.sol`, package scripts  
**Function:** deployment/artifact resolution  
**Lines:** `script/Deploy.s.sol:L53-L57`, `script/helpers/SuckerDeploymentLib.sol:L50-L91`, `package.json:L15-L18`  
**Verification:** Code trace

**Feynman Question that exposed this:**
> Why is a v6 repository still proposing deployments and reading deployment files from the `nana-suckers-v5` namespace?

**Why this is wrong:**
The repo package metadata and artifact script are v6, but the actual deploy script and helper library are hardcoded to v5. That splits the deployment toolchain into two different namespaces:
- proposals are submitted under `nana-suckers-v5`,
- helper lookups read JSON from `nana-suckers-v5/...`,
- artifact retrieval asks Sphinx for `nana-suckers-v6`.

That mismatch means automation can read stale v5 addresses, fail to find fresh v6 deployments, or publish/fetch artifacts from different logical projects.

**Verification evidence:**
- `script/Deploy.s.sol` sets `sphinxConfig.projectName = "nana-suckers-v5"`.
- `script/helpers/SuckerDeploymentLib.sol` resolves registry/deployer JSON files under `projectName: "nana-suckers-v5"`.
- `package.json` defines `npm run artifacts` with `--project-name 'nana-suckers-v6'`.

**Trigger scenario:**
1. Operators deploy from this v6 repo using `npm run deploy:*`.
2. Sphinx proposal/deployment metadata is recorded under the v5 namespace.
3. Later automation or scripts fetch artifacts under v6, or helper code reads v5 JSON files.
4. Operators resolve missing or stale addresses and can configure or integrate against the wrong contract set.

**Impact:**
- Misdeployment / stale-address risk in an in-scope deployment path.
- Subsequent registry/deployer usage can point at outdated contracts, which is especially dangerous for peer-sensitive bridge deployments.

**Suggested fix:**
Rename all hardcoded deployment namespaces in the v6 repo to `nana-suckers-v6`, and keep `package.json`, `Deploy.s.sol`, and `SuckerDeploymentLib.sol` consistent.

## False Positives Eliminated
- Non-sequential inbox nonce acceptance is intentional and safe under append-only merkle roots.
- Emergency-exit bitmap key separation does not present a practical collision path.

## Summary
- Total functions analyzed: 198
- Raw findings (pre-verification): 1 HIGH | 1 MEDIUM
- After verification: 2 TRUE POSITIVE | 0 FALSE POSITIVE | 0 DOWNGRADED
- Final: 1 HIGH | 1 MEDIUM
