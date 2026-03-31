# Style Guide

How we write Solidity and organize repos across the Juicebox V6 ecosystem. `nana-core-v6` is the gold standard — when in doubt, match what it does.

## File Organization

```
src/
├── Contract.sol              # Main contracts in root
├── abstract/                 # Base contracts (JBPermissioned, JBControlled)
├── enums/                    # One enum per file
├── interfaces/               # One interface per file, prefixed with I
├── libraries/                # Pure/view logic, prefixed with JB
├── periphery/                # Utility contracts (deadlines, price feeds)
└── structs/                  # One struct per file, prefixed with JB
```

One contract/interface/struct/enum per file. Name the file after the type it contains.

## Pragma Versions

```solidity
// Contracts — pin to exact version
pragma solidity 0.8.28;

// Interfaces, structs, enums — caret for forward compatibility
pragma solidity ^0.8.0;

// Libraries — pin to exact version like contracts
pragma solidity 0.8.28;
```

## Imports

Named imports only. Grouped by source, alphabetized within each group:

```solidity
// External packages (alphabetized)
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {mulDiv} from "@prb/math/src/Common.sol";

// Local: abstract contracts
import {JBPermissioned} from "./abstract/JBPermissioned.sol";

// Local: interfaces (alphabetized)
import {IJBController} from "./interfaces/IJBController.sol";
import {IJBDirectory} from "./interfaces/IJBDirectory.sol";
import {IJBMultiTerminal} from "./interfaces/IJBMultiTerminal.sol";

// Local: libraries (alphabetized)
import {JBConstants} from "./libraries/JBConstants.sol";
import {JBFees} from "./libraries/JBFees.sol";

// Local: structs (alphabetized)
import {JBAccountingContext} from "./structs/JBAccountingContext.sol";
import {JBSplit} from "./structs/JBSplit.sol";
```

## Contract Structure

Section banners divide the contract into a fixed ordering. Every contract with 50+ lines uses these banners:

```solidity
/// @notice One-line description.
contract JBExample is JBPermissioned, IJBExample {
    // A library that does X.
    using SomeLib for SomeType;

    //*********************************************************************//
    // --------------------------- custom errors ------------------------- //
    //*********************************************************************//

    error JBExample_SomethingFailed(uint256 amount);

    //*********************************************************************//
    // ------------------------- public constants ------------------------ //
    //*********************************************************************//

    uint256 public constant override FEE = 25;

    //*********************************************************************//
    // ----------------------- internal constants ------------------------ //
    //*********************************************************************//

    uint256 internal constant _FEE_BENEFICIARY_PROJECT_ID = 1;

    //*********************************************************************//
    // ------------------------ private constants ------------------------ //
    //*********************************************************************//

    //*********************************************************************//
    // --------------- public immutable stored properties ---------------- //
    //*********************************************************************//

    IJBDirectory public immutable override DIRECTORY;

    //*********************************************************************//
    // -------------- internal immutable stored properties -------------- //
    //*********************************************************************//

    //*********************************************************************//
    // --------------------- public stored properties -------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // -------------------- internal stored properties ------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // -------------------- private stored properties -------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ------------------- transient stored properties ------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ---------------------------- modifiers ---------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ------------------------- receive / fallback ---------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ---------------------- external transactions ---------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ----------------------- external views ---------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // -------------------------- public views --------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ----------------------- public transactions ----------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ---------------------- internal transactions ---------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ----------------------- internal helpers -------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ----------------------- internal views ---------------------------- //
    //*********************************************************************//

    //*********************************************************************//
    // ----------------------- private helpers --------------------------- //
    //*********************************************************************//
}
```

**Section order:**
1. Custom errors
2. Public constants
3. Internal constants
4. Private constants
5. Public immutable stored properties
6. Internal immutable stored properties
7. Public stored properties
8. Internal stored properties
9. Private stored properties
10. Transient stored properties
11. Constructor
12. Modifiers
13. Receive / fallback
14. External transactions
15. External views
16. Public views
17. Public transactions
18. Internal transactions
19. Internal helpers
20. Internal views
21. Private helpers

Use these additional section labels where they better match the contents of the block:
- `internal functions` is accepted as equivalent to `internal helpers`
- `events` and `structs` are acceptable in specialized contracts that define them explicitly

Functions are alphabetized within each section.

## Interface Structure

