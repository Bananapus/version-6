# Administration

## At A Glance

| Item | Details |
| --- | --- |
| Scope | Monorepo-level coordination of the Juicebox V6 EVM control plane across 19 active protocol repos in this workspace |
| Control posture | Documentation and repo-index layer only; runtime authority lives in the subrepos and is assigned by `deploy-all-v6` |
| Highest-risk actions | Publishing stale repo links, summarizing authority incorrectly, or treating monorepo state as if it were an onchain source of truth |
| Recovery posture | Monorepo mistakes are corrected with doc and git updates; contract-level mistakes must be handled from the repo that owns the contracts |

## Purpose

This file is the umbrella index for protocol administration across the workspace. It does not define runtime permissions by itself. Its job is to tell readers where authority actually lives, how authority is layered across the stack, and which repo-level `ADMINISTRATION.md` to open next for exact call surfaces, invariants, and recovery posture.

## Control Model

- The top-level repo has no deployable contracts of its own.
- Runtime authority is implemented in the subrepos, not in this file.
- Deployment-time authority assignment is centralized in `deploy-all-v6`.
- Protocol-wide owner roles are typically assigned to the Sphinx safe or another deployment-selected address.
- Project-local authority usually runs through project NFT ownership plus delegated `JBPermissions`.
- Some repos are intentionally adminless and should not be documented as if they had governance or owner paths.

## Authority Layers

Read the stack in this order:

1. `deploy-all-v6` for who receives power at deployment time.
2. `nana-core-v6` for the base protocol control plane: directory, controller, terminals, prices, permissions, and feeless switches.
3. Registry-style repos for global allowlists and defaults:
   `nana-buyback-hook-v6`, `nana-router-terminal-v6`, `nana-suckers-v6`.
4. Project-local extension repos for per-project or per-hook authority:
   `nana-721-hook-v6`, `nana-omnichain-deployers-v6`, `univ4-lp-split-hook-v6`, `croptop-core-v6`, `revnet-core-v6`, `banny-retail-v6`, `defifa`.
5. Adminless or primitive repos for boundaries and source-level assumptions:
   `nana-address-registry-v6`, `project-handles-v6`, `univ4-router-v6`, `nana-permission-ids-v6`, `nana-ownable-v6`, `nana-distributor-v6`.

## Repo Index

The repos currently present in this workspace and carrying protocol administration context are:

| Repo | Role In The Control Plane | Primary Authority Shape | Detail Doc |
| --- | --- | --- | --- |
| `deploy-all-v6` | Deployment-time owner and default wiring | Deployment operator -> protocol owner targets | [deploy-all-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/ADMINISTRATION.md) |
| `nana-core-v6` | Core protocol authority | Protocol owner, project owner, delegated operator, controller, terminal | [nana-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-core-v6/ADMINISTRATION.md) |
| `nana-buyback-hook-v6` | Global hook allowlist plus project-local buyback config | Registry owner plus project-local delegates | [nana-buyback-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/ADMINISTRATION.md) |
| `nana-router-terminal-v6` | Global router terminal allowlist and defaults | Registry owner plus project-local delegates | [nana-router-terminal-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/ADMINISTRATION.md) |
| `nana-suckers-v6` | Sucker deployer registry and bridge safety controls | Registry owner, project owner, deployer configurator | [nana-suckers-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/ADMINISTRATION.md) |
| `nana-721-hook-v6` | Per-hook NFT-tier administration | Hook owner or project owner plus delegated permissions | [nana-721-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/ADMINISTRATION.md) |
| `nana-omnichain-deployers-v6` | Omnichain launch and runtime wrapper config | Mixed deployer and project-local authority | [nana-omnichain-deployers-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/ADMINISTRATION.md) |
| `univ4-lp-split-hook-v6` | Per-project LP split hook lifecycle | Project owner or `SET_BUYBACK_POOL` delegate | [univ4-lp-split-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/ADMINISTRATION.md) |
| `revnet-core-v6` | Mostly immutable revnet economics with narrow runtime operator | Split operator plus cosmetic global owner on `REVLoans` | [revnet-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/ADMINISTRATION.md) |
| `croptop-core-v6` | Publish-policy control and irreversible project sink option | Mixed deployer and project-local authority | [croptop-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/ADMINISTRATION.md) |
| `banny-retail-v6` | Collection metadata and outfit-state control | Global owner plus per-body owner | [banny-retail-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/ADMINISTRATION.md) |
| `defifa` | Permissionless game launch plus collective scoring governance | Protocol contracts plus NFT-holder attestation | [defifa/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/defifa/ADMINISTRATION.md) |
| `nana-fee-project-deployer-v6` | Fee-project deployment assumptions | Deployment-only | [nana-fee-project-deployer-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/ADMINISTRATION.md) |
| `nana-ownable-v6` | Ownership-resolution primitive used elsewhere | Primitive only; authority depends on inheritor | [nana-ownable-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-ownable-v6/ADMINISTRATION.md) |
| `nana-permission-ids-v6` | Shared permission namespace | Source-level coordination only | [nana-permission-ids-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-permission-ids-v6/ADMINISTRATION.md) |
| `nana-address-registry-v6` | Provenance registry | Adminless and permissionless | [nana-address-registry-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-address-registry-v6/ADMINISTRATION.md) |
| `project-handles-v6` | Offchain trust-bound handle registry | Adminless and permissionless | [project-handles-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/project-handles-v6/ADMINISTRATION.md) |
| `nana-distributor-v6` | Permissionless vesting/distribution primitive | Adminless except caller validation on certain paths | [nana-distributor-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/ADMINISTRATION.md) |
| `univ4-router-v6` | Uniswap V4 hook with fixed post-deploy behavior | Adminless after deployment | [univ4-router-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/ADMINISTRATION.md) |

