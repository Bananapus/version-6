# V6 EVM Ecosystem

## Use This File For

- Use this file when you do not yet know which repo owns a behavior.
- Start here when a flow crosses repos or when a bug report is written in product terms instead of contract terms.
- Leave this file once you know the owning repo.

## Read This Next

| If the task is about... | Open this next |
|---|---|
| Payments, cash outs, terminals, rulesets, splits, permissions, fund access limits, or price feeds | [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md) |
| Tiered NFT minting, reserve mints, voting units, tier pricing, or 721 hook deployers | [`nana-721-hook-v6/SKILLS.md`](./nana-721-hook-v6/SKILLS.md) |
| Mint-vs-swap routing, buyback pools, TWAP windows, or buyback hook registry behavior | [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md) |
| Multi-hop token routing, router-terminal previews, callback guards, or project-specific router overrides | [`nana-router-terminal-v6/SKILLS.md`](./nana-router-terminal-v6/SKILLS.md) |
| ERC-20 voter rewards, 721 holder rewards, vesting rounds, or split-hook-funded distributions | [`nana-distributor-v6/SKILLS.md`](./nana-distributor-v6/SKILLS.md) |
| Cross-chain token bridging, token mapping, Merkle roots, or chain-specific transport logic | [`nana-suckers-v6/SKILLS.md`](./nana-suckers-v6/SKILLS.md) |
| Revnet deployment, staged issuance, ownerless runtime hooks, hidden tokens, or loans | [`revnet-core-v6/SKILLS.md`](./revnet-core-v6/SKILLS.md) |
| Omnichain project launch wrappers or deploying suckers together with 721 hooks | [`nana-omnichain-deployers-v6/SKILLS.md`](./nana-omnichain-deployers-v6/SKILLS.md) |
| Full ecosystem deployment, resume flows, verification, or cross-package orchestration failures | [`deploy-all-v6/SKILLS.md`](./deploy-all-v6/SKILLS.md), [`nana-fee-project-deployer-v6/SKILLS.md`](./nana-fee-project-deployer-v6/SKILLS.md) |
| V4 LP accumulation, burn-and-manage lifecycle, fee claims, or rebalancing | [`univ4-lp-split-hook-v6/SKILLS.md`](./univ4-lp-split-hook-v6/SKILLS.md) |
| V4 swap routing, observation history, or router-hook deployment flags | [`univ4-router-v6/SKILLS.md`](./univ4-router-v6/SKILLS.md) |
| App-layer publishing, game, resolver, or NFT presentation behavior | [`croptop-core-v6/SKILLS.md`](./croptop-core-v6/SKILLS.md), [`defifa/SKILLS.md`](./defifa/SKILLS.md), [`banny-retail-v6/SKILLS.md`](./banny-retail-v6/SKILLS.md) |
| Ownership helpers, address provenance, ENS handles, or canonical permission constants | [`nana-ownable-v6/SKILLS.md`](./nana-ownable-v6/SKILLS.md), [`nana-address-registry-v6/SKILLS.md`](./nana-address-registry-v6/SKILLS.md), [`project-handles-v6/SKILLS.md`](./project-handles-v6/SKILLS.md), [`nana-permission-ids-v6/SKILLS.md`](./nana-permission-ids-v6/SKILLS.md) |

## How To Triage

1. Start from the first state change that could explain the bug, not the last user-visible symptom.
2. Decide whether the behavior is core protocol logic, an extension, a deployment wrapper, or app-layer product logic.
3. Check whether the repo owns runtime truth or only launch-time setup.
4. Open the owning repo's `SKILLS.md`, then the exact source file or test for that transition.

Useful defaults:

- If payment or cash-out math looks wrong, start in [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md).
- If routing looks wrong but settlement looks normal, start in [`nana-router-terminal-v6/SKILLS.md`](./nana-router-terminal-v6/SKILLS.md) or [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md).
- If deployment shape is wrong on chain, start in [`deploy-all-v6/SKILLS.md`](./deploy-all-v6/SKILLS.md) or the relevant deployer repo.
- If the user-facing problem is in an app or NFT experience, start in the product repo before changing shared protocol code.
- If the bug crosses chains, start in [`nana-suckers-v6/SKILLS.md`](./nana-suckers-v6/SKILLS.md).

## Debug By Symptom

| If someone reports... | Check here first | Then verify against |
|---|---|---|
| “Payment succeeded but minting, weight, hooks, or fees look wrong” | [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md) | [`nana-721-hook-v6/SKILLS.md`](./nana-721-hook-v6/SKILLS.md), [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md) |
| “Cash out amount is weird” | [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md) | [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md), [`nana-router-terminal-v6/SKILLS.md`](./nana-router-terminal-v6/SKILLS.md), [`revnet-core-v6/SKILLS.md`](./revnet-core-v6/SKILLS.md) |
| “NFT minting or voting units look wrong” | [`nana-721-hook-v6/SKILLS.md`](./nana-721-hook-v6/SKILLS.md) | [`croptop-core-v6/SKILLS.md`](./croptop-core-v6/SKILLS.md), [`defifa/SKILLS.md`](./defifa/SKILLS.md), [`banny-retail-v6/SKILLS.md`](./banny-retail-v6/SKILLS.md) |
| “A swap route or quote is wrong” | [`nana-router-terminal-v6/SKILLS.md`](./nana-router-terminal-v6/SKILLS.md) if terminal-driven | [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md) for mint-vs-swap or cash-out-vs-swap, [`univ4-router-v6/SKILLS.md`](./univ4-router-v6/SKILLS.md) for V4 observation quality |
| “Cross-chain balances or claims are wrong” | [`nana-suckers-v6/SKILLS.md`](./nana-suckers-v6/SKILLS.md) | [`nana-omnichain-deployers-v6/SKILLS.md`](./nana-omnichain-deployers-v6/SKILLS.md), [`revnet-core-v6/SKILLS.md`](./revnet-core-v6/SKILLS.md) |
| “A deployment worked in one repo but the ecosystem is broken” | [`deploy-all-v6/SKILLS.md`](./deploy-all-v6/SKILLS.md) | repo-local deployment scripts |
| “A permission exists but still doesn’t work” | [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md) | [`nana-permission-ids-v6/SKILLS.md`](./nana-permission-ids-v6/SKILLS.md), [`nana-ownable-v6/SKILLS.md`](./nana-ownable-v6/SKILLS.md) |
| “A contract is registered, so it must be trusted” | [`nana-address-registry-v6/SKILLS.md`](./nana-address-registry-v6/SKILLS.md) | the runtime repo that owns the code |

