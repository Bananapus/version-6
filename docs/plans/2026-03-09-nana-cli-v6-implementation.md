# nana-cli-v6 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Foundry-native CLI for Juicebox V6 with 31 parameterized Forge scripts, a bash dispatcher, MCP server, and Claude Code skills.

**Architecture:** Each protocol operation is a standalone Forge script parameterized via env vars. Three thin surfaces dispatch to them: shell CLI (bash), MCP server (Node), Claude Code skills (markdown).

**Tech Stack:** Solidity 0.8.26, Foundry, Node.js (MCP), bash (CLI)

---

### Task 1: Scaffold the repository

**Files:**
- Create: `nana-cli-v6/foundry.toml`
- Create: `nana-cli-v6/package.json`
- Create: `nana-cli-v6/remappings.txt`
- Create: `nana-cli-v6/.gitignore`

**Step 1: Initialize the repo directory**

```bash
mkdir -p /Users/jango/Documents/jb/v6/evm/nana-cli-v6
cd /Users/jango/Documents/jb/v6/evm/nana-cli-v6
git init
```

**Step 2: Create foundry.toml**

```toml
[profile.default]
solc = '0.8.26'
evm_version = 'cancun'
via_ir = true
optimizer = false
libs = ["node_modules", "lib"]
fs_permissions = [{ access = "read-write", path = "./"}]

[fmt]
number_underscore = "thousands"
multiline_func_header = "all"
wrap_comments = true
```

**Step 3: Create package.json**

```json
{
    "name": "@bananapus/cli-v6",
    "version": "0.0.1",
    "license": "MIT",
    "description": "CLI for Juicebox V6 — Forge scripts, shell CLI, MCP server.",
    "private": true,
    "repository": {
        "type": "git",
        "url": "git+https://github.com/Bananapus/nana-cli-v6"
    },
    "scripts": {
        "build": "forge build"
    },
    "dependencies": {
        "@bananapus/core-v6": "file:../nana-core-v6",
        "@bananapus/permission-ids-v6": "file:../nana-permission-ids-v6",
        "@bananapus/721-hook-v6": "file:../nana-721-hook-v6",
        "@bananapus/buyback-hook-v6": "file:../nana-buyback-hook-v6",
        "@bananapus/router-terminal-v6": "file:../nana-router-terminal-v6",
        "@bananapus/suckers-v6": "file:../nana-suckers-v6",
        "@bananapus/omnichain-deployers-v6": "file:../nana-omnichain-deployers-v6",
        "@bananapus/ownable-v6": "file:../nana-ownable-v6",
        "@rev-net/core-v6": "file:../revnet-core-v6",
        "@croptop/core-v6": "file:../croptop-core-v6",
        "@bannynet/core-v6": "file:../banny-retail-v6",
        "@ballkidz/defifa": "file:../defifa-collection-deployer-v6",
        "@openzeppelin/contracts": "5.2.0",
        "@chainlink/contracts": "^1.3.0",
        "@uniswap/permit2": "github:Uniswap/permit2",
        "@uniswap/v3-core": "github:Uniswap/v3-core#0.8",
        "@uniswap/v3-periphery": "github:Uniswap/v3-periphery#0.8",
        "@uniswap/v4-core": "^1.0.2",
        "@prb/math": "^4.1.0",
        "solady": "^0.1.8"
    }
}
```

**Step 4: Create remappings.txt**

```
@bananapus/core-v6/=node_modules/@bananapus/core-v6/
@bananapus/permission-ids-v6/=node_modules/@bananapus/permission-ids-v6/
@bananapus/721-hook-v6/=node_modules/@bananapus/721-hook-v6/
@bananapus/buyback-hook-v6/=node_modules/@bananapus/buyback-hook-v6/
@bananapus/router-terminal-v6/=node_modules/@bananapus/router-terminal-v6/
@bananapus/suckers-v6/=node_modules/@bananapus/suckers-v6/
@bananapus/omnichain-deployers-v6/=node_modules/@bananapus/omnichain-deployers-v6/
@bananapus/ownable-v6/=node_modules/@bananapus/ownable-v6/
@rev-net/core-v6/=node_modules/@rev-net/core-v6/
@croptop/core-v6/=node_modules/@croptop/core-v6/
@bannynet/core-v6/=node_modules/@bannynet/core-v6/
@ballkidz/defifa/=node_modules/@ballkidz/defifa/
@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/
@chainlink/contracts/=node_modules/@chainlink/contracts/
@chainlink/contracts-ccip/=node_modules/@bananapus/suckers-v6/node_modules/@chainlink/contracts-ccip/
@uniswap/permit2/=node_modules/@uniswap/permit2/
@uniswap/v3-core/=node_modules/@uniswap/v3-core/
@uniswap/v3-periphery/=node_modules/@uniswap/v3-periphery/
@uniswap/v4-core/=node_modules/@uniswap/v4-core/
@arbitrum/nitro-contracts/=node_modules/@bananapus/suckers-v6/node_modules/@arbitrum/nitro-contracts/
@prb/math/=node_modules/@prb/math/
solady/=node_modules/solady/
forge-std/=lib/forge-std/src/
```

**Step 5: Create .gitignore**

```
cache/
out/
node_modules/
broadcast/
```

**Step 6: Install dependencies and verify build**

```bash
cd /Users/jango/Documents/jb/v6/evm/nana-cli-v6
forge install foundry-rs/forge-std --no-commit
npm install
forge build
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold nana-cli-v6 repo"
```

---

### Task 2: Write Base.s.sol

**Files:**
- Create: `nana-cli-v6/script/Base.s.sol`

**Step 1: Write Base.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {IJBController} from "@bananapus/core-v6/src/interfaces/IJBController.sol";
import {IJBDirectory} from "@bananapus/core-v6/src/interfaces/IJBDirectory.sol";
import {IJBMultiTerminal} from "@bananapus/core-v6/src/interfaces/IJBMultiTerminal.sol";
import {IJBPermissions} from "@bananapus/core-v6/src/interfaces/IJBPermissions.sol";
import {IJBProjects} from "@bananapus/core-v6/src/interfaces/IJBProjects.sol";
import {IJBTokens} from "@bananapus/core-v6/src/interfaces/IJBTokens.sol";
import {IJBSplits} from "@bananapus/core-v6/src/interfaces/IJBSplits.sol";
import {IJBPrices} from "@bananapus/core-v6/src/interfaces/IJBPrices.sol";
import {IJBRulesets} from "@bananapus/core-v6/src/interfaces/IJBRulesets.sol";
import {IJBTerminal} from "@bananapus/core-v6/src/interfaces/IJBTerminal.sol";
import {IREVDeployer} from "@rev-net/core-v6/src/interfaces/IREVDeployer.sol";
import {IREVLoans} from "@rev-net/core-v6/src/interfaces/IREVLoans.sol";
import {IJB721TiersHook} from "@bananapus/721-hook-v6/src/interfaces/IJB721TiersHook.sol";
import {IJBSucker} from "@bananapus/suckers-v6/src/interfaces/IJBSucker.sol";
import {JBConstants} from "@bananapus/core-v6/src/libraries/JBConstants.sol";

/// @notice Shared base for all CLI scripts. Resolves protocol addresses from env vars.
/// @dev Set JB_DIRECTORY, JB_CONTROLLER, etc. via env vars or profiles.
abstract contract Base is Script {
    function directory() internal view returns (IJBDirectory) {
        return IJBDirectory(vm.envAddress("JB_DIRECTORY"));
    }

    function controller() internal view returns (IJBController) {
        return IJBController(vm.envAddress("JB_CONTROLLER"));
    }

    function terminal() internal view returns (IJBMultiTerminal) {
        return IJBMultiTerminal(vm.envAddress("JB_TERMINAL"));
    }

    function permissions() internal view returns (IJBPermissions) {
        return IJBPermissions(vm.envAddress("JB_PERMISSIONS"));
    }

    function projects() internal view returns (IJBProjects) {
        return IJBProjects(vm.envAddress("JB_PROJECTS"));
    }

    function tokens() internal view returns (IJBTokens) {
        return IJBTokens(vm.envAddress("JB_TOKENS"));
    }

    function splits() internal view returns (IJBSplits) {
        return IJBSplits(vm.envAddress("JB_SPLITS"));
    }

    function prices() internal view returns (IJBPrices) {
        return IJBPrices(vm.envAddress("JB_PRICES"));
    }

    function rulesets() internal view returns (IJBRulesets) {
        return IJBRulesets(vm.envAddress("JB_RULESETS"));
    }

    function revDeployer() internal view returns (IREVDeployer) {
        return IREVDeployer(vm.envAddress("REV_DEPLOYER"));
    }

    function revLoans() internal view returns (IREVLoans) {
        return IREVLoans(vm.envAddress("REV_LOANS"));
    }

    /// @dev Resolves the primary terminal for a project + token pair.
    function terminalFor(uint256 projectId, address token) internal view returns (IJBTerminal) {
        return directory().primaryTerminalOf(projectId, token);
    }

    /// @dev Parses TOKEN env var. Defaults to native ETH.
    function parseToken() internal view returns (address) {
        return vm.envOr("TOKEN", JBConstants.NATIVE_TOKEN);
    }

    modifier broadcast() {
        vm.startBroadcast();
        _;
        vm.stopBroadcast();
    }
}
```

**Step 2: Verify it compiles**

```bash
forge build
```

**Step 3: Commit**

```bash
git add script/Base.s.sol
git commit -m "feat: add Base.s.sol with protocol address resolution"
```

---

### Task 3: Core write scripts — Pay, CashOut, SendPayouts, UseAllowance, AddToBalance

**Files:**
- Create: `nana-cli-v6/script/core/Pay.s.sol`
- Create: `nana-cli-v6/script/core/CashOut.s.sol`
- Create: `nana-cli-v6/script/core/SendPayouts.s.sol`
- Create: `nana-cli-v6/script/core/UseAllowance.s.sol`
- Create: `nana-cli-v6/script/core/AddToBalance.s.sol`

**Step 1: Create script/core/ directory and write Pay.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBTerminal} from "@bananapus/core-v6/src/interfaces/IJBTerminal.sol";

/// @notice Pay a Juicebox project.
/// @dev Env vars:
///   PROJECT_ID   — project to pay (required)
///   AMOUNT       — amount in token decimals (required)
///   TOKEN        — token address, default native ETH
///   BENEFICIARY  — who receives project tokens, default msg.sender
///   MIN_TOKENS   — minimum tokens to receive, default 0
///   MEMO         — optional memo string
///   METADATA     — optional bytes metadata
contract Pay is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 amount = vm.envUint("AMOUNT");
        address token = parseToken();
        address beneficiary = vm.envOr("BENEFICIARY", msg.sender);
        uint256 minTokens = vm.envOr("MIN_TOKENS", uint256(0));
        string memory memo = vm.envOr("MEMO", string(""));
        bytes memory metadata = vm.envOr("METADATA", bytes(""));

        IJBTerminal _terminal = terminalFor(projectId, token);

        uint256 tokenCount = _terminal.pay{value: token == JBConstants.NATIVE_TOKEN ? amount : 0}(
            projectId, token, amount, beneficiary, minTokens, memo, metadata
        );

        emit log_named_uint("Tokens received", tokenCount);
    }
}
```