## Protocol-Wide Control Surfaces

At the protocol level, the most important owner-assigned surfaces are:

| Surface | Typical Controlling Role | Where To Verify |
| --- | --- | --- |
| Core controller and terminal routing | Protocol owner and project-local authority | `nana-core-v6` |
| Price-feed installation | Protocol owner or project-scoped feed path | `nana-core-v6` |
| Feeless-address configuration | Protocol owner | `nana-core-v6` |
| Default buyback hook and hook allowlist | Registry owner | `nana-buyback-hook-v6` |
| Default router terminal and terminal allowlist | Registry owner | `nana-router-terminal-v6` |
| Approved sucker deployers and remote fee config | Registry owner | `nana-suckers-v6` |
| Sucker deployer singleton and chain constants | Deployer configurator | `nana-suckers-v6` |
| Revnet split-operator assignment and runtime boundaries | Split operator per revnet | `revnet-core-v6` |

Do not treat this table as sufficient authority proof. It is only a navigation aid; exact function-level power lives in the linked repo docs.

## Operational Notes

- Update this file whenever the active repo inventory changes or when a repo materially changes its control posture.
- Keep the top-level labels short and factual; repo-level docs should hold the function tables and recovery detail.
- If `deploy-all-v6` changes constructor owners, defaults, or operator assignment assumptions, re-read and update the affected repo summaries here.
- Prefer linking to repo-level truth over duplicating detailed authority matrices at the top level.

## Machine Notes

- Do not guess authority from repo names alone. Open the linked repo `ADMINISTRATION.md` before documenting or executing admin actions.
- Do not infer that a repo has an owner path just because it is part of the protocol; several repos here are intentionally adminless.
- Treat `deploy-all-v6/ADMINISTRATION.md` as the source of truth for who initially receives protocol-level authority.
- If the workspace repo inventory and this file diverge, trust the workspace and update this file before using it as a crawler index.
- If a top-level summary and a repo-level doc disagree, trust the repo-level doc and then repair the top-level summary.

## Recovery

- If this file has stale links or stale repo descriptions, fix the doc and re-publish the corrected navigation layer.
- If a subrepo changed its admin model, recover by updating that repo doc first and then this umbrella index.
- If the issue is onchain or deployment-specific, do not improvise from this file; jump to the owning repo’s `ADMINISTRATION.md`.

## Admin Boundaries

- This file does not grant, revoke, or execute any onchain authority.
- It cannot recover bad deployments, unlock contracts, or override subrepo-level admin rules.
- It must not be treated as a replacement for repo-level runbooks, tests, or deployment scripts.
- It should not contain stale repos, renamed repos, or links to directories that are not present in the workspace.

## Source Map

- `ADMINISTRATION.md`
- `ARCHITECTURE.md`
- `RISKS.md`
- `SKILLS.md`
- `USER_JOURNEYS.md`
- `deploy-all-v6/ADMINISTRATION.md`
- `nana-core-v6/ADMINISTRATION.md`
- `nana-buyback-hook-v6/ADMINISTRATION.md`
- `nana-router-terminal-v6/ADMINISTRATION.md`
- `nana-suckers-v6/ADMINISTRATION.md`
- `revnet-core-v6/ADMINISTRATION.md`
- `defifa/ADMINISTRATION.md`
