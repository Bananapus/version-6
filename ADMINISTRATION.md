# Administration

Admin privileges and coordination across the Juicebox V6 EVM monorepo.

## Overview

This repo is a coordination layer for the Juicebox V6 EVM ecosystem. It contains 17 submodule repos and top-level documentation (architecture, style guide, audit instructions). It has no runtime contracts of its own.

For contract-level admin documentation, see each subrepo's ADMINISTRATION.md:

| Subrepo | Admin Surface | ADMINISTRATION.md |
|---------|--------------|-------------------|
| nana-core-v6 | Protocol core: permissions, projects, directory, rulesets, terminals, tokens, prices, splits, fund access limits | [Link](nana-core-v6/ADMINISTRATION.md) |
| nana-721-hook-v6 | NFT tiers, minting, metadata, discount percents | [Link](nana-721-hook-v6/ADMINISTRATION.md) |
| nana-suckers-v6 | Cross-chain bridging, token mapping, deprecation, emergency hatch | [Link](nana-suckers-v6/ADMINISTRATION.md) |
| revnet-core-v6 | Autonomous revnets, split operators, loans | [Link](revnet-core-v6/ADMINISTRATION.md) |
| nana-buyback-hook-v6 | Buyback hook registry, pool configuration, TWAP | [Link](nana-buyback-hook-v6/ADMINISTRATION.md) |
| nana-omnichain-deployers-v6 | Omnichain project deployment, data hook proxy | [Link](nana-omnichain-deployers-v6/ADMINISTRATION.md) |
| nana-router-terminal-v6 | Router terminal registry, swap routing | [Link](nana-router-terminal-v6/ADMINISTRATION.md) |
| nana-ownable-v6 | JBOwnable bridge pattern | [Link](nana-ownable-v6/ADMINISTRATION.md) |
| nana-permission-ids-v6 | Permission ID reference (no admin surface) | [Link](nana-permission-ids-v6/ADMINISTRATION.md) |
| nana-address-registry-v6 | Address registration (no admin surface) | [Link](nana-address-registry-v6/ADMINISTRATION.md) |
| nana-fee-project-deployer-v6 | Fee project (project #1) deployment | [Link](nana-fee-project-deployer-v6/ADMINISTRATION.md) |
| croptop-core-v6 | Croptop publishing, posting criteria | [Link](croptop-core-v6/ADMINISTRATION.md) |
| deploy-all-v6 | Canonical deployment script | [Link](deploy-all-v6/ADMINISTRATION.md) |
| banny-retail-v6 | Banny NFT metadata, outfit custodial model | [Link](banny-retail-v6/ADMINISTRATION.md) |
| defifa-collection-deployer-v6 | Defifa game lifecycle, scorecard governance | [Link](defifa-collection-deployer-v6/ADMINISTRATION.md) |
| univ4-lp-split-hook-v6 | LP split hook, pool deployment, fee routing | [Link](univ4-lp-split-hook-v6/ADMINISTRATION.md) |
| univ4-router-v6 | V4 oracle hook (no admin surface) | [Link](univ4-router-v6/ADMINISTRATION.md) |

## Protocol-Level Admin Powers

After deployment, protocol-level admin powers are held by the **Sphinx Safe multisig** (the deployer identity from deploy-all-v6). These powers are:

| Power | Contract | Reversible? |
|-------|----------|-------------|
| Approve new controllers | JBDirectory | Yes (bool flag: can add and remove) |
| Add default price feeds | JBPrices | No (immutable once set) |
| Mark addresses as fee-exempt | JBFeelessAddresses | Yes |
| Approve sucker deployers | JBSuckerRegistry | Yes |
| Set default buyback hook | JBBuybackHookRegistry | Yes |
| Set default router terminal | JBRouterTerminalRegistry | Yes |
| Set loan token URI resolver | REVLoans | Yes (setTokenUriResolver) |
| Configure sucker deployer chain constants | Sucker deployers | No (one-time setChainSpecificConstants) |
| Configure sucker deployer singletons | Sucker deployers | No (one-time configureSingleton) |

### Split Operators

Each revnet has a dedicated **split operator** (a hardcoded multisig address, not the Sphinx Safe). Split operator powers are limited to redistributing reserved token splits, configuring buyback/swap parameters, and updating metadata -- see revnet-core-v6's ADMINISTRATION.md for the full constraint set.

| Project | ID | Split Operator |
|---------|---:|----------------|
| NANA (fee project) | 1 | `0x80a8F7a4bD75b539CE26937016Df607fdC9ABeb5` |
| CPN | 2 | `0x240dc2085caEF779F428dcd103CFD2fB510EdE82` |
| REV | 3 | `0x6b92c73682f0e1fac35A18ab17efa5e77DDE9fE1` |
| BAN | 4 | `0x9E2a10aB3BD22831f19d02C648Bc2Cb49B127450` |

## Submodule Management

Submodules point to specific commits of each subrepo. Updating a submodule changes which version of a contract is included in the monorepo's documentation and audit scope.

- **Who can update submodules:** Anyone with push access to this repo (the monorepo).
- **What it affects:** Only documentation and audit scope. Submodule pointers do not affect deployed contracts.
- **Deployed contract addresses** are determined by deploy-all-v6's deployment script, not by submodule pointers.

## Monorepo-Level Files

| File | Owner | Purpose |
|------|-------|---------|
| README.md | Maintainers | Monorepo overview and links |
| ARCHITECTURE.md | Maintainers | Protocol architecture overview |
| ADMINISTRATION.md | Maintainers | Admin privileges and coordination (this file) |
| STYLE_GUIDE.md | Maintainers | Solidity style conventions |
| AUDIT_INSTRUCTIONS.md | Maintainers | Instructions for auditors |
| ENG_AUDIT.md | Maintainers | Engineering audit findings |
| RISKS.md | Maintainers | Known risks and mitigations |
| SKILLS.md | Maintainers | Contract API reference and gotchas |
| USER_JOURNEYS.md | Maintainers | End-to-end user flow walkthroughs |
| CHANGE_LOG.md | Maintainers | Protocol change history |
| CLAUDE.md | Maintainers | AI assistant instructions |

These files have no on-chain effect. They are informational and can be updated by anyone with push access.