**Step 2: Write CashOut.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBCashOutTerminal} from "@bananapus/core-v6/src/interfaces/IJBCashOutTerminal.sol";

/// @notice Cash out project tokens for underlying assets.
/// @dev Env vars:
///   PROJECT_ID         — project to cash out from (required)
///   CASH_OUT_COUNT     — number of tokens to cash out (required)
///   TOKEN              — token to reclaim, default native ETH
///   BENEFICIARY        — who receives reclaimed funds, default msg.sender
///   MIN_RECLAIMED      — minimum reclaim amount, default 0
///   METADATA           — optional bytes metadata
contract CashOut is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 cashOutCount = vm.envUint("CASH_OUT_COUNT");
        address token = parseToken();
        address payable beneficiary = payable(vm.envOr("BENEFICIARY", msg.sender));
        uint256 minReclaimed = vm.envOr("MIN_RECLAIMED", uint256(0));
        bytes memory metadata = vm.envOr("METADATA", bytes(""));

        IJBCashOutTerminal _terminal = IJBCashOutTerminal(address(terminalFor(projectId, token)));

        uint256 reclaimAmount =
            _terminal.cashOutTokensOf(msg.sender, projectId, cashOutCount, token, minReclaimed, beneficiary, metadata);

        emit log_named_uint("Reclaimed amount", reclaimAmount);
    }
}
```

**Step 3: Write SendPayouts.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBPayoutTerminal} from "@bananapus/core-v6/src/interfaces/IJBPayoutTerminal.sol";

/// @notice Distribute payouts to splits.
/// @dev Env vars:
///   PROJECT_ID        — project to distribute payouts for (required)
///   AMOUNT            — amount to distribute (required)
///   TOKEN             — token to distribute, default native ETH
///   CURRENCY          — currency for limit lookup (required)
///   MIN_TOKENS_OUT    — minimum tokens paid out, default 0
contract SendPayouts is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 amount = vm.envUint("AMOUNT");
        address token = parseToken();
        uint256 currency = vm.envUint("CURRENCY");
        uint256 minTokensOut = vm.envOr("MIN_TOKENS_OUT", uint256(0));

        IJBPayoutTerminal _terminal = IJBPayoutTerminal(address(terminalFor(projectId, token)));

        uint256 amountPaidOut = _terminal.sendPayoutsOf(projectId, token, amount, currency, minTokensOut);

        emit log_named_uint("Amount paid out", amountPaidOut);
    }
}
```

**Step 4: Write UseAllowance.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBPayoutTerminal} from "@bananapus/core-v6/src/interfaces/IJBPayoutTerminal.sol";

/// @notice Withdraw from surplus allowance.
/// @dev Env vars:
///   PROJECT_ID        — project to withdraw from (required)
///   AMOUNT            — amount to withdraw (required)
///   TOKEN             — token to withdraw, default native ETH
///   CURRENCY          — currency for limit lookup (required)
///   MIN_TOKENS_OUT    — minimum tokens received, default 0
///   BENEFICIARY       — who receives funds, default msg.sender
///   FEE_BENEFICIARY   — who receives fee tokens, default msg.sender
///   MEMO              — optional memo string
contract UseAllowance is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 amount = vm.envUint("AMOUNT");
        address token = parseToken();
        uint256 currency = vm.envUint("CURRENCY");
        uint256 minTokensOut = vm.envOr("MIN_TOKENS_OUT", uint256(0));
        address payable beneficiary = payable(vm.envOr("BENEFICIARY", msg.sender));
        address payable feeBeneficiary = payable(vm.envOr("FEE_BENEFICIARY", msg.sender));
        string memory memo = vm.envOr("MEMO", string(""));

        IJBPayoutTerminal _terminal = IJBPayoutTerminal(address(terminalFor(projectId, token)));

        uint256 netAmountPaidOut = _terminal.useAllowanceOf(
            projectId, token, amount, currency, minTokensOut, beneficiary, feeBeneficiary, memo
        );

        emit log_named_uint("Net amount paid out", netAmountPaidOut);
    }
}
```

**Step 5: Write AddToBalance.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBTerminal} from "@bananapus/core-v6/src/interfaces/IJBTerminal.sol";

/// @notice Add funds to a project's balance without minting tokens.
/// @dev Env vars:
///   PROJECT_ID           — project to add balance to (required)
///   AMOUNT               — amount to add (required)
///   TOKEN                — token to add, default native ETH
///   SHOULD_RETURN_FEES   — whether to return held fees, default false
///   MEMO                 — optional memo string
///   METADATA             — optional bytes metadata
contract AddToBalance is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 amount = vm.envUint("AMOUNT");
        address token = parseToken();
        bool shouldReturnFees = vm.envOr("SHOULD_RETURN_FEES", false);
        string memory memo = vm.envOr("MEMO", string(""));
        bytes memory metadata = vm.envOr("METADATA", bytes(""));

        IJBTerminal _terminal = terminalFor(projectId, token);

        _terminal.addToBalanceOf{value: token == JBConstants.NATIVE_TOKEN ? amount : 0}(
            projectId, token, amount, shouldReturnFees, memo, metadata
        );
    }
}
```

**Step 6: Verify all compile**

```bash
forge build
```

**Step 7: Commit**

```bash
git add script/core/
git commit -m "feat: add core write scripts (Pay, CashOut, SendPayouts, UseAllowance, AddToBalance)"
```

---

### Task 4: Core lifecycle scripts — LaunchProject, QueueRuleset, MintTokens, BurnTokens, ClaimTokens

**Files:**
- Create: `nana-cli-v6/script/core/LaunchProject.s.sol`
- Create: `nana-cli-v6/script/core/QueueRuleset.s.sol`
- Create: `nana-cli-v6/script/core/MintTokens.s.sol`
- Create: `nana-cli-v6/script/core/BurnTokens.s.sol`
- Create: `nana-cli-v6/script/core/ClaimTokens.s.sol`

**Step 1: Write LaunchProject.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBRulesetConfig} from "@bananapus/core-v6/src/structs/JBRulesetConfig.sol";
import {JBTerminalConfig} from "@bananapus/core-v6/src/structs/JBTerminalConfig.sol";

/// @notice Launch a new Juicebox project.
/// @dev Env vars:
///   OWNER       — project owner address (required)
///   PROJECT_URI — project metadata URI (required)
///   CONFIG_PATH — path to JSON config file with rulesetConfigurations and terminalConfigurations (required)
///   MEMO        — optional memo string
contract LaunchProject is Base {
    function run() public broadcast {
        address owner = vm.envAddress("OWNER");
        string memory projectUri = vm.envString("PROJECT_URI");
        string memory configPath = vm.envString("CONFIG_PATH");
        string memory memo = vm.envOr("MEMO", string(""));

        string memory json = vm.readFile(configPath);

        JBRulesetConfig[] memory rulesetConfigs = abi.decode(vm.parseJson(json, ".rulesetConfigurations"), (JBRulesetConfig[]));
        JBTerminalConfig[] memory terminalConfigs = abi.decode(vm.parseJson(json, ".terminalConfigurations"), (JBTerminalConfig[]));

        uint256 projectId = controller().launchProjectFor(owner, projectUri, rulesetConfigs, terminalConfigs, memo);

        emit log_named_uint("Project ID", projectId);
    }
}
```

**Step 2: Write QueueRuleset.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBRulesetConfig} from "@bananapus/core-v6/src/structs/JBRulesetConfig.sol";

/// @notice Queue a new ruleset for an existing project.
/// @dev Env vars:
///   PROJECT_ID  — project to queue ruleset for (required)
///   CONFIG_PATH — path to JSON config file with rulesetConfigurations (required)
///   MEMO        — optional memo string
contract QueueRuleset is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        string memory configPath = vm.envString("CONFIG_PATH");
        string memory memo = vm.envOr("MEMO", string(""));

        string memory json = vm.readFile(configPath);
        JBRulesetConfig[] memory rulesetConfigs = abi.decode(vm.parseJson(json, ".rulesetConfigurations"), (JBRulesetConfig[]));

        uint256 rulesetId = controller().queueRulesetsOf(projectId, rulesetConfigs, memo);

        emit log_named_uint("Ruleset ID", rulesetId);
    }
}
```

**Step 3: Write MintTokens.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";