```solidity
/// @notice One-line description.
interface IJBExample is IJBBase {
    // Events (with full NatSpec)

    /// @notice Emitted when X happens.
    /// @param projectId The ID of the project.
    /// @param amount The amount transferred.
    event SomethingHappened(uint256 indexed projectId, uint256 amount);

    // Views (alphabetized)

    /// @notice The directory of terminals and controllers.
    function DIRECTORY() external view returns (IJBDirectory);

    // State-changing functions (alphabetized)

    /// @notice Does the thing.
    /// @param projectId The ID of the project.
    /// @return result The result.
    function doThing(uint256 projectId) external returns (uint256 result);
}
```

**Rules:**
- Events first, then views, then state-changing functions
- No custom errors in interfaces — errors belong in the implementing contract
- Full NatSpec on every event, function, and parameter
- Alphabetized within each group

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Contract | PascalCase | `JBMultiTerminal` |
| Interface | `I` + PascalCase | `IJBMultiTerminal` |
| Library | PascalCase | `JBCashOuts` |
| Struct | PascalCase | `JBRulesetConfig` |
| Enum | PascalCase | `JBApprovalStatus` |
| Enum value | PascalCase | `ApprovalExpected` |
| Error | `ContractName_ErrorName` | `JBMultiTerminal_FeeTerminalNotFound` |
| Public constant | `ALL_CAPS` | `FEE`, `MAX_FEE` |
| Internal constant | `_ALL_CAPS` | `_FEE_HOLDING_SECONDS` |
| Public immutable | `ALL_CAPS` | `DIRECTORY`, `PERMISSIONS` |
| Public/external function | `camelCase` | `cashOutTokensOf` |
| Internal/private function | `_camelCase` | `_processFee` |
| Internal storage | `_camelCase` | `_accountingContextForTokenOf` |
| Function parameter | `camelCase` (no underscores) | `projectId`, `cashOutCount` |

## NatSpec

**Contracts:**
```solidity
/// @notice One-line description of what the contract does.
contract JBExample is IJBExample {
```

**Functions:**
```solidity
/// @notice Records funds being added to a project's balance.
/// @param projectId The ID of the project which funds are being added to.
/// @param token The token being added.
/// @param amount The amount added, as a fixed point number with the same decimals as the terminal.
/// @return surplus The new surplus after adding.
function recordAddedBalanceFor(
    uint256 projectId,
    address token,
    uint256 amount
) external override returns (uint256 surplus) {
```

**Structs:**
```solidity
/// @custom:member duration The number of seconds the ruleset lasts for. 0 means it never expires.
/// @custom:member weight How many tokens to mint per unit paid (18 decimals).
/// @custom:member weightCutPercent How much weight decays each cycle (9 decimals).
struct JBRulesetConfig {
    uint32 duration;
    uint112 weight;
    uint32 weightCutPercent;
}
```

**Mappings:**
```solidity
/// @notice Context describing how a token is accounted for by a project.
/// @custom:param projectId The ID of the project.
/// @custom:param token The address of the token.
mapping(uint256 projectId => mapping(address token => JBAccountingContext)) internal _accountingContextForTokenOf;
```

## Numbers

Use underscores for thousands separators:

```solidity
uint256 internal constant _FEE_HOLDING_SECONDS = 2_419_200; // 28 days
uint32 public constant MAX_WEIGHT_CUT_PERCENT = 1_000_000_000;
uint256 public constant MAX_RESERVED_PERCENT = 10_000;
```

## Function Calls

Use named arguments for all function calls with 2 or more arguments — in both `src/` and `script/`:

```solidity
// Good — named arguments
token.mint({account: beneficiary, amount: count});
_transferOwnership({newOwner: address(0), projectId: 0});
PERMISSIONS.hasPermission({
    operator: sender,
    account: account,
    projectId: projectId,
    permissionId: permissionId,
    includeRoot: true,
    includeWildcardProjectId: true
});

// Bad — positional arguments with 2+ args
token.mint(beneficiary, count);
_transferOwnership(address(0), 0);
```

Single-argument calls use positional style: `_burn(amount)`.

This also applies to constructor calls, struct literals, and inherited/library calls (e.g., OZ `_mint`, `_safeMint`, `safeTransfer`, `allowance`, `Clones.cloneDeterministic`).

Named argument keys must use **camelCase** — never underscores. If a function's parameter names use underscores, rename them to camelCase first.

