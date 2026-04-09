# Developer Navigation

## Use This File For

- Use this file when a task spans multiple `-v6` repos, when you need to trace a protocol flow end to end, or when you do not yet know which repo owns the behavior.
- Start here for ecosystem-wide navigation, then jump into the repo-specific `SKILLS.md` that owns the code path.

## Read This Next

| If you need... | Open this next |
|---|---|
| Core protocol payments, cash-outs, rulesets, terminals, permissions, or price feeds | [`nana-core-v6/SKILLS.md`](./nana-core-v6/SKILLS.md) |
| Tiered NFT issuance, reserve mints, voting units, or resolver integration | [`nana-721-hook-v6/SKILLS.md`](./nana-721-hook-v6/SKILLS.md) |
| Buyback routing, TWAP quoting, or mint-vs-swap behavior | [`nana-buyback-hook-v6/SKILLS.md`](./nana-buyback-hook-v6/SKILLS.md) |
| Router-terminal execution or route registry behavior | [`nana-router-terminal-v6/SKILLS.md`](./nana-router-terminal-v6/SKILLS.md) |
| Cross-chain sucker bridging or token mapping behavior | [`nana-suckers-v6/SKILLS.md`](./nana-suckers-v6/SKILLS.md) |
| Revnet deployer, owner, loan, or hidden token logic | [`revnet-core-v6/SKILLS.md`](./revnet-core-v6/SKILLS.md) |
| Croptop, Defifa, or Banny application-layer behavior | [`croptop-core-v6/SKILLS.md`](./croptop-core-v6/SKILLS.md), [`defifa/SKILLS.md`](./defifa/SKILLS.md), [`banny-retail-v6/SKILLS.md`](./banny-retail-v6/SKILLS.md) |
| Utility repos like address registry, permission IDs, ownership helpers, or privacy | [`nana-address-registry-v6/SKILLS.md`](./nana-address-registry-v6/SKILLS.md), [`nana-permission-ids-v6/SKILLS.md`](./nana-permission-ids-v6/SKILLS.md), [`nana-ownable-v6/SKILLS.md`](./nana-ownable-v6/SKILLS.md), [`nana-privacy-v6/SKILLS.md`](./nana-privacy-v6/SKILLS.md) |
| Uniswap V4 hook repos | [`univ4-lp-split-hook-v6/SKILLS.md`](./univ4-lp-split-hook-v6/SKILLS.md), [`univ4-router-v6/SKILLS.md`](./univ4-router-v6/SKILLS.md) |
| Ecosystem deployment orchestration | [`deploy-all-v6/SKILLS.md`](./deploy-all-v6/SKILLS.md), [`nana-fee-project-deployer-v6/SKILLS.md`](./nana-fee-project-deployer-v6/SKILLS.md), [`nana-omnichain-deployers-v6/SKILLS.md`](./nana-omnichain-deployers-v6/SKILLS.md) |

## Ecosystem Map

| Repo | Primary responsibility |
|---|---|
| `nana-core-v6` | Core protocol contracts and shared math/types |
| `nana-721-hook-v6` | Tiered ERC-721 hook stack |
| `nana-buyback-hook-v6` | Buyback data hooks and swap quoting |
| `nana-router-terminal-v6` | Router terminal and route registry |
| `nana-suckers-v6` | Cross-chain suckers and deployers |
| `revnet-core-v6` | Revnet deployer, owner, loans, and hidden tokens |
| `croptop-core-v6` | Croptop publishing and project deployer |
| `defifa` | Defifa game deployer, hook, governor, resolver |
| `banny-retail-v6` | Banny token URI resolver and outfit rendering |
| `nana-omnichain-deployers-v6` | Omnichain deployment wrapper |
| `nana-address-registry-v6` | Address registry for deployed contracts |
| `nana-permission-ids-v6` | Shared permission ID constants |
| `nana-ownable-v6` | Juicebox-aware ownership primitives |
| `nana-privacy-v6` | Stealth-address privacy utilities |
| `nana-fee-project-deployer-v6` | Fee-project deployment script |
| `univ4-lp-split-hook-v6` | V4 LP split hook |
| `univ4-router-v6` | V4 router hook and oracle |
| `deploy-all-v6` | Full ecosystem deployment orchestration |

Fast-access reference for finding anything in the V6 ecosystem. Use this when you need to trace a flow, find a function, debug an error, or understand how contracts interact.

Deployed addresses are repo-specific. Check each repo's `README.md`, deploy scripts, and packaged deployment artifacts instead of assuming a shared broadcast directory.

## Reference Files

| If you need... | Open this next |
|---|---|
| Flow routing, file patterns, common errors, or generic test commands | [`references/ecosystem-flows.md`](./references/ecosystem-flows.md) |
| Shared struct reminders, ecosystem gotchas, permission constants, or library map | [`references/ecosystem-reference.md`](./references/ecosystem-reference.md) |

## Skill File Standard

- Keep repo-local `SKILLS.md` files as short routing documents, usually around 30-50 lines.
- Use the same section order everywhere: `Use This File For`, `Read This Next`, `Repo Map`, `Purpose`, `Reference Files`, `Working Rules`.
- Put dense contract facts, gotchas, and operational detail in repo-local `references/runtime.md` and `references/operations.md` instead of bloating the top-level skill.
- Link only to files that exist now, and describe when to open them. Do not add generic "see also" dumps.
- When a claim is deployment-specific or likely to drift, route the reader to scripts, tests, or artifacts instead of hardcoding the claim in the skill file.

## Working Rules

- Use this file to route into the right repo first. Do not stay here once you know the owning package.
- Prefer repo-local `SKILLS.md` files over workspace-level reference material when making code changes.
- Treat any deployment-specific claim as suspect until you verify it in the relevant repo's scripts or published artifacts.