/// @notice Mint project tokens (owner only).
/// @dev Env vars:
///   PROJECT_ID          — project to mint for (required)
///   TOKEN_COUNT         — number of tokens to mint (required)
///   BENEFICIARY         — who receives minted tokens (required)
///   MEMO                — optional memo string
///   USE_RESERVED_PERCENT — whether to apply reserved percent, default true
contract MintTokens is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 tokenCount = vm.envUint("TOKEN_COUNT");
        address beneficiary = vm.envAddress("BENEFICIARY");
        string memory memo = vm.envOr("MEMO", string(""));
        bool useReservedPercent = vm.envOr("USE_RESERVED_PERCENT", true);

        uint256 beneficiaryTokenCount =
            controller().mintTokensOf(projectId, tokenCount, beneficiary, memo, useReservedPercent);

        emit log_named_uint("Beneficiary tokens", beneficiaryTokenCount);
    }
}
```

**Step 4: Write BurnTokens.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";

/// @notice Burn project tokens.
/// @dev Env vars:
///   PROJECT_ID  — project to burn tokens for (required)
///   TOKEN_COUNT — number of tokens to burn (required)
///   HOLDER      — token holder, default msg.sender
///   MEMO        — optional memo string
contract BurnTokens is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 tokenCount = vm.envUint("TOKEN_COUNT");
        address holder = vm.envOr("HOLDER", msg.sender);
        string memory memo = vm.envOr("MEMO", string(""));

        controller().burnTokensOf(holder, projectId, tokenCount, memo);
    }
}
```

**Step 5: Write ClaimTokens.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";

/// @notice Convert credit tokens to ERC-20.
/// @dev Env vars:
///   PROJECT_ID  — project to claim tokens for (required)
///   AMOUNT      — number of credits to claim (required)
///   HOLDER      — credit holder, default msg.sender
///   BENEFICIARY — who receives ERC-20, default msg.sender
contract ClaimTokens is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 amount = vm.envUint("AMOUNT");
        address holder = vm.envOr("HOLDER", msg.sender);
        address beneficiary = vm.envOr("BENEFICIARY", msg.sender);

        tokens().claimTokensFor(holder, projectId, amount, beneficiary);
    }
}
```

**Step 6: Verify all compile**

```bash
forge build
```

**Step 7: Commit**

```bash
git add script/core/
git commit -m "feat: add core lifecycle scripts (LaunchProject, QueueRuleset, MintTokens, BurnTokens, ClaimTokens)"
```

---

### Task 5: Core admin scripts — SetSplits, SetPermissions, SendReservedTokens, ProcessHeldFees

**Files:**
- Create: `nana-cli-v6/script/core/SetSplits.s.sol`
- Create: `nana-cli-v6/script/core/SetPermissions.s.sol`
- Create: `nana-cli-v6/script/core/SendReservedTokens.s.sol`
- Create: `nana-cli-v6/script/core/ProcessHeldFees.s.sol`

**Step 1: Write SetSplits.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBSplitGroup} from "@bananapus/core-v6/src/structs/JBSplitGroup.sol";

/// @notice Configure split groups for a project.
/// @dev Env vars:
///   PROJECT_ID  — project to set splits for (required)
///   RULESET_ID  — ruleset to associate splits with (required)
///   CONFIG_PATH — path to JSON config file with splitGroups array (required)
contract SetSplits is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        uint256 rulesetId = vm.envUint("RULESET_ID");
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        JBSplitGroup[] memory splitGroups = abi.decode(vm.parseJson(json, ".splitGroups"), (JBSplitGroup[]));

        splits().setSplitGroupsOf(projectId, rulesetId, splitGroups);
    }
}
```

**Step 2: Write SetPermissions.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBPermissionsData} from "@bananapus/core-v6/src/structs/JBPermissionsData.sol";

/// @notice Grant or revoke permissions for an operator.
/// @dev Env vars:
///   OPERATOR       — address to grant permissions to (required)
///   PROJECT_ID     — project scope, 0 for wildcard (required)
///   PERMISSION_IDS — comma-separated list of permission IDs (required)
contract SetPermissions is Base {
    function run() public broadcast {
        address operator = vm.envAddress("OPERATOR");
        uint64 projectId = uint64(vm.envUint("PROJECT_ID"));
        uint256[] memory rawIds = vm.envUint("PERMISSION_IDS", ",");

        uint8[] memory permissionIds = new uint8[](rawIds.length);
        for (uint256 i; i < rawIds.length; i++) {
            permissionIds[i] = uint8(rawIds[i]);
        }

        JBPermissionsData memory data = JBPermissionsData({
            operator: operator,
            projectId: projectId,
            permissionIds: permissionIds
        });

        permissions().setPermissionsFor(msg.sender, data);
    }
}
```

**Step 3: Write SendReservedTokens.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";

/// @notice Distribute pending reserved tokens to splits.
/// @dev Env vars:
///   PROJECT_ID — project to distribute reserved tokens for (required)
contract SendReservedTokens is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");

        uint256 tokenCount = controller().sendReservedTokensToSplitsOf(projectId);

        emit log_named_uint("Reserved tokens distributed", tokenCount);
    }
}
```

**Step 4: Write ProcessHeldFees.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBFeeTerminal} from "@bananapus/core-v6/src/interfaces/IJBFeeTerminal.sol";

/// @notice Process held fees for a project.
/// @dev Env vars:
///   PROJECT_ID — project to process fees for (required)
///   TOKEN      — token to process fees in, default native ETH
///   COUNT      — number of held fees to process (required)
contract ProcessHeldFees is Base {
    function run() public broadcast {
        uint256 projectId = vm.envUint("PROJECT_ID");
        address token = parseToken();
        uint256 count = vm.envUint("COUNT");

        IJBFeeTerminal _terminal = IJBFeeTerminal(address(terminalFor(projectId, token)));
        _terminal.processHeldFeesOf(projectId, token, count);
    }
}
```

**Step 5: Verify all compile**

```bash
forge build
```

**Step 6: Commit**

```bash
git add script/core/
git commit -m "feat: add core admin scripts (SetSplits, SetPermissions, SendReservedTokens, ProcessHeldFees)"
```

---

### Task 6: Revnet scripts — DeployRevnet, BorrowFrom, RepayLoan, ReallocateCollateral

**Files:**
- Create: `nana-cli-v6/script/revnet/DeployRevnet.s.sol`
- Create: `nana-cli-v6/script/revnet/BorrowFrom.s.sol`
- Create: `nana-cli-v6/script/revnet/RepayLoan.s.sol`
- Create: `nana-cli-v6/script/revnet/ReallocateCollateral.s.sol`

**Step 1: Write DeployRevnet.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {REVConfig} from "@rev-net/core-v6/src/structs/REVConfig.sol";
import {REVSuckerDeploymentConfig} from "@rev-net/core-v6/src/structs/REVSuckerDeploymentConfig.sol";
import {JBTerminalConfig} from "@bananapus/core-v6/src/structs/JBTerminalConfig.sol";

/// @notice Deploy a revnet (autonomous revenue network).
/// @dev Env vars:
///   REVNET_ID   — ID to deploy with, 0 to auto-assign (required)
///   CONFIG_PATH — path to JSON config file (required)
contract DeployRevnet is Base {
    function run() public broadcast {
        uint256 revnetId = vm.envUint("REVNET_ID");
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        REVConfig memory config = abi.decode(vm.parseJson(json, ".configuration"), (REVConfig));
        JBTerminalConfig[] memory terminalConfigs =
            abi.decode(vm.parseJson(json, ".terminalConfigurations"), (JBTerminalConfig[]));
        REVSuckerDeploymentConfig memory suckerConfig =
            abi.decode(vm.parseJson(json, ".suckerDeploymentConfiguration"), (REVSuckerDeploymentConfig));

        uint256 projectId = revDeployer().deployFor(revnetId, config, terminalConfigs, suckerConfig);

        emit log_named_uint("Revnet project ID", projectId);
    }
}
```

**Step 2: Write BorrowFrom.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {REVLoanSource} from "@rev-net/core-v6/src/structs/REVLoanSource.sol";
import {REVLoan} from "@rev-net/core-v6/src/structs/REVLoan.sol";
import {IJBPayoutTerminal} from "@bananapus/core-v6/src/interfaces/IJBPayoutTerminal.sol";

/// @notice Borrow against revnet token collateral.
/// @dev Env vars:
///   REVNET_ID          — revnet to borrow from (required)
///   COLLATERAL_COUNT   — number of tokens to use as collateral (required)
///   MIN_BORROW_AMOUNT  — minimum borrow amount, default 0
///   LOAN_TOKEN         — token to borrow, default native ETH
///   LOAN_TERMINAL      — terminal for the loan, default primary terminal
///   BENEFICIARY        — who receives borrowed funds, default msg.sender
///   PREPAID_FEE_PERCENT — percentage of fee to prepay, default 0
contract BorrowFrom is Base {
    function run() public broadcast {
        uint256 revnetId = vm.envUint("REVNET_ID");
        uint256 collateralCount = vm.envUint("COLLATERAL_COUNT");
        uint256 minBorrowAmount = vm.envOr("MIN_BORROW_AMOUNT", uint256(0));
        address loanToken = parseToken();
        address payable beneficiary = payable(vm.envOr("BENEFICIARY", msg.sender));
        uint256 prepaidFeePercent = vm.envOr("PREPAID_FEE_PERCENT", uint256(0));

        address loanTerminal = vm.envOr("LOAN_TERMINAL", address(terminalFor(revnetId, loanToken)));

        REVLoanSource memory source =
            REVLoanSource({token: loanToken, terminal: IJBPayoutTerminal(loanTerminal)});

        (uint256 loanId, REVLoan memory loan) =
            revLoans().borrowFrom(revnetId, source, minBorrowAmount, collateralCount, beneficiary, prepaidFeePercent);

        emit log_named_uint("Loan ID", loanId);
        emit log_named_uint("Borrowed amount", loan.amount);
    }
}
```

**Step 3: Write RepayLoan.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {REVLoan} from "@rev-net/core-v6/src/structs/REVLoan.sol";
import {JBSingleAllowance} from "@bananapus/core-v6/src/structs/JBSingleAllowance.sol";

/// @notice Repay a revnet loan.
/// @dev Env vars:
///   LOAN_ID                     — loan to repay (required)
///   MAX_REPAY_AMOUNT            — max amount to repay, default type(uint256).max
///   COLLATERAL_COUNT_TO_RETURN  — collateral to return, default all
///   BENEFICIARY                 — who receives returned collateral, default msg.sender
contract RepayLoan is Base {
    function run() public broadcast {
        uint256 loanId = vm.envUint("LOAN_ID");
        uint256 maxRepayAmount = vm.envOr("MAX_REPAY_AMOUNT", type(uint256).max);
        uint256 collateralCountToReturn = vm.envOr("COLLATERAL_COUNT_TO_RETURN", type(uint256).max);
        address payable beneficiary = payable(vm.envOr("BENEFICIARY", msg.sender));

        // Empty allowance — caller must have approved the terminal directly
        JBSingleAllowance memory allowance;

        (uint256 paidOffLoanId, REVLoan memory paidOffLoan) =
            revLoans().repayLoan(loanId, maxRepayAmount, collateralCountToReturn, beneficiary, allowance);

        emit log_named_uint("Paid off loan ID", paidOffLoanId);
        emit log_named_uint("Remaining amount", paidOffLoan.amount);
    }
}
```