## Multiline Signatures

```solidity
function recordCashOutFor(
    address holder,
    uint256 projectId,
    uint256 cashOutCount,
    JBAccountingContext calldata accountingContext
)
    external
    override
    returns (
        JBRuleset memory ruleset,
        uint256 reclaimAmount,
        JBCashOutHookSpecification[] memory hookSpecifications
    )
{
```

Modifiers and return types go on their own indented lines.

## Error Handling

- Validate inputs with explicit `revert` + custom error
- Use `try-catch` only for external calls to untrusted contracts (hooks, fee processing)
- Always include relevant context in error parameters

```solidity
// Direct validation
if (amount > limit) revert JBTerminalStore_InadequateControllerPayoutLimit(amount, limit);

// External call to untrusted hook
try hook.afterPayRecordedWith(context) {} catch (bytes memory reason) {
    emit HookAfterPayReverted(hook, context, reason, _msgSender());
}
```

---

## DevOps

### foundry.toml

Standard config across all repos:

```toml
[profile.default]
solc = '0.8.28'
evm_version = 'cancun'
optimizer_runs = 200
libs = ["node_modules", "lib"]
fs_permissions = [{ access = "read-write", path = "./"}]

[fuzz]
runs = 4096

[invariant]
runs = 1024
depth = 100
fail_on_revert = false

[fmt]
number_underscore = "thousands"
multiline_func_header = "all"
wrap_comments = true
```

**Optional sections (add only when needed):**
- `[rpc_endpoints]` — repos with fork tests. Maps named endpoints to env vars (e.g. `ethereum = "${RPC_ETHEREUM_MAINNET}"`).
- `[profile.ci_sizes]` — only when CI needs different optimizer settings than defaults for the size check step (e.g. `optimizer_runs = 200` when the default profile uses a lower value).

**Common variations:**
- `via_ir = true` when hitting stack-too-deep
- `optimizer = false` when optimization causes stack-too-deep
- `optimizer_runs` reduced when deep struct nesting causes stack-too-deep at 200 runs

### CI Workflows

Every repo has at minimum `test.yml` and `lint.yml`:

**test.yml:**
```yaml
name: test
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  forge-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-node@v4
        with:
          node-version: 22.4.x
      - name: Install npm dependencies
        run: npm install --omit=dev
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
      - name: Run tests
        run: forge test --fail-fast --summary --detailed --skip "*/script/**"
        env:
          RPC_ETHEREUM_MAINNET: ${{ secrets.RPC_ETHEREUM_MAINNET }}
      - name: Check contract sizes
        run: forge build --sizes --skip "*/test/**" --skip "*/script/**" --skip SphinxUtils
```

**lint.yml:**
```yaml
name: lint
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  forge-fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
      - name: Check formatting
        run: forge fmt --check
```

**slither.yml** (repos with `src/` contracts only):
```yaml
name: slither
on:
    pull_request:
      branches:
        - main
    push:
      branches:
        - main
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-node@v4
        with:
          node-version: latest
      - name: Install npm dependencies
        run: npm install --omit=dev
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
      - name: Run slither
        uses: crytic/slither-action@v0.3.1
        with:
            slither-config: slither-ci.config.json
            fail-on: medium
```

**slither-ci.config.json:**
```json
{
  "detectors_to_exclude": "timestamp,uninitialized-local,naming-convention,solc-version,shadowing-local",
  "exclude_informational": true,
  "exclude_low": false,
  "exclude_medium": false,
  "exclude_high": false,
  "disable_color": false,
  "filter_paths": "(mocks/|test/|node_modules/|lib/)",
  "legacy_ast": false
}
```

**Variations:**
- Deployer-only repos (no `src/`, only `script/`) skip slither entirely — the action's internal `forge build` skips `test/` and `script/` by default, leaving nothing to compile.
- Use inline `// slither-disable-next-line <detector>` to suppress known false positives rather than adding to `detectors_to_exclude` in the config. The comment must be on the line immediately before the flagged expression.

### package.json

```json
{
  "name": "@bananapus/package-name-v6",
  "version": "x.x.x",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/Org/repo.git" },
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "test": "forge test",
    "coverage": "forge coverage --match-path \"./src/*.sol\" --report lcov --report summary"
  },
  "dependencies": { ... },
  "devDependencies": {
    "@sphinx-labs/plugins": "^0.33.2"
  }
}
```

