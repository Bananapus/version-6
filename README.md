# Juicebox V6

Programmable treasuries for Ethereum. Projects collect funds, issue tokens on bonding curves, govern economics through rulesets, and compose features through hooks — all onchain, all composable, across any EVM chain.

This is the complete V6 smart contract ecosystem: 18 repositories spanning core protocol, hooks, cross-chain bridging, deployers, applications, and CLI tooling. Clone recursively to get everything:

```bash
git clone --recursive https://github.com/Bananapus/version-6.git
```

## Orientation

| I want to... | Go here |
|-------------|---------|
| Understand the protocol | [DOC.md](./DOC.md) |
| See how contracts connect | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Review security properties | [SECURITY.md](./SECURITY.md) |
| Navigate the codebase fast | [SKILLS.md](./SKILLS.md) |
| Audit / try to break it | [AUDIT_INSTRUCTIONS.md](./AUDIT_INSTRUCTIONS.md) |
| Follow our coding style | [STYLE_GUIDE.md](./STYLE_GUIDE.md) |

## Repositories

### Core Protocol

| Repo | What it does |
|------|-------------|
| [nana-core-v6](./nana-core-v6) | The protocol. Terminals accept funds, Controllers mint tokens, the Store does bookkeeping, Rulesets govern economics, Permissions gate access. ~10,700 lines of battle-tested Solidity. |
| [nana-permission-ids-v6](./nana-permission-ids-v6) | Permission constants — ROOT through SET_SUCKER_DEPRECATION (IDs 1-32). |

### Hooks

Hooks plug into the core at well-defined extension points. Data hooks override economics. Pay/cashout hooks execute after settlement. Split hooks process payout distributions.

| Repo | What it does |
|------|-------------|
| [nana-721-hook-v6](./nana-721-hook-v6) | Tiered NFTs — mint on payment, burn to cash out. Per-tier pricing, supply caps, reserve frequency, discount rates. |
| [nana-buyback-hook-v6](./nana-buyback-hook-v6) | Data hook that compares minting vs buying from Uniswap V4, takes whichever gives more tokens. TWAP oracle with sigmoid slippage. |
| [univ4-lp-split-hook-v6](./univ4-lp-split-hook-v6) | Split hook that accumulates reserved tokens and deploys them into UniV4 full-range liquidity pools. |
| [univ4-router-v6](./univ4-router-v6) | Uniswap V4 hook with custom swap logic and oracle tracking for buyback integration. |

### Terminals

| Repo | What it does |
|------|-------------|
| [nana-router-terminal-v6](./nana-router-terminal-v6) | Pay any project with any token. Routes through UniV3/V4 to the project's accepted currency. |

### Cross-Chain

| Repo | What it does |
|------|-------------|
| [nana-suckers-v6](./nana-suckers-v6) | Bridge project tokens across chains via merkle trees. Implementations for Optimism, Base, Arbitrum, and Chainlink CCIP. |
| [nana-omnichain-deployers-v6](./nana-omnichain-deployers-v6) | Deploy a project to multiple chains in one transaction. Wires up suckers, controllers, and terminals across chains. |

### Deployers

| Repo | What it does |
|------|-------------|
| [revnet-core-v6](./revnet-core-v6) | Autonomous revenue networks. Staged economics with predetermined issuance decay, buyback hooks, cross-chain bridging, and token-collateralized loans (REVLoans). |
| [croptop-core-v6](./croptop-core-v6) | Decentralized NFT publishing. Anyone can post content as NFT tiers on any Croptop project. |
| [nana-fee-project-deployer-v6](./nana-fee-project-deployer-v6) | Deploys project #1 — the protocol's fee recipient. |

### Applications

| Repo | What it does |
|------|-------------|
| [banny-retail-v6](./banny-retail-v6) | Banny NFT store. Equippable outfits on dynamic SVG characters, backed by a revnet treasury. |
| [defifa-collection-deployer-v6](./defifa-collection-deployer-v6) | Prediction games. Players buy tiered NFTs representing outcomes, a governance scorecard distributes the prize pool. |

### Utilities

| Repo | What it does |
|------|-------------|
| [nana-ownable-v6](./nana-ownable-v6) | Ownership that works with both EOAs and Juicebox project NFTs. |
| [nana-address-registry-v6](./nana-address-registry-v6) | Maps deployed contracts to their deployers via CREATE2. |

### CLI

| Repo | What it does |
|------|-------------|
| [nana-cli-v6](./nana-cli-v6) | CLI for people and AI agents. 31 Forge scripts covering all protocol operations, with shell CLI, MCP server, and Claude Code skill surfaces. |

### Deployment

| Repo | What it does |
|------|-------------|
| [deploy-all-v6](./deploy-all-v6) | Single Foundry script that deploys the entire ecosystem (~1,600 lines). Sphinx orchestration across 8 chains. |

## Building

Each repo uses [Foundry](https://getfoundry.sh). Repos reference each other as sibling directories via `file:` dependencies in `package.json`.

```bash
# Clone everything
git clone --recursive https://github.com/Bananapus/version-6.git
cd version-6

# Build and test a repo
cd nana-core-v6
npm install
forge build
forge test
```

## Key Numbers

| Constant | Value | Notes |
|----------|-------|-------|
| Fee | 2.5% | On payouts, surplus withdrawals, and taxed cashouts |
| Fee hold | 28 days | Held fees returned if project adds to balance |
| Fee beneficiary | Project #1 | The NANA revnet |
| Max cash out tax | 10,000 | 100% in basis points |
| Max reserved percent | 10,000 | 100% in basis points |
| Max weight cut | 1,000,000,000 | 9 decimal precision |
| Splits total | 1,000,000,000 | 9 decimal precision |
| Token decimals | 18 | Enforced across all project tokens |
| Loan liquidation | 3,650 days | 10 years |
| Solidity version | 0.8.26 | All contracts |

## External Dependencies

- [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts) — ERC standards, SafeERC20, ERC2771, access control
- [PRBMath](https://github.com/PaulRBerg/prb-math) — Fixed-point mulDiv arithmetic
- [Uniswap V3/V4](https://github.com/Uniswap) — DEX integration for buyback and routing hooks
- [Chainlink V3](https://github.com/smartcontractkit/chainlink) — Price feeds with staleness and sequencer checks
- [Permit2](https://github.com/Uniswap/permit2) — Gasless token approvals
- [Solady](https://github.com/Vectorized/solady) — Gas-optimized utilities, LibClone
- [Sphinx](https://github.com/sphinx-labs/sphinx) — Multi-chain deployment orchestration

## License

MIT
