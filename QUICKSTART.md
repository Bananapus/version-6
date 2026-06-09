# Juicebox V6 Developer Quick-Start

## Launch a Project in 10 Minutes

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) installed
- Node.js >= 20

### 1. Create a New Project

```bash
mkdir my-jb-project && cd my-jb-project
forge init --no-commit
npm init -y
npm install @bananapus/core-v6 @openzeppelin/contracts
```

Add to `remappings.txt`:
```
@bananapus/=node_modules/@bananapus/
@openzeppelin/=node_modules/@openzeppelin/
```

### 2. Deploy Script

Create `script/Launch.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";

import {IJBController} from "@bananapus/core-v6/src/interfaces/IJBController.sol";
import {IJBMultiTerminal} from "@bananapus/core-v6/src/interfaces/IJBMultiTerminal.sol";
import {IJBRulesetApprovalHook} from "@bananapus/core-v6/src/interfaces/IJBRulesetApprovalHook.sol";

import {JBAccountingContext} from "@bananapus/core-v6/src/structs/JBAccountingContext.sol";
import {JBCurrencyAmount} from "@bananapus/core-v6/src/structs/JBCurrencyAmount.sol";
import {JBFundAccessLimitGroup} from "@bananapus/core-v6/src/structs/JBFundAccessLimitGroup.sol";
import {JBRulesetConfig} from "@bananapus/core-v6/src/structs/JBRulesetConfig.sol";
import {JBRulesetMetadata} from "@bananapus/core-v6/src/structs/JBRulesetMetadata.sol";
import {JBSplitGroup} from "@bananapus/core-v6/src/structs/JBSplitGroup.sol";
import {JBTerminalConfig} from "@bananapus/core-v6/src/structs/JBTerminalConfig.sol";
import {JBConstants} from "@bananapus/core-v6/src/libraries/JBConstants.sol";
import {JBCurrencyIds} from "@bananapus/core-v6/src/libraries/JBCurrencyIds.sol";

contract Launch is Script {
    function run() public {
        // Replace with deployed addresses for your chain.
        IJBController controller = IJBController(vm.envAddress("JB_CONTROLLER"));
        IJBMultiTerminal terminal = IJBMultiTerminal(vm.envAddress("JB_TERMINAL"));
        address owner = vm.envAddress("PROJECT_OWNER");

        vm.startBroadcast();

        // Configure the first ruleset.
        JBRulesetConfig[] memory rulesets = new JBRulesetConfig[](1);
        rulesets[0] = JBRulesetConfig({
            mustStartAtOrAfter: 0,
            duration: 30 days,                    // 30-day funding cycles
            weight: 1_000_000e18,                 // 1M tokens per ETH
            weightCutPercent: 100_000_000,        // 10% issuance decay per cycle
            approvalHook: IJBRulesetApprovalHook(address(0)),
            metadata: JBRulesetMetadata({
                reservedPercent: 2000,             // 20% reserved for splits
                cashOutTaxRate: 4000,              // 40% tax on cash outs
                // baseCurrency is a standard currency id (ETH=1, USD=2), NOT a token-keyed value —
                // it keeps the ruleset portable across chains. Contrast with the accounting-context
                // `currency` below, which is token-keyed (`uint32(uint160(token))`). See
                // ARCHITECTURE.md "Currency model" and references/types-errors-events.md.
                baseCurrency: uint32(JBCurrencyIds.ETH),
                pausePay: false,
                pauseCreditTransfers: false,
                allowOwnerMinting: false,
                allowSetCustomToken: true,
                allowTerminalMigration: false,
                allowSetTerminals: false,
                allowSetController: false,
                allowAddAccountingContext: false,
                allowAddPriceFeed: false,
                ownerMustSendPayouts: false,
                holdFees: false,
                scopeCashOutsToLocalBalances: false,
                useDataHookForPay: false,
                useDataHookForCashOut: false,
                dataHook: address(0),
                metadata: 0
            }),
            splitGroups: new JBSplitGroup[](0),
            fundAccessLimitGroups: new JBFundAccessLimitGroup[](0)
        });

        // Accept ETH payments.
        JBAccountingContext[] memory contexts = new JBAccountingContext[](1);
        contexts[0] = JBAccountingContext({
            token: JBConstants.NATIVE_TOKEN,
            decimals: 18,
            currency: uint32(uint160(JBConstants.NATIVE_TOKEN))
        });

        JBTerminalConfig[] memory terminals = new JBTerminalConfig[](1);
        terminals[0] = JBTerminalConfig({
            terminal: terminal,
            accountingContextsToAccept: contexts
        });

        uint256 projectId = controller.launchProjectFor(owner, "ipfs://...", rulesets, terminals, "");
        // solhint-disable-next-line no-console
        // console.log("Project ID:", projectId);

        vm.stopBroadcast();
    }
}
```

### 3. Key Configuration Reference

