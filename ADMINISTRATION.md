# Administration

## At A Glance

| Item | Details |
| --- | --- |
| Scope | Workspace-level coordination of the Juicebox V6 EVM control plane across the repos in this workspace |
| Control posture | Documentation and repo-index layer only; runtime authority lives in subrepos and is assigned during deployment |
| Highest-risk actions | Stale repo links, wrong authority summaries, or treating workspace docs as onchain truth |
| Recovery posture | Fix docs here for navigation mistakes; fix runtime authority in the repo that owns the contracts |

## Purpose

This file is the top-level index for protocol administration across the workspace. It does not define runtime permissions by itself. Its job is to show where authority actually lives, how it is layered, and which repo-level `ADMINISTRATION.md` to open next.

## Control Model

- The top-level repo has no deployable contracts of its own.
- Runtime authority is implemented in the subrepos, not in this file.
- Deployment-time authority assignment is centralized in `deploy-all-v6`.
- Protocol-wide owner roles usually go to the Sphinx safe or another deployment-selected address.
- Project-local authority usually runs through project NFT ownership plus delegated `JBPermissions`.
- Some repos are intentionally adminless and should not be documented as if they had governance paths.

## Authority Layers

Read the stack in this order:

1. `deploy-all-v6` for who receives power at deployment time.
2. `nana-core-v6` for the base control plane: directory, controller, terminals, prices, permissions, and feeless switches.
3. Registry-style repos for global allowlists, default routes, and defaults:
   `nana-buyback-hook-v6`, `nana-router-terminal-v6`, `nana-suckers-v6`.
4. Project-local extension repos for per-project or per-hook authority:
   `nana-721-hook-v6`, `nana-omnichain-deployers-v6`, `univ4-lp-split-hook-v6`, `croptop-core-v6`, `revnet-core-v6`, `banny-retail-v6`, `defifa`.
5. Adminless or primitive repos for boundaries and source-level assumptions:
   `nana-address-registry-v6`, `nana-project-handles-v6`, `univ4-router-v6`, `nana-permission-ids-v6`, `nana-ownable-v6`, `nana-distributor-v6`.

## Repo Index

| Repo | Role In The Control Plane | Primary Authority Shape | Detail Doc |
| --- | --- | --- | --- |
| `deploy-all-v6` | Deployment-time owner and default wiring | Deployment operator -> protocol owner targets | [deploy-all-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/deploy-all-v6/ADMINISTRATION.md) |
| `nana-core-v6` | Core protocol authority | Protocol owner, project owner, delegated operator, controller, terminal | [nana-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-core-v6/ADMINISTRATION.md) |
| `nana-buyback-hook-v6` | Global hook allowlist plus project-local buyback config | Registry owner plus project-local delegates | [nana-buyback-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-buyback-hook-v6/ADMINISTRATION.md) |
| `nana-router-terminal-v6` | Global router terminal allowlist and defaults | Registry owner plus project-local delegates | [nana-router-terminal-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-router-terminal-v6/ADMINISTRATION.md) |
| `nana-suckers-v6` | Sucker deployer registry, bridge safety controls, and route-scoped token mapping approvals | Registry owner, project owner, deployer configurator | [nana-suckers-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-suckers-v6/ADMINISTRATION.md) |
| `nana-721-hook-v6` | Per-hook NFT-tier administration | Hook owner or project owner plus delegated permissions | [nana-721-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-721-hook-v6/ADMINISTRATION.md) |
| `nana-omnichain-deployers-v6` | Omnichain launch and runtime wrapper config | Mixed deployer and project-local authority | [nana-omnichain-deployers-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-omnichain-deployers-v6/ADMINISTRATION.md) |
| `univ4-lp-split-hook-v6` | Per-project LP split-hook lifecycle | Project owner or `SET_BUYBACK_POOL` delegate | [univ4-lp-split-hook-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/univ4-lp-split-hook-v6/ADMINISTRATION.md) |
| `revnet-core-v6` | Mostly immutable revnet economics with narrow runtime operator paths | Split operator plus cosmetic global owner on `REVLoans` | [revnet-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/revnet-core-v6/ADMINISTRATION.md) |
| `croptop-core-v6` | Publish-policy control and irreversible project sink option | Mixed deployer and project-local authority | [croptop-core-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/croptop-core-v6/ADMINISTRATION.md) |
| `banny-retail-v6` | Collection metadata and outfit-state control | Global owner plus per-body owner | [banny-retail-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/banny-retail-v6/ADMINISTRATION.md) |
| `defifa` | Permissionless game launch plus collective scoring governance | Protocol contracts plus NFT-holder attestation | [defifa/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/defifa/ADMINISTRATION.md) |
| `nana-fee-project-deployer-v6` | Fee-project deployment assumptions | Deployment-only | [nana-fee-project-deployer-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-fee-project-deployer-v6/ADMINISTRATION.md) |
| `nana-ownable-v6` | Ownership-resolution primitive used elsewhere | Primitive only; authority depends on inheritor | [nana-ownable-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-ownable-v6/ADMINISTRATION.md) |
| `nana-permission-ids-v6` | Shared permission namespace | Source-level coordination only | [nana-permission-ids-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-permission-ids-v6/ADMINISTRATION.md) |
| `nana-address-registry-v6` | Provenance registry | Adminless and permissionless | [nana-address-registry-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-address-registry-v6/ADMINISTRATION.md) |
| `nana-project-handles-v6` | Offchain trust-bound handle registry | Adminless and permissionless | [nana-project-handles-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-project-handles-v6/ADMINISTRATION.md) |
| `nana-distributor-v6` | Permissionless vesting and distribution primitive | Adminless except caller validation on some paths | [nana-distributor-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/nana-distributor-v6/ADMINISTRATION.md) |
| `univ4-router-v6` | Uniswap V4 hook with fixed post-deploy behavior | Adminless after deployment | [univ4-router-v6/ADMINISTRATION.md](/Users/jango/Documents/jb/v6/evm/univ4-router-v6/ADMINISTRATION.md) |