**Step 4: Write ReallocateCollateral.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {REVLoanSource} from "@rev-net/core-v6/src/structs/REVLoanSource.sol";
import {REVLoan} from "@rev-net/core-v6/src/structs/REVLoan.sol";
import {IJBPayoutTerminal} from "@bananapus/core-v6/src/interfaces/IJBPayoutTerminal.sol";

/// @notice Reallocate collateral from one loan to a new loan.
/// @dev Env vars:
///   LOAN_ID                      — source loan to reallocate from (required)
///   COLLATERAL_COUNT_TO_TRANSFER — collateral to move (required)
///   NEW_LOAN_TOKEN               — token for new loan, default native ETH
///   NEW_LOAN_TERMINAL            — terminal for new loan
///   MIN_BORROW_AMOUNT            — minimum borrow for new loan, default 0
///   COLLATERAL_COUNT_TO_ADD      — additional collateral for new loan, default 0
///   BENEFICIARY                  — who receives new loan funds, default msg.sender
///   PREPAID_FEE_PERCENT          — fee prepayment for new loan, default 0
contract ReallocateCollateral is Base {
    function run() public broadcast {
        uint256 loanId = vm.envUint("LOAN_ID");
        uint256 collateralCountToTransfer = vm.envUint("COLLATERAL_COUNT_TO_TRANSFER");
        address newLoanToken = parseToken();
        uint256 minBorrowAmount = vm.envOr("MIN_BORROW_AMOUNT", uint256(0));
        uint256 collateralCountToAdd = vm.envOr("COLLATERAL_COUNT_TO_ADD", uint256(0));
        address payable beneficiary = payable(vm.envOr("BENEFICIARY", msg.sender));
        uint256 prepaidFeePercent = vm.envOr("PREPAID_FEE_PERCENT", uint256(0));

        // Resolve the new loan's terminal
        REVLoan memory currentLoan = revLoans().loanOf(loanId);
        uint256 revnetId = vm.envUint("REVNET_ID");
        address newTerminal = vm.envOr("NEW_LOAN_TERMINAL", address(terminalFor(revnetId, newLoanToken)));

        REVLoanSource memory source =
            REVLoanSource({token: newLoanToken, terminal: IJBPayoutTerminal(newTerminal)});

        (uint256 reallocatedLoanId, uint256 newLoanId, REVLoan memory reallocatedLoan, REVLoan memory newLoan) =
            revLoans().reallocateCollateralFromLoan(
                loanId, collateralCountToTransfer, source, minBorrowAmount, collateralCountToAdd, beneficiary, prepaidFeePercent
            );

        emit log_named_uint("Reallocated loan ID", reallocatedLoanId);
        emit log_named_uint("New loan ID", newLoanId);
        emit log_named_uint("New loan amount", newLoan.amount);
    }
}
```

**Step 5: Verify all compile**

```bash
forge build
```

**Step 6: Commit**

```bash
git add script/revnet/
git commit -m "feat: add revnet scripts (DeployRevnet, BorrowFrom, RepayLoan, ReallocateCollateral)"
```

---

### Task 7: NFT scripts — AdjustTiers, MintReserved, SetDiscountPercent

**Files:**
- Create: `nana-cli-v6/script/nft/AdjustTiers.s.sol`
- Create: `nana-cli-v6/script/nft/MintReserved.s.sol`
- Create: `nana-cli-v6/script/nft/SetDiscountPercent.s.sol`

**Step 1: Write AdjustTiers.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJB721TiersHook} from "@bananapus/721-hook-v6/src/interfaces/IJB721TiersHook.sol";
import {JB721TierConfig} from "@bananapus/721-hook-v6/src/structs/JB721TierConfig.sol";

/// @notice Add or remove NFT tiers from a 721 hook.
/// @dev Env vars:
///   HOOK         — 721 tiers hook address (required)
///   CONFIG_PATH  — path to JSON with tiersToAdd array and tierIdsToRemove array (required)
contract AdjustTiers is Base {
    function run() public broadcast {
        IJB721TiersHook hook = IJB721TiersHook(vm.envAddress("HOOK"));
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        JB721TierConfig[] memory tiersToAdd = abi.decode(vm.parseJson(json, ".tiersToAdd"), (JB721TierConfig[]));
        uint256[] memory tierIdsToRemove = abi.decode(vm.parseJson(json, ".tierIdsToRemove"), (uint256[]));

        hook.adjustTiers(tiersToAdd, tierIdsToRemove);
    }
}
```

**Step 2: Write MintReserved.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJB721TiersHook} from "@bananapus/721-hook-v6/src/interfaces/IJB721TiersHook.sol";

/// @notice Mint pending reserved NFTs.
/// @dev Env vars:
///   HOOK        — 721 tiers hook address (required)
///   TIER_ID     — tier to mint reserved NFTs from (required)
///   COUNT       — number of reserved NFTs to mint (required)
///   BENEFICIARY — who receives the NFTs, default msg.sender
contract MintReserved is Base {
    function run() public broadcast {
        IJB721TiersHook hook = IJB721TiersHook(vm.envAddress("HOOK"));
        uint256 tierId = vm.envUint("TIER_ID");
        uint256 count = vm.envUint("COUNT");
        address beneficiary = vm.envOr("BENEFICIARY", msg.sender);

        uint256[] memory tokenIds = hook.mintPendingReservesFor(tierId, count, beneficiary);

        for (uint256 i; i < tokenIds.length; i++) {
            emit log_named_uint("Minted token ID", tokenIds[i]);
        }
    }
}
```

**Step 3: Write SetDiscountPercent.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJB721TiersHook} from "@bananapus/721-hook-v6/src/interfaces/IJB721TiersHook.sol";

/// @notice Set the discount percent for an NFT tier.
/// @dev Env vars:
///   HOOK             — 721 tiers hook address (required)
///   TIER_ID          — tier to set discount for (required)
///   DISCOUNT_PERCENT — discount percent (0-200, where 200 = 100% discount) (required)
contract SetDiscountPercent is Base {
    function run() public broadcast {
        IJB721TiersHook hook = IJB721TiersHook(vm.envAddress("HOOK"));
        uint256 tierId = vm.envUint("TIER_ID");
        uint256 discountPercent = vm.envUint("DISCOUNT_PERCENT");

        hook.setDiscountPercentOf(tierId, discountPercent);
    }
}
```

**Step 4: Verify all compile**

```bash
forge build
```

**Step 5: Commit**

```bash
git add script/nft/
git commit -m "feat: add NFT scripts (AdjustTiers, MintReserved, SetDiscountPercent)"
```

---

### Task 8: Cross-chain scripts — Prepare, Claim, DeploySuckers

**Files:**
- Create: `nana-cli-v6/script/cross-chain/Prepare.s.sol`
- Create: `nana-cli-v6/script/cross-chain/Claim.s.sol`
- Create: `nana-cli-v6/script/cross-chain/DeploySuckers.s.sol`

**Step 1: Write Prepare.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBSucker} from "@bananapus/suckers-v6/src/interfaces/IJBSucker.sol";

/// @notice Prepare a cross-chain token transfer (cash out on source, insert into outbox).
/// @dev Env vars:
///   SUCKER      — sucker contract address (required)
///   PROJECT_ID  — project to prepare transfer for (required)
///   TOKEN       — token to bridge, default native ETH
///   AMOUNT      — amount to bridge (required)
///   BENEFICIARY — who receives on destination chain (required)
///   MIN_TOKENS_RECLAIMED — minimum reclaimed tokens, default 0
contract Prepare is Base {
    function run() public broadcast {
        IJBSucker sucker = IJBSucker(vm.envAddress("SUCKER"));
        uint256 projectId = vm.envUint("PROJECT_ID");
        address token = parseToken();
        uint256 amount = vm.envUint("AMOUNT");
        address beneficiary = vm.envAddress("BENEFICIARY");
        uint256 minTokensReclaimed = vm.envOr("MIN_TOKENS_RECLAIMED", uint256(0));

        sucker.prepare(amount, beneficiary, minTokensReclaimed, token);
    }
}
```

**Step 2: Write Claim.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBSucker} from "@bananapus/suckers-v6/src/interfaces/IJBSucker.sol";
import {JBClaim} from "@bananapus/suckers-v6/src/structs/JBClaim.sol";

/// @notice Claim bridged tokens on the destination chain using merkle proof.
/// @dev Env vars:
///   SUCKER      — sucker contract address (required)
///   CONFIG_PATH — path to JSON with claims array containing merkle proofs (required)
contract Claim is Base {
    function run() public broadcast {
        IJBSucker sucker = IJBSucker(vm.envAddress("SUCKER"));
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        JBClaim[] memory claims = abi.decode(vm.parseJson(json, ".claims"), (JBClaim[]));

        sucker.claim(claims);
    }
}
```