| Parameter | Range | Description |
|-----------|-------|-------------|
| `weight` | 0 = no issuance, 1 = inherit decayed | Tokens minted per unit paid |
| `weightCutPercent` | 0-1,000,000,000 (9 decimals) | Issuance decay per cycle |
| `reservedPercent` | 0-10,000 (basis points) | % of minted tokens reserved for splits |
| `cashOutTaxRate` | 0-10,000 (basis points) | Tax on cash outs (0 = full reclaim) |
| `duration` | seconds (0 = never expires) | Funding cycle length |

### 4. Common Operations

**Pay a project:**
```solidity
terminal.pay{value: 1 ether}({
    projectId: PROJECT_ID,
    token: JBConstants.NATIVE_TOKEN,
    amount: 1 ether,
    beneficiary: msg.sender,
    minReturnedTokens: 0,
    memo: "First contribution",
    metadata: ""
});
```

**Cash out tokens:**
```solidity
terminal.cashOutTokensOf({
    holder: msg.sender,
    projectId: PROJECT_ID,
    cashOutCount: tokenAmount,
    tokenToReclaim: JBConstants.NATIVE_TOKEN,
    minTokensReclaimed: 0,
    beneficiary: payable(msg.sender),
    metadata: ""
});
```

**Send payouts:**
```solidity
terminal.sendPayoutsOf({
    projectId: PROJECT_ID,
    token: JBConstants.NATIVE_TOKEN,
    amount: 5 ether,
    currency: uint256(uint160(JBConstants.NATIVE_TOKEN)),
    minTokensPaidOut: 0
});
```

**Deploy an ERC-20 for the project:**
```solidity
IJBToken token = controller.deployERC20For(PROJECT_ID, "My Token", "MTK", bytes32(0));
```

---

## Hook Development Guide

Hooks let you extend Juicebox projects with custom logic that runs during payments and cash outs.

### Hook Types

| Hook | Interface | When it runs |
|------|-----------|-------------|
| **Pay Hook** | `IJBPayHook` | After a payment is recorded |
| **Cash Out Hook** | `IJBCashOutHook` | After a cash out is recorded |
| **Data Hook** | `IJBRulesetDataHook` | Before payment/cash out recording (can modify weight, tax rate, redirect funds) |
| **Split Hook** | `IJBSplitHook` | When payout splits are distributed |

### Minimal Pay Hook

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IJBPayHook} from "@bananapus/core-v6/src/interfaces/IJBPayHook.sol";
import {JBAfterPayRecordedContext} from "@bananapus/core-v6/src/structs/JBAfterPayRecordedContext.sol";

/// @notice Emits an event for every payment. Replace with your custom logic.
contract MyPayHook is ERC165, IJBPayHook {
    event PaymentReceived(
        uint256 indexed projectId, address indexed payer, uint256 amount, uint256 tokensMinted
    );

    function afterPayRecordedWith(JBAfterPayRecordedContext calldata context) external payable override {
        emit PaymentReceived(
            context.projectId, context.payer, context.amount.value, context.newlyIssuedTokenCount
        );

        // Your custom logic here. Examples:
        // - Mint NFTs to the payer
        // - Update a leaderboard
        // - Trigger an airdrop
        // - Forward funds to another protocol
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IJBPayHook).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

### Minimal Cash Out Hook

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IJBCashOutHook} from "@bananapus/core-v6/src/interfaces/IJBCashOutHook.sol";
import {JBAfterCashOutRecordedContext} from "@bananapus/core-v6/src/structs/JBAfterCashOutRecordedContext.sol";

/// @notice Logs cash outs. Replace with your custom logic.
contract MyCashOutHook is ERC165, IJBCashOutHook {
    event CashOut(uint256 indexed projectId, address indexed holder, uint256 count, uint256 reclaimed);

    function afterCashOutRecordedWith(JBAfterCashOutRecordedContext calldata context) external payable override {
        emit CashOut(
            context.projectId, context.holder, context.cashOutCount, context.reclaimedAmount.value
        );
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IJBCashOutHook).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

### Data Hook (Controls Issuance + Routes Funds)

A data hook is more powerful — it runs **before** the payment/cash out and can:
- Override the token issuance weight
- Redirect funds to pay/cash out hooks
- Override the cash out tax rate

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IJBRulesetDataHook} from "@bananapus/core-v6/src/interfaces/IJBRulesetDataHook.sol";
import {JBBeforePayRecordedContext} from "@bananapus/core-v6/src/structs/JBBeforePayRecordedContext.sol";
import {JBBeforeCashOutRecordedContext} from "@bananapus/core-v6/src/structs/JBBeforeCashOutRecordedContext.sol";
import {JBPayHookSpecification} from "@bananapus/core-v6/src/structs/JBPayHookSpecification.sol";
import {JBCashOutHookSpecification} from "@bananapus/core-v6/src/structs/JBCashOutHookSpecification.sol";
import {JBRuleset} from "@bananapus/core-v6/src/structs/JBRuleset.sol";

