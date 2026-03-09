# nana-cli-v6 Design

CLI utility for Juicebox V6 that enables people and AI agents to interact with the protocol from their local machines.

**Repo:** https://github.com/Bananapus/nana-cli-v6

## Decisions

- **Write-heavy, AI-first** — Primary value is executing transactions, not just reading state
- **Foundry-native** — Core is parameterized Forge scripts (Solidity)
- **Layered surfaces** — Forge scripts at core, with shell CLI, MCP server, and Claude Code skills on top
- **Full coverage** — All protocol operations from day one (core, revnet, 721, cross-chain, defifa)
- **Foundry key management** — Standard `--private-key`, `--ledger`, `--trezor`, `--keystore` flags
- **Network profiles** — local (anvil), testnet, mainnet per chain. Profile loads deployed addresses.

## Architecture

```
Forge Scripts (Solidity)           ← Source of truth
    ↑           ↑           ↑
Shell CLI    MCP Server    Claude Code Skills
(bash)       (Node)        (.md)
```

All three surfaces are thin dispatchers. They translate their input format into env vars and call `forge script`.

## Repository Structure

```
nana-cli-v6/
├── script/
│   ├── core/
│   │   ├── Pay.s.sol
│   │   ├── CashOut.s.sol
│   │   ├── SendPayouts.s.sol
│   │   ├── UseAllowance.s.sol
│   │   ├── AddToBalance.s.sol
│   │   ├── LaunchProject.s.sol
│   │   ├── QueueRuleset.s.sol
│   │   ├── MintTokens.s.sol
│   │   ├── BurnTokens.s.sol
│   │   ├── ClaimTokens.s.sol
│   │   ├── SetSplits.s.sol
│   │   ├── SetPermissions.s.sol
│   │   ├── SendReservedTokens.s.sol
│   │   └── ProcessHeldFees.s.sol
│   ├── revnet/
│   │   ├── DeployRevnet.s.sol
│   │   ├── BorrowFrom.s.sol
│   │   ├── RepayLoan.s.sol
│   │   └── ReallocateCollateral.s.sol
│   ├── nft/
│   │   ├── AdjustTiers.s.sol
│   │   ├── MintReserved.s.sol
│   │   └── SetDiscountPercent.s.sol
│   ├── cross-chain/
│   │   ├── Prepare.s.sol
│   │   ├── Claim.s.sol
│   │   └── DeploySuckers.s.sol
│   ├── defifa/
│   │   ├── LaunchGame.s.sol
│   │   ├── SubmitScorecard.s.sol
│   │   └── AttestScorecard.s.sol
│   ├── query/
│   │   ├── ProjectState.s.sol
│   │   ├── Surplus.s.sol
│   │   ├── TokenBalance.s.sol
│   │   └── CurrentRuleset.s.sol
│   └── Base.s.sol
├── src/
│   └── JBAddresses.sol
├── profiles/
│   ├── local.toml
│   ├── testnet.toml
│   ├── ethereum.toml
│   ├── optimism.toml
│   ├── base.toml
│   └── arbitrum.toml
├── cli/
│   └── jb
├── mcp/
│   ├── server.ts
│   └── package.json
├── skills/
│   └── jb-cli.md
├── foundry.toml
├── package.json
└── README.md
```

## Script Pattern

Every script is parameterized via environment variables. Example (`Pay.s.sol`):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBMultiTerminal} from "@bananapus/core-v6/src/interfaces/IJBMultiTerminal.sol";
import {JBConstants} from "@bananapus/core-v6/src/libraries/JBConstants.sol";