## Common Misdiagnoses

- A payment or cash-out bug is blamed on a hook even though the wrong value was already computed in `nana-core-v6`.
- A routing bug is blamed on `nana-core-v6` even though the wrong path was chosen in `nana-router-terminal-v6` or `nana-buyback-hook-v6`.
- A V4 oracle-quality issue is blamed on the buyback hook even though the observation history lives in `univ4-router-v6`.
- A bridge bug is blamed on `nana-suckers-v6` when the real problem is wrapper-created launch config in `nana-omnichain-deployers-v6` or `revnet-core-v6`.
- A deployment-orchestration failure is debugged inside a runtime repo before anyone proves the deployed addresses and salts were correct.
- A permission-name question is treated like a permission-enforcement question. `nana-permission-ids-v6` names constants; it does not enforce them.
- A provenance record is treated like a security review. `nana-address-registry-v6` proves who deployed, not whether the code is safe.
- An app-layer bug is patched in shared protocol code even though the logic lives in `croptop-core-v6`, `defifa`, or `banny-retail-v6`.

## Ecosystem Map

| Layer | Repos | What they own |
|---|---|---|
| Protocol core | `nana-core-v6` | Shared state transitions: payments, cash outs, payouts, rulesets, tokens, permissions, directory, prices |
| Core extensions | `nana-721-hook-v6`, `nana-buyback-hook-v6`, `nana-router-terminal-v6`, `nana-distributor-v6`, `nana-suckers-v6` | Specialized runtime behavior built on core entrypoints |
| Protocol products | `revnet-core-v6`, `croptop-core-v6`, `defifa`, `banny-retail-v6` | Opinionated systems built from the core and extension stack |
| Deployment wrappers | `nana-omnichain-deployers-v6`, `nana-fee-project-deployer-v6`, `deploy-all-v6` | Launch-time composition, orchestration, resume flows, and deployment shape |
| Shared utilities | `nana-ownable-v6`, `nana-address-registry-v6`, `project-handles-v6`, `nana-permission-ids-v6` | Ownership, provenance, handles, and canonical constants |
| Uniswap V4 integration | `univ4-lp-split-hook-v6`, `univ4-router-v6` | V4 LP management, hook-aware swap routing, and oracle state |

## Repo Boundaries

- `nana-core-v6` owns base payment, cash-out, payout, and permission semantics.
- `nana-721-hook-v6`, `nana-buyback-hook-v6`, and `nana-router-terminal-v6` all touch pay or cash-out flows, but they do not own the same job. Separate NFT issuance, market routing, and terminal routing before editing.
- `nana-buyback-hook-v6` decides whether market execution beats protocol-native execution. `univ4-router-v6` owns V4 observation history and hook-side quote quality.
- `nana-suckers-v6` owns bridge accounting and message validation. Launch wrappers may instantiate it, but they do not replace its runtime guarantees.
- `revnet-core-v6`, `nana-suckers-v6`, and `nana-omnichain-deployers-v6` can all touch the same user-visible bug. Separate revnet economics, bridge runtime, and launch wrapper behavior before patching.
- `deploy-all-v6` usually owns orchestration failures, not business logic.
- `nana-address-registry-v6` proves deployer provenance, not code safety.
- `nana-permission-ids-v6` names permissions. Enforcement lives elsewhere.
- Product repos can look like core bugs from the outside. Verify whether the problem is product logic before editing shared code.

## Reference Files

| If you need... | Open this next |
|---|---|
| Flow routing from user symptom to owning contracts, common errors, or test commands | [`references/ecosystem-flows.md`](./references/ecosystem-flows.md) |
| Shared structs, gotchas, permission constants, and library reminders across repos | [`references/ecosystem-reference.md`](./references/ecosystem-reference.md) |

## Purpose

This is the workspace router for the Juicebox V6 EVM repos. Use it to find the right repo fast, avoid cross-repo misdiagnosis, and move into repo-local docs as soon as ownership is clear.

## Working Rules

- Use this file to find ownership, then switch to the repo-local `SKILLS.md`.
- Prefer repo-local docs and references once you know the owning package.
- Treat deployment-specific claims as unstable until current scripts or tests confirm them.
- When a bug crosses repos, find the first contract that mutates state incorrectly.
- Use this file for “where does this live?” questions, not for detailed implementation work.
- Keep this file generic and stable. Push repo-specific details down into repo-local docs.