/// @notice Example data hook that doubles token issuance for payments > 1 ETH.
contract MyDataHook is ERC165, IJBRulesetDataHook {
    function beforePayRecordedWith(JBBeforePayRecordedContext calldata context)
        external
        view
        override
        returns (uint256 weight, JBPayHookSpecification[] memory hookSpecifications)
    {
        // Double issuance for payments over 1 ETH.
        weight = context.amount.value > 1 ether ? context.weight * 2 : context.weight;

        // No pay hooks — return empty array.
        hookSpecifications = new JBPayHookSpecification[](0);
    }

    function beforeCashOutRecordedWith(JBBeforeCashOutRecordedContext calldata context)
        external
        view
        override
        returns (
            uint256 cashOutTaxRate,
            uint256 effectiveCashOutCount,
            uint256 effectiveTotalSupply,
            uint256 effectiveSurplusValue,
            JBCashOutHookSpecification[] memory hookSpecifications
        )
    {
        // Pass through — no modifications.
        cashOutTaxRate = context.cashOutTaxRate;
        effectiveCashOutCount = context.cashOutCount;
        effectiveTotalSupply = context.totalSupply;
        effectiveSurplusValue = context.surplus.value;
        hookSpecifications = new JBCashOutHookSpecification[](0);
    }

    function hasMintPermissionFor(uint256, JBRuleset memory, address) external pure override returns (bool) {
        return false;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IJBRulesetDataHook).interfaceId || super.supportsInterface(interfaceId);
    }
}
```

To use a data hook, set it in the ruleset metadata:
```solidity
metadata: JBRulesetMetadata({
    // ...
    useDataHookForPay: true,       // Enable for payments
    useDataHookForCashOut: false,   // Enable for cash outs
    dataHook: address(myDataHook),  // Your data hook address
    // ...
})
```

### Testing Your Hook

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {JBAfterPayRecordedContext} from "@bananapus/core-v6/src/structs/JBAfterPayRecordedContext.sol";
import {JBTokenAmount} from "@bananapus/core-v6/src/structs/JBTokenAmount.sol";
import {JBConstants} from "@bananapus/core-v6/src/libraries/JBConstants.sol";
import {MyPayHook} from "../src/MyPayHook.sol";

contract MyPayHookTest is Test {
    MyPayHook hook;

    function setUp() public {
        hook = new MyPayHook();
    }

    function test_emitsEvent() public {
        JBAfterPayRecordedContext memory context = JBAfterPayRecordedContext({
            payer: address(this),
            projectId: 1,
            rulesetId: 1,
            amount: JBTokenAmount({
                token: JBConstants.NATIVE_TOKEN,
                value: 1 ether,
                decimals: 18,
                currency: uint32(uint160(JBConstants.NATIVE_TOKEN))
            }),
            forwardedAmount: JBTokenAmount({
                token: JBConstants.NATIVE_TOKEN,
                value: 0,
                decimals: 18,
                currency: uint32(uint160(JBConstants.NATIVE_TOKEN))
            }),
            weight: 1_000_000e18,
            newlyIssuedTokenCount: 1_000_000e18,
            beneficiary: address(this),
            hookMetadata: "",
            payerMetadata: ""
        });

        vm.expectEmit(true, true, false, true);
        emit MyPayHook.PaymentReceived(1, address(this), 1 ether, 1_000_000e18);
        hook.afterPayRecordedWith(context);
    }
}
```

---

## Common Gotchas

| Gotcha | Detail |
|--------|--------|
| `controllerOf()` returns `IERC165`, not `address` | Cast it: `address(directory.controllerOf(projectId))` |
| `primaryTerminalOf()` returns `IJBTerminal` | Cast it: `address(directory.primaryTerminalOf(projectId, token))` |
| Empty `fundAccessLimitGroups` = zero payouts | Not unlimited. Use `uint224(type(uint224).max)` for unlimited |
| `weight = 1` means inherit decayed weight | Not "1 token per unit paid". `weight = 0` means no issuance |
| `baseCurrency` != accounting `currency` | baseCurrency: 1=ETH, 2=USD. currency: `uint32(uint160(tokenAddress))` |
| ERC165 is mandatory for hooks | Terminal checks `supportsInterface()` before calling hooks |
| `sendPayoutsOf` auto-caps to the remaining limit | Does NOT revert; returns 0 if none is left. Use `minTokensPaidOut` to enforce a floor |
| Fee = 2.5% on payouts leaving the terminal | Use `JBFeelessAddresses` to exempt recipients |

## Contract Addresses

See [deploy-all-v6](https://github.com/Bananapus/deploy-all-v6) for deployed addresses per chain.

## Resources

- [nana-core-v6](https://github.com/Bananapus/nana-core-v6) — Core contracts
- [deploy-all-v6](https://github.com/Bananapus/deploy-all-v6) — Deployment orchestrator
- [revnet-core-v6](https://github.com/rev-net/revnet-core-v6) — Revenue network extensions
- [nana-721-hook-v6](https://github.com/Bananapus/nana-721-hook-v6) — NFT tiered hook