**Step 3: Write DeploySuckers.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {REVSuckerDeploymentConfig} from "@rev-net/core-v6/src/structs/REVSuckerDeploymentConfig.sol";

/// @notice Deploy sucker pairs for cross-chain bridging.
/// @dev Env vars:
///   REVNET_ID   — revnet to deploy suckers for (required)
///   CONFIG_PATH — path to JSON with suckerDeploymentConfiguration (required)
contract DeploySuckers is Base {
    function run() public broadcast {
        uint256 revnetId = vm.envUint("REVNET_ID");
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        REVSuckerDeploymentConfig memory suckerConfig =
            abi.decode(vm.parseJson(json, ".suckerDeploymentConfiguration"), (REVSuckerDeploymentConfig));

        address[] memory suckers = revDeployer().deploySuckersFor(revnetId, suckerConfig);

        for (uint256 i; i < suckers.length; i++) {
            emit log_named_address("Sucker deployed", suckers[i]);
        }
    }
}
```

**Step 4: Verify all compile**

```bash
forge build
```

**Step 5: Commit**

```bash
git add script/cross-chain/
git commit -m "feat: add cross-chain scripts (Prepare, Claim, DeploySuckers)"
```

---

### Task 9: Defifa scripts — LaunchGame, SubmitScorecard, AttestScorecard

**Files:**
- Create: `nana-cli-v6/script/defifa/LaunchGame.s.sol`
- Create: `nana-cli-v6/script/defifa/SubmitScorecard.s.sol`
- Create: `nana-cli-v6/script/defifa/AttestScorecard.s.sol`

**Step 1: Write LaunchGame.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IDefifaDeployer} from "@ballkidz/defifa/src/interfaces/IDefifaDeployer.sol";

/// @notice Launch a Defifa prediction game.
/// @dev Env vars:
///   DEFIFA_DEPLOYER — Defifa deployer contract address (required)
///   CONFIG_PATH     — path to JSON config for the game (required)
contract LaunchGame is Base {
    function run() public broadcast {
        IDefifaDeployer deployer = IDefifaDeployer(vm.envAddress("DEFIFA_DEPLOYER"));
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);
        bytes memory configData = vm.parseJson(json);

        // The launchGameWith function takes a complex struct — decode from JSON
        (bool success, bytes memory result) =
            address(deployer).call(abi.encodePacked(IDefifaDeployer.launchGameWith.selector, configData));
        require(success, "LaunchGame failed");

        emit log_named_bytes("Result", result);
    }
}
```

**Step 2: Write SubmitScorecard.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IDefifaGovernor} from "@ballkidz/defifa/src/interfaces/IDefifaGovernor.sol";

/// @notice Submit a scorecard for a Defifa game.
/// @dev Env vars:
///   GOVERNOR    — DefifaGovernor contract address (required)
///   GAME_ID     — game project ID (required)
///   CONFIG_PATH — path to JSON with tierWeights array [{tierId, weight}] (required)
contract SubmitScorecard is Base {
    function run() public broadcast {
        IDefifaGovernor governor = IDefifaGovernor(vm.envAddress("GOVERNOR"));
        uint256 gameId = vm.envUint("GAME_ID");
        string memory configPath = vm.envString("CONFIG_PATH");

        string memory json = vm.readFile(configPath);

        uint256[2][] memory tierWeights = abi.decode(vm.parseJson(json, ".tierWeights"), (uint256[2][]));

        governor.submitScorecardFor(gameId, tierWeights);
    }
}
```

**Step 3: Write AttestScorecard.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IDefifaGovernor} from "@ballkidz/defifa/src/interfaces/IDefifaGovernor.sol";

/// @notice Attest to a submitted scorecard.
/// @dev Env vars:
///   GOVERNOR     — DefifaGovernor contract address (required)
///   GAME_ID      — game project ID (required)
///   SCORECARD_ID — scorecard to attest to (required)
contract AttestScorecard is Base {
    function run() public broadcast {
        IDefifaGovernor governor = IDefifaGovernor(vm.envAddress("GOVERNOR"));
        uint256 gameId = vm.envUint("GAME_ID");
        uint256 scorecardId = vm.envUint("SCORECARD_ID");

        governor.attestToScorecardFrom(gameId, scorecardId);
    }
}
```

**Step 4: Verify all compile**

```bash
forge build
```

**Step 5: Commit**

```bash
git add script/defifa/
git commit -m "feat: add Defifa scripts (LaunchGame, SubmitScorecard, AttestScorecard)"
```

---

### Task 10: Query scripts — ProjectState, Surplus, TokenBalance, CurrentRuleset

**Files:**
- Create: `nana-cli-v6/script/query/ProjectState.s.sol`
- Create: `nana-cli-v6/script/query/Surplus.s.sol`
- Create: `nana-cli-v6/script/query/TokenBalance.s.sol`
- Create: `nana-cli-v6/script/query/CurrentRuleset.s.sol`

**Step 1: Write ProjectState.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {IJBProjects} from "@bananapus/core-v6/src/interfaces/IJBProjects.sol";
import {IJBController} from "@bananapus/core-v6/src/interfaces/IJBController.sol";
import {IJBTerminal} from "@bananapus/core-v6/src/interfaces/IJBTerminal.sol";
import {JBRuleset} from "@bananapus/core-v6/src/structs/JBRuleset.sol";
import {JBRulesetMetadata} from "@bananapus/core-v6/src/structs/JBRulesetMetadata.sol";
import {JBRulesetWithMetadata} from "@bananapus/core-v6/src/structs/JBRulesetWithMetadata.sol";

/// @notice Query full project state snapshot.
/// @dev Env vars:
///   PROJECT_ID — project to query (required)
contract ProjectState is Base {
    function run() public view {
        uint256 projectId = vm.envUint("PROJECT_ID");

        // Owner
        address owner = projects().ownerOf(projectId);
        emit log_named_address("Owner", owner);

        // Token supply
        uint256 totalSupply = tokens().totalSupplyOf(projectId);
        emit log_named_uint("Total supply", totalSupply);

        // Pending reserved tokens
        uint256 pendingReserved = controller().pendingReservedTokenBalanceOf(projectId);
        emit log_named_uint("Pending reserved tokens", pendingReserved);

        // Current ruleset
        (JBRuleset memory ruleset, JBRulesetMetadata memory metadata) = controller().currentRulesetOf(projectId);
        emit log_named_uint("Ruleset ID", ruleset.id);
        emit log_named_uint("Ruleset cycle", ruleset.cycleNumber);
        emit log_named_uint("Weight", ruleset.weight);
        emit log_named_uint("Duration", ruleset.duration);
        emit log_named_uint("Reserved percent", metadata.reservedPercent);
        emit log_named_uint("Cash out tax rate", metadata.cashOutTaxRate);

        // Terminals
        IJBTerminal[] memory terminals = directory().terminalsOf(projectId);
        emit log_named_uint("Terminal count", terminals.length);
        for (uint256 i; i < terminals.length; i++) {
            emit log_named_address("Terminal", address(terminals[i]));
        }
    }
}
```

**Step 2: Write Surplus.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBAccountingContext} from "@bananapus/core-v6/src/structs/JBAccountingContext.sol";

/// @notice Query current surplus for a project.
/// @dev Env vars:
///   PROJECT_ID — project to query (required)
///   TOKEN      — token to check surplus in, default native ETH
///   DECIMALS   — output decimals, default 18
///   CURRENCY   — output currency, default token address as uint
contract Surplus is Base {
    function run() public view {
        uint256 projectId = vm.envUint("PROJECT_ID");
        address token = parseToken();
        uint256 decimals = vm.envOr("DECIMALS", uint256(18));
        uint256 currency = vm.envOr("CURRENCY", uint256(uint160(token)));

        IJBTerminal _terminal = terminalFor(projectId, token);
        JBAccountingContext[] memory contexts = _terminal.accountingContextsOf(projectId);

        uint256 surplus = _terminal.currentSurplusOf(projectId, contexts, decimals, currency);

        emit log_named_uint("Surplus", surplus);
    }
}
```

**Step 3: Write TokenBalance.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";

/// @notice Query token balances for a holder.
/// @dev Env vars:
///   PROJECT_ID — project to query (required)
///   HOLDER     — address to check balance of (required)
contract TokenBalance is Base {
    function run() public view {
        uint256 projectId = vm.envUint("PROJECT_ID");
        address holder = vm.envAddress("HOLDER");

        uint256 totalBalance = tokens().totalBalanceOf(holder, projectId);
        uint256 creditBalance = tokens().creditBalanceOf(holder, projectId);
        uint256 erc20Balance = totalBalance - creditBalance;

        emit log_named_uint("Total balance", totalBalance);
        emit log_named_uint("Credit balance", creditBalance);
        emit log_named_uint("ERC-20 balance", erc20Balance);
    }
}
```

**Step 4: Write CurrentRuleset.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base} from "../Base.s.sol";
import {JBRuleset} from "@bananapus/core-v6/src/structs/JBRuleset.sol";
import {JBRulesetMetadata} from "@bananapus/core-v6/src/structs/JBRulesetMetadata.sol";

/// @notice Query the current active ruleset for a project.
/// @dev Env vars:
///   PROJECT_ID — project to query (required)
contract CurrentRuleset is Base {
    function run() public view {
        uint256 projectId = vm.envUint("PROJECT_ID");

        (JBRuleset memory ruleset, JBRulesetMetadata memory metadata) = controller().currentRulesetOf(projectId);

        emit log_named_uint("Ruleset ID", ruleset.id);
        emit log_named_uint("Cycle number", ruleset.cycleNumber);
        emit log_named_uint("Based on ID", ruleset.basedOnId);
        emit log_named_uint("Start", ruleset.start);
        emit log_named_uint("Duration", ruleset.duration);
        emit log_named_uint("Weight", ruleset.weight);
        emit log_named_uint("Weight cut percent", ruleset.weightCutPercent);
        emit log_named_address("Approval hook", ruleset.approvalHook);
        emit log_named_uint("Reserved percent", metadata.reservedPercent);
        emit log_named_uint("Cash out tax rate", metadata.cashOutTaxRate);
        emit log_named_uint("Base currency", metadata.baseCurrency);
        emit log_named_string("Pause pay", metadata.pausePay ? "true" : "false");
        emit log_named_string("Allow owner minting", metadata.allowOwnerMinting ? "true" : "false");
        emit log_named_string("Hold fees", metadata.holdFees ? "true" : "false");
        emit log_named_string("Use data hook (pay)", metadata.useDataHookForPay ? "true" : "false");
        emit log_named_string("Use data hook (cashout)", metadata.useDataHookForCashOut ? "true" : "false");
        emit log_named_address("Data hook", metadata.dataHook);
    }
}
```