## Protocol-Wide Control Surfaces

| Surface | Typical Controlling Role | Where To Verify |
| --- | --- | --- |
| Core controller and terminal routing | Protocol owner and project-local authority | `nana-core-v6` |
| Price-feed installation | Protocol owner or project-scoped feed path | `nana-core-v6` |
| Feeless-address configuration | Protocol owner | `nana-core-v6` |
| Default buyback hook and hook allowlist | Registry owner | `nana-buyback-hook-v6` |
| Default router terminal and terminal allowlist | Registry owner | `nana-router-terminal-v6` |
| Approved sucker deployers and remote fee config | Registry owner | `nana-suckers-v6` |
| Sucker token mapping approvals for native/native and different-address local/remote pairs | Registry owner, keyed by local token, remote chain ID, and remote token | `nana-suckers-v6` |
| Sucker deployer singleton and chain constants | Deployer configurator | `nana-suckers-v6` |
| Revnet split-operator assignment and runtime boundaries | Split operator per revnet | `revnet-core-v6` |

This table is a guide, not proof. Exact function-level power lives in the linked repo docs.

## Operational Notes

- Update this file when the active repo list changes or when a repo changes its control posture.
- Keep the top-level labels short and factual. Repo-level docs should hold the detailed authority tables.
- If `deploy-all-v6` changes constructor owners, defaults, or operator assumptions, re-read the affected repo docs and then update this file.
- Prefer linking to repo-level truth instead of duplicating detailed matrices here.

## Machine Notes

- Do not guess authority from repo names alone. Open the linked repo `ADMINISTRATION.md`.
- Do not assume every repo has an owner path. Several repos are intentionally adminless.
- Treat `deploy-all-v6/ADMINISTRATION.md` as the source of truth for who first receives protocol-level authority.
- If the workspace repo list and this file differ, trust the workspace and update this file.
- If a top-level summary and a repo-level doc disagree, trust the repo-level doc and then repair the summary here.

## Recovery

- If this file has stale links or stale repo descriptions, fix the docs here.
- If a subrepo changed its admin model, update that repo doc first and then this index.
- If the issue is onchain or deployment-specific, do not improvise from this file. Jump to the owning repo's `ADMINISTRATION.md`.

## Admin Boundaries

- This file does not grant, revoke, or execute onchain authority.
- It cannot recover bad deployments, unlock contracts, or override repo-level admin rules.
- It is not a replacement for repo-level runbooks, tests, or deployment scripts.
- It should not point at stale repos or missing directories.