/// @notice Pay a Juicebox project.
/// @dev Env vars:
///   PROJECT_ID       — project to pay
///   TOKEN            — token address (0xEEE...E for ETH)
///   AMOUNT           — amount in token decimals
///   BENEFICIARY      — who receives the project tokens
///   MIN_TOKENS       — minimum tokens to receive (slippage)
///   MEMO             — optional memo string
///   METADATA         — optional bytes metadata
contract Pay is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        address token = vm.envOr("TOKEN", JBConstants.NATIVE_TOKEN);
        uint256 amount = vm.envUint("AMOUNT");
        address beneficiary = vm.envOr("BENEFICIARY", msg.sender);
        uint256 minTokens = vm.envOr("MIN_TOKENS", uint256(0));
        string memory memo = vm.envOr("MEMO", string(""));
        bytes memory metadata = vm.envOr("METADATA", bytes(""));

        IJBMultiTerminal terminal = directory().primaryTerminalOf(projectId, token);

        terminal.pay{value: token == JBConstants.NATIVE_TOKEN ? amount : 0}(
            projectId, token, amount, beneficiary, minTokens, memo, metadata
        );
    }
}
```

`Base.s.sol` provides address resolution from env vars:

```solidity
contract Base is Script {
    function directory() internal view returns (IJBDirectory) {
        return IJBDirectory(vm.envAddress("JB_DIRECTORY"));
    }
    function controller() internal view returns (IJBController) {
        return IJBController(vm.envAddress("JB_CONTROLLER"));
    }
    // ... all core contracts

    modifier broadcast() {
        vm.startBroadcast();
        _;
        vm.stopBroadcast();
    }
}
```

**Conventions:**
- Operation params: SCREAMING_SNAKE (`PROJECT_ID`, `AMOUNT`)
- Protocol addresses: `JB_` prefix (`JB_DIRECTORY`, `JB_CONTROLLER`)
- Profiles load the `JB_` addresses per chain

## Shell CLI

Thin bash dispatcher that maps subcommands to forge scripts.

```bash
# Examples
jb pay --project 1 --amount 1ether --token ETH --chain optimism
jb cashout --project 1 --count 1000e18 --chain base
jb deploy-revnet --config ./my-revnet.json --chain ethereum
jb query project-state --project 1 --chain optimism

# Universal flags
#   --chain <name>        Network profile (local, ethereum, optimism, base, arbitrum)
#   --broadcast           Actually send tx (default: dry-run simulation)
#   --private-key <key>   Signing key (or --ledger, --trezor, --keystore)
#   --rpc-url <url>       Override RPC
#   --json                Force JSON output
```

Internally: parse flags, load profile, set env vars, call `forge script`.

## MCP Server

Node server exposing each script as a typed MCP tool. AI agents call typed JSON tools; the server translates to env vars + `forge script`.

```json
{
  "mcpServers": {
    "juicebox": {
      "command": "npx",
      "args": ["@bananapus/jb-cli", "mcp"]
    }
  }
}
```

Can also run remotely on Railway for non-local AI agents.

## Claude Code Skills

Skill manifest (`skills/jb-cli.md`) teaches Claude Code when and how to use each tool — operation names, required/optional params, conventions.

## Network Profiles

TOML files per chain with deployed contract addresses. Loaded by CLI based on `--chain` flag. Addresses sourced from `deploy-all-v6` deployment artifacts.

```toml
# profiles/ethereum.toml
[network]
chain_id = 1
rpc_url = "https://eth.llamarpc.com"

[contracts]
JB_DIRECTORY = "0x..."
JB_CONTROLLER = "0x..."
JB_TERMINAL = "0x..."
# ... all deployed addresses
```

## Operations Manifest

### Core (14)
pay, cashOut, sendPayouts, useAllowance, addToBalance, launchProject, queueRuleset, mintTokens, burnTokens, claimTokens, setSplits, setPermissions, sendReservedTokens, processHeldFees

### Revnet (4)
deployRevnet, borrowFrom, repayLoan, reallocateCollateral

### NFT (3)
adjustTiers, mintReserved, setDiscountPercent

### Cross-Chain (3)
prepare, claim, deploySuckers

### Defifa (3)
launchGame, submitScorecard, attestScorecard

### Query (4)
projectState, surplus, tokenBalance, currentRuleset

**Total: 31 operations**