**Step 5: Verify all compile**

```bash
forge build
```

**Step 6: Commit**

```bash
git add script/query/
git commit -m "feat: add query scripts (ProjectState, Surplus, TokenBalance, CurrentRuleset)"
```

---

### Task 11: Network profiles

**Files:**
- Create: `nana-cli-v6/profiles/local.toml`
- Create: `nana-cli-v6/profiles/ethereum.toml`
- Create: `nana-cli-v6/profiles/optimism.toml`
- Create: `nana-cli-v6/profiles/base.toml`
- Create: `nana-cli-v6/profiles/arbitrum.toml`

**Step 1: Create profiles directory with placeholder configs**

Each profile follows this format. Contract addresses will be populated from deploy-all-v6 deployment artifacts once V6 is deployed.

`profiles/local.toml`:
```toml
[network]
name = "local"
chain_id = 31337
rpc_url = "http://localhost:8545"
fork_url = "https://eth.llamarpc.com"

[contracts]
# Populated by deploying on anvil fork
# JB_DIRECTORY = "0x..."
# JB_CONTROLLER = "0x..."
# JB_TERMINAL = "0x..."
# JB_PERMISSIONS = "0x..."
# JB_PROJECTS = "0x..."
# JB_TOKENS = "0x..."
# JB_SPLITS = "0x..."
# JB_PRICES = "0x..."
# JB_RULESETS = "0x..."
# REV_DEPLOYER = "0x..."
# REV_LOANS = "0x..."
```

`profiles/ethereum.toml`:
```toml
[network]
name = "ethereum"
chain_id = 1
rpc_url = "https://eth.llamarpc.com"

[contracts]
# Populated from deploy-all-v6 deployment artifacts
# JB_DIRECTORY = "0x..."
# JB_CONTROLLER = "0x..."
# JB_TERMINAL = "0x..."
# JB_PERMISSIONS = "0x..."
# JB_PROJECTS = "0x..."
# JB_TOKENS = "0x..."
# JB_SPLITS = "0x..."
# JB_PRICES = "0x..."
# JB_RULESETS = "0x..."
# REV_DEPLOYER = "0x..."
# REV_LOANS = "0x..."
```

`profiles/optimism.toml`:
```toml
[network]
name = "optimism"
chain_id = 10
rpc_url = "https://optimism.llamarpc.com"

[contracts]
# Populated from deploy-all-v6 deployment artifacts
```

`profiles/base.toml`:
```toml
[network]
name = "base"
chain_id = 8453
rpc_url = "https://base.llamarpc.com"

[contracts]
# Populated from deploy-all-v6 deployment artifacts
```

`profiles/arbitrum.toml`:
```toml
[network]
name = "arbitrum"
chain_id = 42161
rpc_url = "https://arbitrum.llamarpc.com"

[contracts]
# Populated from deploy-all-v6 deployment artifacts
```

**Step 2: Commit**

```bash
git add profiles/
git commit -m "feat: add network profiles (local, ethereum, optimism, base, arbitrum)"
```

---

### Task 12: Shell CLI dispatcher

**Files:**
- Create: `nana-cli-v6/cli/jb`

**Step 1: Write the shell CLI**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── nana-cli-v6 ──
# Thin dispatcher: maps subcommands to forge scripts.
# Usage: jb <command> [--flag value ...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILES_DIR="$SCRIPT_DIR/profiles"

# ── Defaults ──
CHAIN="${JB_CHAIN:-ethereum}"
BROADCAST=""
RPC_URL=""
EXTRA_FORGE_ARGS=()

# ── Command → script mapping ──
declare -A COMMANDS=(
    # Core
    [pay]="core/Pay.s.sol"
    [cashout]="core/CashOut.s.sol"
    [send-payouts]="core/SendPayouts.s.sol"
    [use-allowance]="core/UseAllowance.s.sol"
    [add-to-balance]="core/AddToBalance.s.sol"
    [launch-project]="core/LaunchProject.s.sol"
    [queue-ruleset]="core/QueueRuleset.s.sol"
    [mint-tokens]="core/MintTokens.s.sol"
    [burn-tokens]="core/BurnTokens.s.sol"
    [claim-tokens]="core/ClaimTokens.s.sol"
    [set-splits]="core/SetSplits.s.sol"
    [set-permissions]="core/SetPermissions.s.sol"
    [send-reserved-tokens]="core/SendReservedTokens.s.sol"
    [process-held-fees]="core/ProcessHeldFees.s.sol"
    # Revnet
    [deploy-revnet]="revnet/DeployRevnet.s.sol"
    [borrow]="revnet/BorrowFrom.s.sol"
    [repay-loan]="revnet/RepayLoan.s.sol"
    [reallocate-collateral]="revnet/ReallocateCollateral.s.sol"
    # NFT
    [adjust-tiers]="nft/AdjustTiers.s.sol"
    [mint-reserved-nfts]="nft/MintReserved.s.sol"
    [set-discount-percent]="nft/SetDiscountPercent.s.sol"
    # Cross-chain
    [prepare-bridge]="cross-chain/Prepare.s.sol"
    [claim-bridge]="cross-chain/Claim.s.sol"
    [deploy-suckers]="cross-chain/DeploySuckers.s.sol"
    # Defifa
    [launch-game]="defifa/LaunchGame.s.sol"
    [submit-scorecard]="defifa/SubmitScorecard.s.sol"
    [attest-scorecard]="defifa/AttestScorecard.s.sol"
    # Query
    [query:project]="query/ProjectState.s.sol"
    [query:surplus]="query/Surplus.s.sol"
    [query:balance]="query/TokenBalance.s.sol"
    [query:ruleset]="query/CurrentRuleset.s.sol"
)

# ── Flag → env var mapping ──
declare -A FLAG_TO_ENV=(
    [--project]="PROJECT_ID"
    [--amount]="AMOUNT"
    [--token]="TOKEN"
    [--beneficiary]="BENEFICIARY"
    [--min-tokens]="MIN_TOKENS"
    [--memo]="MEMO"
    [--metadata]="METADATA"
    [--cash-out-count]="CASH_OUT_COUNT"
    [--min-reclaimed]="MIN_RECLAIMED"
    [--currency]="CURRENCY"
    [--min-tokens-out]="MIN_TOKENS_OUT"
    [--owner]="OWNER"
    [--project-uri]="PROJECT_URI"
    [--config]="CONFIG_PATH"
    [--token-count]="TOKEN_COUNT"
    [--holder]="HOLDER"
    [--ruleset-id]="RULESET_ID"
    [--operator]="OPERATOR"
    [--permission-ids]="PERMISSION_IDS"
    [--count]="COUNT"
    [--revnet-id]="REVNET_ID"
    [--collateral-count]="COLLATERAL_COUNT"
    [--min-borrow-amount]="MIN_BORROW_AMOUNT"
    [--prepaid-fee-percent]="PREPAID_FEE_PERCENT"
    [--loan-id]="LOAN_ID"
    [--max-repay-amount]="MAX_REPAY_AMOUNT"
    [--hook]="HOOK"
    [--tier-id]="TIER_ID"
    [--discount-percent]="DISCOUNT_PERCENT"
    [--sucker]="SUCKER"
    [--game-id]="GAME_ID"
    [--scorecard-id]="SCORECARD_ID"
    [--governor]="GOVERNOR"
    [--defifa-deployer]="DEFIFA_DEPLOYER"
    [--fee-beneficiary]="FEE_BENEFICIARY"
    [--should-return-fees]="SHOULD_RETURN_FEES"
    [--use-reserved-percent]="USE_RESERVED_PERCENT"
)

# ── Parse amount suffixes ──
parse_amount() {
    local val="$1"
    case "$val" in
        *ether) echo $(echo "${val%ether} * 1000000000000000000" | bc) ;;
        *gwei)  echo $(echo "${val%gwei} * 1000000000" | bc) ;;
        *e*)    printf "%.0f" "$val" ;;
        *)      echo "$val" ;;
    esac
}