**Scoping:** `@bananapus/` for Bananapus repos, `@rev-net/` for revnet, `@croptop/` for croptop, `@bannynet/` for banny, `@ballkidz/` for defifa.

### remappings.txt

Every repo has a `remappings.txt` as the **single source of truth** for import remappings. Never add remappings to `foundry.toml`.

**Principle:** Import paths in Solidity source must match npm package names exactly. With `libs = ["node_modules", "lib"]`, Foundry auto-resolves `@scope/package/path/File.sol` → `node_modules/@scope/package/path/File.sol`. No remapping needed for packages installed as real directories.

**Note:** Auto-resolution does **not** work for symlinked packages (e.g. npm workspace links). Workspace repos like `deploy-all-v6` and `nana-cli-v6` need explicit `@scope/package/=node_modules/@scope/package/` remappings for each symlinked dependency.

**Minimal content** (most repos):

```
forge-std/=lib/forge-std/src/
```

Only add extra remappings for:
- **`forge-std`** — always needed (git submodule with `src/` subdirectory)
- **Repo-specific `lib/` submodules** that have no npm package (e.g., `hookmate/=lib/hookmate/src/`)
- **Symlinked npm packages** — need explicit `@scope/package/=node_modules/@scope/package/` entries
- **Nested transitive deps** — e.g., `@chainlink/contracts-ccip/` nested inside `@bananapus/suckers-v6/node_modules/`

**Never add remappings for:**
- npm packages that match their import path and are installed as real directories — they auto-resolve
- Short-form aliases (e.g., `@bananapus/core/` → `@bananapus/core-v6/src/`) — fix the import instead
- Packages available via npm that are also git submodules — remove the submodule, use npm

**Import path convention:**

| Package | Import path | Resolves to |
|---------|------------|-------------|
| `@bananapus/core-v6` | `@bananapus/core-v6/src/libraries/JBConstants.sol` | `node_modules/@bananapus/core-v6/src/...` |
| `@openzeppelin/contracts` | `@openzeppelin/contracts/token/ERC20/IERC20.sol` | `node_modules/@openzeppelin/contracts/...` |
| `@uniswap/v4-core` | `@uniswap/v4-core/src/interfaces/IPoolManager.sol` | `node_modules/@uniswap/v4-core/src/...` |

### Linting

Solar (Foundry's built-in linter) runs automatically during `forge build`. It scans all `.sol` files in `libs` directories, including `node_modules`.

**All test helpers must use relative imports** (e.g. `../../src/structs/JBRuleset.sol`), not bare `src/` imports. This ensures solar can resolve paths when the helper is consumed via npm in downstream repos.

### Fork Tests

Fork tests use named RPC endpoints defined in `[rpc_endpoints]` of `foundry.toml`. No skip guards — fork tests should hard-fail if the RPC endpoint is unavailable, making CI failures explicit.

```solidity
function setUp() public {
    vm.createSelectFork("ethereum");
    // ... setup code
}
```

The endpoint name (e.g. `"ethereum"`) maps to an env var via `foundry.toml`:

```toml
[rpc_endpoints]
ethereum = "${RPC_ETHEREUM_MAINNET}"
```

For multi-chain fork tests, add all needed endpoints.

### Formatting

Run `forge fmt` before committing. The `[fmt]` config in `foundry.toml` enforces:
- Thousands separators on numbers (`1_000_000`)
- Multiline function headers when multiple parameters
- Wrapped comments at reasonable width

CI checks formatting via `forge fmt --check`.

### Branching

- `main` is the primary branch
- Feature branches for PRs
- All PRs trigger test + lint workflows
- Submodule checkout with `--recursive` in CI

### Dependencies

- Solidity dependencies via npm (`node_modules/`)
- `forge-std` as a git submodule in `lib/`
- Sphinx plugins as a devDependency
- Cross-repo references use `file:../sibling-repo` in local development
- Published versions use semver ranges (`^0.0.x`) for npm

### Contract Size Checks

CI runs `forge build --sizes` to catch contracts approaching the 24KB limit. When the repo's default `optimizer_runs` differs from what you want for size checking, use `FOUNDRY_PROFILE=ci_sizes forge build --sizes` with a `[profile.ci_sizes]` section in `foundry.toml`.