# ── Load profile ──
load_profile() {
    local profile_file="$PROFILES_DIR/$CHAIN.toml"
    if [[ ! -f "$profile_file" ]]; then
        echo "Error: Unknown chain '$CHAIN'. Available: $(ls "$PROFILES_DIR" | sed 's/.toml//g' | tr '\n' ' ')" >&2
        exit 1
    fi

    # Parse TOML [contracts] section and export as env vars
    local in_contracts=false
    while IFS= read -r line; do
        if [[ "$line" =~ ^\[contracts\] ]]; then
            in_contracts=true
            continue
        fi
        if [[ "$line" =~ ^\[ ]]; then
            in_contracts=false
            continue
        fi
        if $in_contracts && [[ "$line" =~ ^([A-Z_]+)[[:space:]]*=[[:space:]]*\"(.+)\" ]]; then
            export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
        fi
    done < "$profile_file"

    # Set RPC URL from profile if not overridden
    if [[ -z "$RPC_URL" ]]; then
        RPC_URL=$(grep -E '^rpc_url' "$profile_file" | sed 's/.*= *"\(.*\)"/\1/' || true)
    fi
}

# ── Usage ──
usage() {
    echo "Usage: jb <command> [flags]"
    echo ""
    echo "Commands:"
    echo "  Core:        pay, cashout, send-payouts, use-allowance, add-to-balance"
    echo "               launch-project, queue-ruleset, mint-tokens, burn-tokens, claim-tokens"
    echo "               set-splits, set-permissions, send-reserved-tokens, process-held-fees"
    echo "  Revnet:      deploy-revnet, borrow, repay-loan, reallocate-collateral"
    echo "  NFT:         adjust-tiers, mint-reserved-nfts, set-discount-percent"
    echo "  Cross-chain: prepare-bridge, claim-bridge, deploy-suckers"
    echo "  Defifa:      launch-game, submit-scorecard, attest-scorecard"
    echo "  Query:       query:project, query:surplus, query:balance, query:ruleset"
    echo ""
    echo "Global flags:"
    echo "  --chain <name>       Network profile (default: ethereum)"
    echo "  --broadcast          Send transaction (default: dry-run)"
    echo "  --rpc-url <url>      Override RPC URL"
    echo "  --private-key <key>  Signing key"
    echo "  --ledger             Use Ledger hardware wallet"
    echo "  --trezor             Use Trezor hardware wallet"
    echo "  --keystore <path>    Use keystore file"
    exit 0
}

# ── Main ──
[[ $# -eq 0 ]] && usage

COMMAND="$1"
shift

if [[ -z "${COMMANDS[$COMMAND]+x}" ]]; then
    echo "Error: Unknown command '$COMMAND'" >&2
    echo "Run 'jb' with no args to see available commands." >&2
    exit 1
fi

SCRIPT_FILE="${COMMANDS[$COMMAND]}"

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --chain)      CHAIN="$2"; shift 2 ;;
        --broadcast)  BROADCAST="--broadcast"; shift ;;
        --rpc-url)    RPC_URL="$2"; shift 2 ;;
        --private-key)  EXTRA_FORGE_ARGS+=("--private-key" "$2"); shift 2 ;;
        --ledger)       EXTRA_FORGE_ARGS+=("--ledger"); shift ;;
        --trezor)       EXTRA_FORGE_ARGS+=("--trezor"); shift ;;
        --keystore)     EXTRA_FORGE_ARGS+=("--keystore" "$2"); shift 2 ;;
        --help|-h)      usage ;;
        *)
            if [[ -n "${FLAG_TO_ENV[$1]+x}" ]]; then
                ENV_VAR="${FLAG_TO_ENV[$1]}"
                VALUE="$2"
                # Parse amount suffixes for amount-like vars
                if [[ "$ENV_VAR" =~ AMOUNT|COUNT|MIN_ ]]; then
                    VALUE=$(parse_amount "$VALUE")
                fi
                export "$ENV_VAR=$VALUE"
                shift 2
            else
                echo "Error: Unknown flag '$1'" >&2
                exit 1
            fi
            ;;
    esac
done

# Load profile (sets contract addresses and RPC URL)
load_profile

# Build forge command
FORGE_CMD=(
    forge script
    "$SCRIPT_DIR/script/$SCRIPT_FILE"
    --rpc-url "$RPC_URL"
)

[[ -n "$BROADCAST" ]] && FORGE_CMD+=("--broadcast")
FORGE_CMD+=("${EXTRA_FORGE_ARGS[@]}")

# Run
exec "${FORGE_CMD[@]}"
```

**Step 2: Make executable**

```bash
chmod +x cli/jb
```

**Step 3: Commit**

```bash
git add cli/
git commit -m "feat: add shell CLI dispatcher (jb)"
```

---

### Task 13: MCP server

**Files:**
- Create: `nana-cli-v6/mcp/package.json`
- Create: `nana-cli-v6/mcp/server.ts`
- Create: `nana-cli-v6/mcp/tsconfig.json`

**Step 1: Write mcp/package.json**

```json
{
    "name": "@bananapus/jb-cli-mcp",
    "version": "0.0.1",
    "description": "MCP server for Juicebox V6 CLI",
    "main": "dist/server.js",
    "bin": {
        "jb-mcp": "./dist/server.js"
    },
    "scripts": {
        "build": "tsc",
        "start": "node dist/server.js"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "^1.0.0"
    },
    "devDependencies": {
        "typescript": "^5.3.0",
        "@types/node": "^20.0.0"
    }
}
```

**Step 2: Write mcp/tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "Node16",
        "moduleResolution": "Node16",
        "outDir": "./dist",
        "rootDir": "./",
        "strict": true,
        "esModuleInterop": true,
        "declaration": true,
        "sourceMap": true
    },
    "include": ["*.ts"]
}
```

**Step 3: Write mcp/server.ts**

This is a complete MCP server. It maps each tool to a `forge script` invocation.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(ROOT, "profiles");

// ── Profile loader ──
function loadProfile(chain: string): Record<string, string> {
    const profilePath = join(PROFILES_DIR, `${chain}.toml`);
    const content = readFileSync(profilePath, "utf-8");
    const env: Record<string, string> = {};

    let inContracts = false;
    for (const line of content.split("\n")) {
        if (line.trim() === "[contracts]") { inContracts = true; continue; }
        if (line.startsWith("[")) { inContracts = false; continue; }
        if (inContracts) {
            const match = line.match(/^(\w+)\s*=\s*"(.+)"/);
            if (match) env[match[1]] = match[2];
        }
        const rpcMatch = line.match(/^rpc_url\s*=\s*"(.+)"/);
        if (rpcMatch) env._RPC_URL = rpcMatch[1];
    }
    return env;
}

// ── Forge runner ──
function runForgeScript(
    scriptPath: string,
    envVars: Record<string, string>,
    chain: string,
    broadcast: boolean
): string {
    const profile = loadProfile(chain);
    const env = { ...process.env, ...profile, ...envVars };
    const rpcUrl = envVars.RPC_URL || profile._RPC_URL || "http://localhost:8545";

    const cmd = [
        "forge", "script",
        join(ROOT, "script", scriptPath),
        "--rpc-url", rpcUrl,
        ...(broadcast ? ["--broadcast"] : []),
    ].join(" ");

    try {
        const output = execSync(cmd, {
            cwd: ROOT,
            env: env as NodeJS.ProcessEnv,
            encoding: "utf-8",
            timeout: 120_000,
        });
        return output;
    } catch (e: any) {
        return `Error: ${e.stderr || e.message}`;
    }
}

// ── Tool definitions ──
interface ToolDef {
    name: string;
    description: string;
    script: string;
    params: Record<string, { env: string; required?: boolean; description: string }>;
}

const TOOLS: ToolDef[] = [
    {
        name: "jb_pay",
        description: "Pay a Juicebox project",
        script: "core/Pay.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            amount: { env: "AMOUNT", required: true, description: "Amount in wei" },
            token: { env: "TOKEN", description: "Token address (default: native ETH)" },
            beneficiary: { env: "BENEFICIARY", description: "Token recipient (default: sender)" },
            minTokens: { env: "MIN_TOKENS", description: "Min tokens to receive (default: 0)" },
            memo: { env: "MEMO", description: "Memo string" },
        },
    },
    {
        name: "jb_cashout",
        description: "Cash out project tokens",
        script: "core/CashOut.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            cashOutCount: { env: "CASH_OUT_COUNT", required: true, description: "Tokens to cash out" },
            token: { env: "TOKEN", description: "Token to reclaim (default: native ETH)" },
            beneficiary: { env: "BENEFICIARY", description: "Reclaim recipient" },
            minReclaimed: { env: "MIN_RECLAIMED", description: "Min reclaim amount" },
        },
    },
    {
        name: "jb_send_payouts",
        description: "Distribute payouts to splits",
        script: "core/SendPayouts.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            amount: { env: "AMOUNT", required: true, description: "Amount to distribute" },
            currency: { env: "CURRENCY", required: true, description: "Currency for limit lookup" },
            token: { env: "TOKEN", description: "Token to distribute" },
        },
    },
    {
        name: "jb_use_allowance",
        description: "Withdraw from surplus allowance",
        script: "core/UseAllowance.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            amount: { env: "AMOUNT", required: true, description: "Amount to withdraw" },
            currency: { env: "CURRENCY", required: true, description: "Currency for limit lookup" },
            token: { env: "TOKEN", description: "Token to withdraw" },
            beneficiary: { env: "BENEFICIARY", description: "Funds recipient" },
        },
    },
    {
        name: "jb_add_to_balance",
        description: "Add funds without minting tokens",
        script: "core/AddToBalance.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            amount: { env: "AMOUNT", required: true, description: "Amount to add" },
            token: { env: "TOKEN", description: "Token to add" },
            shouldReturnFees: { env: "SHOULD_RETURN_FEES", description: "Return held fees (default: false)" },
        },
    },
    {
        name: "jb_launch_project",
        description: "Launch a new Juicebox project",
        script: "core/LaunchProject.s.sol",
        params: {
            owner: { env: "OWNER", required: true, description: "Project owner address" },
            projectUri: { env: "PROJECT_URI", required: true, description: "Metadata URI" },
            configPath: { env: "CONFIG_PATH", required: true, description: "Path to JSON config" },
        },
    },
    {
        name: "jb_queue_ruleset",
        description: "Queue a new ruleset",
        script: "core/QueueRuleset.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            configPath: { env: "CONFIG_PATH", required: true, description: "Path to JSON config" },
        },
    },
    {
        name: "jb_mint_tokens",
        description: "Mint project tokens (owner)",
        script: "core/MintTokens.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            tokenCount: { env: "TOKEN_COUNT", required: true, description: "Tokens to mint" },
            beneficiary: { env: "BENEFICIARY", required: true, description: "Token recipient" },
        },
    },
    {
        name: "jb_burn_tokens",
        description: "Burn project tokens",
        script: "core/BurnTokens.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            tokenCount: { env: "TOKEN_COUNT", required: true, description: "Tokens to burn" },
        },
    },
    {
        name: "jb_claim_tokens",
        description: "Convert credits to ERC-20",
        script: "core/ClaimTokens.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            amount: { env: "AMOUNT", required: true, description: "Credits to claim" },
        },
    },
    {
        name: "jb_set_permissions",
        description: "Grant permissions to an operator",
        script: "core/SetPermissions.s.sol",
        params: {
            operator: { env: "OPERATOR", required: true, description: "Operator address" },
            projectId: { env: "PROJECT_ID", required: true, description: "Project scope (0=wildcard)" },
            permissionIds: { env: "PERMISSION_IDS", required: true, description: "Comma-separated permission IDs" },
        },
    },
    {
        name: "jb_send_reserved_tokens",
        description: "Distribute pending reserved tokens",
        script: "core/SendReservedTokens.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
        },
    },
    {
        name: "jb_deploy_revnet",
        description: "Deploy a revnet",
        script: "revnet/DeployRevnet.s.sol",
        params: {
            revnetId: { env: "REVNET_ID", required: true, description: "Revnet ID (0=auto)" },
            configPath: { env: "CONFIG_PATH", required: true, description: "Path to JSON config" },
        },
    },
    {
        name: "jb_borrow",
        description: "Borrow against revnet token collateral",
        script: "revnet/BorrowFrom.s.sol",
        params: {
            revnetId: { env: "REVNET_ID", required: true, description: "Revnet ID" },
            collateralCount: { env: "COLLATERAL_COUNT", required: true, description: "Collateral tokens" },
            token: { env: "TOKEN", description: "Token to borrow" },
        },
    },
    {
        name: "jb_repay_loan",
        description: "Repay a revnet loan",
        script: "revnet/RepayLoan.s.sol",
        params: {
            loanId: { env: "LOAN_ID", required: true, description: "Loan ID to repay" },
        },
    },
    {
        name: "jb_reallocate_collateral",
        description: "Move collateral between loans",
        script: "revnet/ReallocateCollateral.s.sol",
        params: {
            loanId: { env: "LOAN_ID", required: true, description: "Source loan ID" },
            collateralCountToTransfer: { env: "COLLATERAL_COUNT_TO_TRANSFER", required: true, description: "Collateral to move" },
            revnetId: { env: "REVNET_ID", required: true, description: "Revnet ID" },
        },
    },
    {
        name: "jb_query_project",
        description: "Query full project state",
        script: "query/ProjectState.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
        },
    },
    {
        name: "jb_query_surplus",
        description: "Query current project surplus",
        script: "query/Surplus.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            token: { env: "TOKEN", description: "Token (default: ETH)" },
        },
    },
    {
        name: "jb_query_balance",
        description: "Query token balances for a holder",
        script: "query/TokenBalance.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
            holder: { env: "HOLDER", required: true, description: "Holder address" },
        },
    },
    {
        name: "jb_query_ruleset",
        description: "Query current active ruleset",
        script: "query/CurrentRuleset.s.sol",
        params: {
            projectId: { env: "PROJECT_ID", required: true, description: "Project ID" },
        },
    },
];

// ── Server setup ──
const server = new McpServer({
    name: "juicebox-v6",
    version: "0.0.1",
});

// Register all tools
for (const tool of TOOLS) {
    const shape: Record<string, any> = {
        chain: z.string().default("ethereum").describe("Network (ethereum, optimism, base, arbitrum, local)"),
        broadcast: z.boolean().default(false).describe("Send transaction (default: simulate)"),
    };
    for (const [key, param] of Object.entries(tool.params)) {
        shape[key] = param.required
            ? z.string().describe(param.description)
            : z.string().optional().describe(param.description);
    }

    server.tool(tool.name, tool.description, shape, async (args: Record<string, any>) => {
        const envVars: Record<string, string> = {};
        for (const [key, param] of Object.entries(tool.params)) {
            if (args[key] !== undefined) {
                envVars[param.env] = String(args[key]);
            }
        }

        const output = runForgeScript(tool.script, envVars, args.chain, args.broadcast);
        return { content: [{ type: "text" as const, text: output }] };
    });
}

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 4: Install and build**

```bash
cd mcp && npm install && npm run build && cd ..
```

**Step 5: Commit**

```bash
git add mcp/
git commit -m "feat: add MCP server for AI agent integration"
```

---

### Task 14: Claude Code skill

**Files:**
- Create: `nana-cli-v6/skills/jb-cli.md`

**Step 1: Write the skill file**

```markdown
---
name: jb-cli
description: Execute Juicebox V6 protocol operations. Use when the user wants to pay a project, deploy a revnet, cash out tokens, manage rulesets, bridge cross-chain, or query protocol state.
---

# Juicebox V6 CLI

Execute Juicebox V6 protocol operations via Forge scripts.

## Available MCP Tools

All tools accept `chain` (default: "ethereum") and `broadcast` (default: false).

### Core Operations
| Tool | Description | Required Params |
|------|------------|----------------|
| jb_pay | Pay a project | projectId, amount |
| jb_cashout | Cash out tokens | projectId, cashOutCount |
| jb_send_payouts | Distribute payouts | projectId, amount, currency |
| jb_use_allowance | Withdraw surplus | projectId, amount, currency |
| jb_add_to_balance | Add funds (no mint) | projectId, amount |
| jb_launch_project | Launch project | owner, projectUri, configPath |
| jb_queue_ruleset | Queue ruleset | projectId, configPath |
| jb_mint_tokens | Owner mint | projectId, tokenCount, beneficiary |
| jb_burn_tokens | Burn tokens | projectId, tokenCount |
| jb_claim_tokens | Credits to ERC-20 | projectId, amount |
| jb_set_permissions | Grant permissions | operator, projectId, permissionIds |
| jb_send_reserved_tokens | Distribute reserved | projectId |

### Revnet
| Tool | Description | Required Params |
|------|------------|----------------|
| jb_deploy_revnet | Deploy revnet | revnetId, configPath |
| jb_borrow | Take loan | revnetId, collateralCount |
| jb_repay_loan | Repay loan | loanId |
| jb_reallocate_collateral | Move collateral | loanId, collateralCountToTransfer, revnetId |

### Query
| Tool | Description | Required Params |
|------|------------|----------------|
| jb_query_project | Full project state | projectId |
| jb_query_surplus | Current surplus | projectId |
| jb_query_balance | Token balances | projectId, holder |
| jb_query_ruleset | Active ruleset | projectId |

## Conventions
- Amounts in wei (e.g., "1000000000000000000" for 1 ETH)
- Token address `0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe` = native ETH
- broadcast=false (default) simulates; broadcast=true sends real transaction
- Complex configs (rulesets, splits, tiers) passed via JSON file path in configPath

## Permission IDs
ROOT=1, QUEUE_RULESETS=2, MINT_TOKENS=3, BURN_TOKENS=4, SET_TERMINALS=5,
SET_CONTROLLER=6, SET_SPLIT_GROUPS=7, SET_PROJECT_URI=8, SET_TOKEN=9,
SEND_PAYOUTS=10, ADD_PRICE_FEED=11, USE_ALLOWANCE=12, CASH_OUT_TOKENS=13,
SEND_RESERVED_TOKENS=14, TRANSFER_CREDITS=15
```

**Step 2: Commit**

```bash
git add skills/
git commit -m "feat: add Claude Code skill manifest"
```

---

### Task 15: README and push to GitHub

**Files:**
- Create: `nana-cli-v6/README.md`

**Step 1: Write README.md**

```markdown
# nana-cli-v6

CLI for Juicebox V6. Foundry-native Forge scripts with shell CLI, MCP server, and Claude Code skill surfaces.

## Quick Start

```bash
# Clone the V6 ecosystem
git clone --recursive https://github.com/Bananapus/version-6.git
cd version-6/nana-cli-v6

# Install
npm install
forge build

# Pay a project (simulation)
jb pay --project 1 --amount 1ether --chain ethereum

# Pay for real
jb pay --project 1 --amount 1ether --chain ethereum --broadcast --private-key $KEY
```

## Architecture

```
Forge Scripts (Solidity)           <- Source of truth
    |           |           |
Shell CLI    MCP Server    Claude Code Skills
(bash)       (Node)        (.md)
```

## Commands

### Core
```
pay, cashout, send-payouts, use-allowance, add-to-balance,
launch-project, queue-ruleset, mint-tokens, burn-tokens, claim-tokens,
set-splits, set-permissions, send-reserved-tokens, process-held-fees
```

### Revnet
```
deploy-revnet, borrow, repay-loan, reallocate-collateral
```

### NFT
```
adjust-tiers, mint-reserved-nfts, set-discount-percent
```

### Cross-Chain
```
prepare-bridge, claim-bridge, deploy-suckers
```

### Defifa
```
launch-game, submit-scorecard, attest-scorecard
```

### Query
```
query:project, query:surplus, query:balance, query:ruleset
```

## MCP Server

For AI agents (Claude Code, etc.):

```json
{
  "mcpServers": {
    "juicebox": {
      "command": "npx",
      "args": ["@bananapus/jb-cli-mcp"]
    }
  }
}
```

## Direct Forge Script Usage

```bash
PROJECT_ID=1 AMOUNT=1000000000000000000 \
  JB_DIRECTORY=0x... JB_CONTROLLER=0x... \
  forge script script/core/Pay.s.sol --rpc-url https://eth.llamarpc.com --broadcast
```
```

**Step 2: Commit and push**

```bash
git add README.md
git commit -m "feat: add README"
git remote add origin https://github.com/Bananapus/nana-cli-v6.git
git push -u origin main
```

---

### Task 16: Add as submodule to meta-repo

**Step 1: Add submodule from the meta-repo root**

```bash
cd /Users/jango/Documents/jb/v6/evm
git submodule add https://github.com/Bananapus/nana-cli-v6.git nana-cli-v6
git add .gitmodules nana-cli-v6
git commit -m "feat: add nana-cli-v6 submodule"
```
