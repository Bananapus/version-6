# JBProcessor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the JBProcessor service per `tasks/jbprocessor-design-2026-08-11.md`: fiat (card/bank) payments into eligible Juicebox V6 projects on Base, settlement-triggered on-chain pays, on-chain-enforced 120-day token escrow, email-claim account pages, premium T+0 execution.

**Architecture:** One repo (`extensions/juice-processor`): a Foundry package (`contracts/`) with the `JBProcessorEscrow` contract, and a Next.js app (repo root) providing API routes, donor pages, and a worker process. Postgres is the only stateful infra: payment state machine (guarded SQL transitions), job queue (`FOR UPDATE SKIP LOCKED`), and reconciliation ledger. Deployed on Railway (web + worker + Postgres).

**Tech Stack:** TypeScript (strict), Next.js (App Router), `stripe`, `viem`, `pg`, `resend`; Solidity 0.8.x + Foundry with `@bananapus/core` + OpenZeppelin.

## Global Constraints

- Runtime dependencies are EXACTLY: `next`, `react`/`react-dom`, `stripe`, `viem`, `pg`, `resend`, plus the Para server SDK (verify current package name at implementation time; jango-approved exception for pregen wallets). Adding any other runtime dependency requires explicit user approval first.
- Beneficiary model: committed at `processPayment` time (donor's Para pregen wallet by default, self-supplied address optionally). `release(paymentId)` is permissionless after `unlockAt`, no address argument. Redirects via `setBeneficiary` take effect after `REDIRECT_DELAY` (48h); release is blocked while a redirect is pending.
- Base only (chainId 8453). USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Card payments: forced 3DS, ceiling `CARD_CEILING_USD_CENTS` (default 50000 = $500), 120-day hold. Bank transfers: no ceiling, unlock at settlement finality (`BANK_HOLD_DAYS`, default 7).
- Default path: `pay()` triggers on Stripe settlement, never before. Premium path (`instant=true`): T+0, funded from the instant pool, fee `PREMIUM_BPS` (default 150). Premium NEVER shortens the hold.
- Every payment pays on-chain at most once — enforced by DB state transitions, not application discipline.
- Donor-facing copy: sentence case, "onchain" (no hyphen), no emoji, no dot separators (house copy conventions).
- All secrets via env; never in code or logs. Never log full email addresses (log `ab***@d***` form).
- Money amounts: USD as integer cents (`bigint`), token amounts as `numeric` strings in wei units. Never floats.

## File Structure

```
extensions/juice-processor/
  contracts/                     # Foundry package
    src/JBProcessorEscrow.sol
    test/JBProcessorEscrow.t.sol
    script/Deploy.s.sol
    foundry.toml
  src/
    db/schema.sql                # numbered migrations 001_*.sql...
    db/index.ts                  # pg Pool + migrate()
    db/payments.ts               # state machine: transition(), createPayment()
    db/jobs.ts                   # queue: enqueue(), claimNext(), complete(), fail()
    chain/client.ts              # viem public+wallet clients (injectable transport)
    chain/quote.ts               # quoteTokens(), driftExceeded()
    chain/escrow.ts              # processPayment(), release() writes + ABI
    stripe/checkout.ts           # createCheckoutSession()
    stripe/webhook.ts            # event router -> transitions + jobs
    worker/index.ts              # poll loop; job handlers registry
    worker/pay.ts                # handlePay (settled | instant)
    worker/release.ts            # handleRelease
    worker/reconcile.ts          # daily reconciliation
    worker/watchRulesets.ts      # eligibility auto-suspend
    auth/magic.ts                # signToken(), verifyToken(), session cookie
    wallets/para.ts              # getOrCreatePregenWallet(email)
    email/send.ts                # receipt, unlock, magic-link, alert templates
  app/
    api/checkout/route.ts
    api/stripe-webhook/route.ts
    api/payments/[id]/route.ts
    api/login/route.ts
    api/redirect/route.ts
    account/page.tsx
    login/page.tsx
    done/page.tsx                # post-Stripe success page
  test/                          # vitest; *.test.ts colocated by module name
  package.json / tsconfig.json / vitest.config.ts
  README.md                      # runbook: deploy, keys, forfeit/cashout, reconciliation alerts
```

DB tests run against a real Postgres at `TEST_DATABASE_URL` (each test file creates a scratch schema). Chain modules take an injected viem client so unit tests need no RPC; the pay path additionally gets one anvil fork test. Stripe handlers are tested with real signed payloads built via `stripe.webhooks.generateTestHeaderString`.

---

### Task 1: Repo scaffold + escrow contract

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/JBProcessorEscrow.sol`, `contracts/test/JBProcessorEscrow.t.sol`, `contracts/script/Deploy.s.sol`
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md` (skeleton)

**Interfaces:**
- Produces: `JBProcessorEscrow` with `processPayment(bytes32 paymentId, IJBTerminal terminal, uint256 projectId, uint256 usdcAmount, uint256 minReturnedTokens, address projectToken, address beneficiary, uint48 unlockAt, string memo) returns (uint256 tokensHeld)`, `setBeneficiary(bytes32 paymentId, address to)` (operator; 48h effectiveness delay), permissionless `release(bytes32 paymentId)`, `forfeit(bytes32 paymentId)` (operator), `entries(bytes32) -> Entry`, `setOperator(address)` (owner). Events `Processed`, `BeneficiaryChanged`, `Released`, `Forfeited`.

- [ ] **Step 1: Scaffold repo** — `git init`, `forge init contracts --no-git` then trim, `npm init -y`; install deps exactly: `npm i next react react-dom stripe viem pg resend && npm i -D typescript vitest @types/pg @types/react`. In `contracts/`: `forge install OpenZeppelin/openzeppelin-contracts Bananapus/nana-core-v6`. Commit `chore: scaffold`.

- [ ] **Step 2: Write failing contract tests**

```solidity
// contracts/test/JBProcessorEscrow.t.sol
// Uses a MockTerminal that mints MockERC20 project tokens on pay() and a MockERC20 USDC.
contract JBProcessorEscrowTest is Test {
    function test_processPayment_pullsUsdcPaysAndRecordsEntry() public { /* asserts entry fields incl. beneficiary + Processed event + tokens held by escrow */ }
    function test_processPayment_revertsOnDuplicatePaymentId() public {}
    function test_processPayment_revertsOnZeroBeneficiary() public {}
    function test_processPayment_onlyOperator() public {}
    function test_release_revertsBeforeUnlock() public {}
    function test_release_permissionless_paysBeneficiaryAfterUnlock_singleUse() public { /* called from a random address */ }
    function test_setBeneficiary_onlyOperator_pendingUntilDelay() public {}
    function test_release_revertsWhileRedirectPending() public {}
    function test_release_usesNewBeneficiaryAfterDelay() public {}
    function test_forfeit_onlyBeforeUnlock_sendsToOwner() public {}
    function test_forfeit_thenRelease_reverts() public {}
    function test_setOperator_onlyOwner() public {}
}
```

Run: `forge test` → FAIL (contract missing).

- [ ] **Step 3: Implement the contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJBTerminal} from "@bananapus/core/src/interfaces/IJBTerminal.sol";

/// @notice Holds project tokens purchased with fiat until the card-dispute window passes.
/// The unlock is enforced onchain: the operator can never release early, only forfeit
/// (to the owner treasury) while the window is open.
contract JBProcessorEscrow is Ownable {
    using SafeERC20 for IERC20;

    struct Entry {
        address token;
        uint160 amount;
        uint48 unlockAt;
        bool settled;
        address beneficiary;
        address pendingBeneficiary;
        uint48 redirectEffectiveAt;
    }

    error NotOperator(); error EntryExists(); error NoEntry(); error ZeroBeneficiary();
    error StillLocked(); error AlreadySettled(); error UnlockPassed(); error RedirectPending();

    event Processed(bytes32 indexed paymentId, uint256 indexed projectId, uint256 amountPaid, uint256 tokensHeld, address beneficiary, uint48 unlockAt);
    event BeneficiaryChanged(bytes32 indexed paymentId, address pending, uint48 effectiveAt);
    event Released(bytes32 indexed paymentId, address to, uint256 amount);
    event Forfeited(bytes32 indexed paymentId, uint256 amount);

    uint256 public constant REDIRECT_DELAY = 48 hours;

    IERC20 public immutable USDC;
    address public operator;
    mapping(bytes32 paymentId => Entry) public entries;

    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(address owner_, address operator_, IERC20 usdc) Ownable(owner_) {
        operator = operator_;
        USDC = usdc;
    }

    function setOperator(address operator_) external onlyOwner { operator = operator_; }

    function processPayment(
        bytes32 paymentId,
        IJBTerminal terminal,
        uint256 projectId,
        uint256 usdcAmount,
        uint256 minReturnedTokens,
        address projectToken,
        address beneficiary,
        uint48 unlockAt,
        string calldata memo
    ) external onlyOperator returns (uint256 tokensHeld) {
        if (entries[paymentId].unlockAt != 0) revert EntryExists();
        if (beneficiary == address(0)) revert ZeroBeneficiary();
        USDC.safeTransferFrom(msg.sender, address(this), usdcAmount);
        USDC.forceApprove(address(terminal), usdcAmount);
        uint256 balanceBefore = IERC20(projectToken).balanceOf(address(this));
        terminal.pay({
            projectId: projectId,
            token: address(USDC),
            amount: usdcAmount,
            beneficiary: address(this),
            minReturnedTokens: minReturnedTokens,
            memo: memo,
            metadata: bytes("")
        });
        tokensHeld = IERC20(projectToken).balanceOf(address(this)) - balanceBefore;
        entries[paymentId] = Entry(projectToken, uint160(tokensHeld), unlockAt, false, beneficiary, address(0), 0);
        emit Processed(paymentId, projectId, usdcAmount, tokensHeld, beneficiary, unlockAt);
    }

    /// @notice Redirect where a held entry will release to. Takes effect after REDIRECT_DELAY,
    /// giving monitoring public notice before any redirected release can execute.
    function setBeneficiary(bytes32 paymentId, address to) external onlyOperator {
        Entry storage entry = entries[paymentId];
        if (entry.unlockAt == 0) revert NoEntry();
        if (entry.settled) revert AlreadySettled();
        if (to == address(0)) revert ZeroBeneficiary();
        entry.pendingBeneficiary = to;
        entry.redirectEffectiveAt = uint48(block.timestamp + REDIRECT_DELAY);
        emit BeneficiaryChanged(paymentId, to, entry.redirectEffectiveAt);
    }

    /// @notice Permissionless: anyone can crank an unlocked entry to its recorded beneficiary.
    function release(bytes32 paymentId) external {
        Entry storage entry = entries[paymentId];
        if (entry.unlockAt == 0) revert NoEntry();
        if (entry.settled) revert AlreadySettled();
        if (block.timestamp < entry.unlockAt) revert StillLocked();
        if (entry.pendingBeneficiary != address(0)) {
            if (block.timestamp < entry.redirectEffectiveAt) revert RedirectPending();
            entry.beneficiary = entry.pendingBeneficiary;
        }
        entry.settled = true;
        IERC20(entry.token).safeTransfer(entry.beneficiary, entry.amount);
        emit Released(paymentId, entry.beneficiary, entry.amount);
    }

    function forfeit(bytes32 paymentId) external onlyOperator {
        Entry storage entry = entries[paymentId];
        if (entry.unlockAt == 0) revert NoEntry();
        if (entry.settled) revert AlreadySettled();
        if (block.timestamp >= entry.unlockAt) revert UnlockPassed();
        entry.settled = true;
        IERC20(entry.token).safeTransfer(owner(), entry.amount);
        emit Forfeited(paymentId, entry.amount);
    }
}
```

Balance-delta (not `pay()`'s return value) is deliberate: it stays correct if a data hook routes issuance unconventionally. Fee pay-ins into $PROCESSOR reuse `processPayment` with `feePaymentId = keccak256(abi.encodePacked(paymentId, "fee"))`.

- [ ] **Step 4: Run `forge test` → all PASS.** Also `forge fmt`.
- [ ] **Step 5: Write `Deploy.s.sol`** (constructor args from env: `OWNER` = jango Safe, `OPERATOR` = worker EOA, Base USDC address). Commit `feat: JBProcessorEscrow with onchain-enforced hold`.

---

### Task 2: DB schema, migrations, state machine

**Files:**
- Create: `src/db/schema.sql` (as `src/db/migrations/001_init.sql`), `src/db/index.ts`, `src/db/payments.ts`
- Test: `test/payments.test.ts`

**Interfaces:**
- Produces: `getPool(): Pool`; `migrate(pool): Promise<void>`; `PaymentState` union type; `createPayment(pool, {projectId, email, amountUsdCents, instant}): Promise<PaymentRow>`; `transition(pool, id, from: PaymentState[], to: PaymentState, patch?): Promise<PaymentRow>` — throws `TransitionError` if the row isn't in a `from` state (the at-most-once guarantee everything else leans on).

- [ ] **Step 1: Write `001_init.sql`**

```sql
CREATE TYPE payment_state AS ENUM (
  'created','paid','settled','paying','held','unlocked','claimed',
  'refunded','forfeited','canceled');

CREATE TABLE projects (
  project_id bigint PRIMARY KEY,
  name text NOT NULL,
  token_address text NOT NULL,
  terminal_address text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  ruleset_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id bigint NOT NULL REFERENCES projects,
  email text NOT NULL,
  amount_usd_cents bigint NOT NULL CHECK (amount_usd_cents > 0),
  instant boolean NOT NULL DEFAULT false,
  method text CHECK (method IN ('card','bank')),
  state payment_state NOT NULL DEFAULT 'created',
  stripe_session_id text UNIQUE,
  stripe_payment_intent text UNIQUE,
  quote_tokens numeric,
  tokens_held numeric,
  pay_tx text,
  unlock_at timestamptz,
  claim_address text,
  release_tx text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_email ON payments (email);
CREATE INDEX payments_state ON payments (state);

CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  locked_at timestamptz,
  done_at timestamptz,
  last_error text,
  dedupe_key text UNIQUE
);
CREATE INDEX jobs_ready ON jobs (run_at) WHERE done_at IS NULL;

CREATE TABLE stripe_events (id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
```

`stripe_events` makes webhook processing idempotent by insert-or-ignore. `dedupe_key` makes job enqueueing idempotent.

- [ ] **Step 2: Failing tests** — `createPayment` returns row in `created`; `transition(id, ['created'], 'paid')` succeeds once; a second identical call throws `TransitionError`; `transition` with wrong `from` throws; patch fields land (`unlock_at`, `pay_tx`). Run `vitest` → FAIL.
- [ ] **Step 3: Implement** — `migrate()` runs numbered files inside a transaction with a `schema_migrations` table; `transition` is one `UPDATE payments SET state=$to, updated_at=now(), ... WHERE id=$id AND state = ANY($from) RETURNING *`, throwing if `rowCount !== 1`.
- [ ] **Step 4: `vitest` → PASS.**
- [ ] **Step 5: Commit** `feat: payment state machine + migrations`.

---

### Task 3: Job queue

**Files:**
- Create: `src/db/jobs.ts`
- Test: `test/jobs.test.ts`

**Interfaces:**
- Produces: `enqueue(pool, kind, payload, {runAt?, dedupeKey?})`; `claimNext(pool): Promise<JobRow | null>` (SKIP LOCKED, increments attempts, sets `locked_at`); `complete(pool, id)`; `fail(pool, id, err)` — sets `last_error`, clears lock, `run_at = now() + interval '30 seconds' * 2^attempts`, marks `done_at` with `last_error` prefix `"FATAL:"` when `attempts >= max_attempts`; `reapStale(pool)` — clears locks older than 10 minutes.

- [ ] **Step 1: Failing tests** — enqueue+claim returns the job; second `claimNext` while first is locked returns null; `fail` schedules backoff and a later claim picks it up (use `run_at` injection, not sleeps); dedupe_key conflict is a silent no-op; exhausted attempts marks done with FATAL.
- [ ] **Step 2: Implement.** Claim query:

```sql
UPDATE jobs SET locked_at = now(), attempts = attempts + 1
WHERE id = (
  SELECT id FROM jobs
  WHERE done_at IS NULL AND locked_at IS NULL AND run_at <= now()
  ORDER BY id LIMIT 1
  FOR UPDATE SKIP LOCKED)
RETURNING *;
```

- [ ] **Step 3: `vitest` → PASS. Commit** `feat: pg-backed job queue`.

---

### Task 4: Chain clients + quoting

**Files:**
- Create: `src/chain/client.ts`, `src/chain/quote.ts`
- Test: `test/quote.test.ts`

**Interfaces:**
- Consumes: nothing internal.
- Produces: `publicClient()` / `walletClient()` (viem, Base, `WORKER_PRIVATE_KEY`, RPC from `BASE_RPC_URL`, both memoized and overridable for tests); `quoteTokens(client, {terminal, projectId, usdcAmountWei}): Promise<bigint>` via `previewPayFor` on the terminal (ABI imported from `@bananapus/core` artifacts vendored as JSON — not an npm runtime dep; copy the ABI JSON into `src/chain/abi/`); `driftExceeded(quoteAtCheckout: bigint, quoteNow: bigint): boolean` — true when `quoteNow < quoteAtCheckout * (10000 - DRIFT_TOLERANCE_BPS) / 10000` (default tolerance 200 bps; only downside drift matters — more tokens than quoted is fine).

- [ ] **Step 1: Failing tests** — `driftExceeded` boundary cases (exact tolerance edge, upside drift false, zero quote); `quoteTokens` against a stubbed client asserting correct address/function/args passthrough.
- [ ] **Step 2: Implement. `vitest` → PASS. Commit** `feat: chain client + quote with drift tolerance`.

---

### Task 5: Escrow write module + fork test

**Files:**
- Create: `src/chain/escrow.ts`, `src/chain/abi/JBProcessorEscrow.json`
- Test: `test/escrow.fork.test.ts` (skipped unless `FORK_RPC_URL` set)

**Interfaces:**
- Consumes: `walletClient()`, `publicClient()` (Task 4).
- Produces: `processPayment(clients, {paymentId, terminal, projectId, usdcAmountWei, minReturnedTokens, projectToken, beneficiary, unlockAt, memo}): Promise<{txHash, tokensHeld: bigint}>` — simulates first (`simulateContract`), sends, waits one confirmation, parses the `Processed` event for `tokensHeld`; `setBeneficiary(clients, {paymentId, to}): Promise<{txHash}>`; `release(clients, {paymentId}): Promise<{txHash}>`; `paymentIdBytes32(uuid: string): 0x-hex` (uuid → 16 bytes left-padded); `feePaymentId(paymentId)` (keccak per contract convention).

- [ ] **Step 1: Unit-test the pure helpers** (`paymentIdBytes32`, `feePaymentId` vectors match `cast keccak` output). PASS, commit.
- [ ] **Step 2: Fork test** — anvil fork of Base: deploy escrow via bytecode from `contracts/out`, impersonate a USDC whale to fund the worker, `processPayment` against a real eligible project's terminal (use env `TEST_PROJECT_ID`/`TEST_PROJECT_TOKEN`/`TEST_TERMINAL`), assert entry recorded and `release` reverts before warp / succeeds after `evm_increaseTime` past unlockAt. Run with `FORK_RPC_URL=... vitest escrow.fork`. Commit `feat: escrow write module + fork test`.

---

### Task 6: Stripe checkout session + webhook handler

**Files:**
- Create: `src/stripe/checkout.ts`, `src/stripe/webhook.ts`
- Test: `test/checkout.test.ts`, `test/webhook.test.ts`

**Interfaces:**
- Consumes: `createPayment`, `transition`, `enqueue`, `quoteTokens`.
- Produces:
  - `createCheckoutSession(deps, {projectId, amountUsdCents, email, instant, walletAddress?}): Promise<{url, paymentId}>` — rejects if project missing/suspended; rejects card-path amounts over `CARD_CEILING_USD_CENTS` unless method resolves to bank; rejects `instant` when pool headroom (USDC allowance minus in-flight instant payments) is insufficient; resolves the beneficiary — `walletAddress` if supplied (viem `isAddress`), else a Para pregen wallet for the email via `src/wallets/para.ts` `getOrCreatePregenWallet(email): Promise<address>` — and stores it as `claim_address`; quotes tokens and stores `quote_tokens`; creates a Stripe Checkout Session (`payment_method_options.card.request_three_d_secure: 'any'`, `payment_method_types` per amount: `['card','us_bank_account']` under ceiling, `['us_bank_account']` above, line item = donation + (instant ? premium `PREMIUM_BPS` : 0), `metadata.payment_id`), stores `stripe_session_id`.
  - `handleStripeEvent(deps, event): Promise<void>` — router:
    - `checkout.session.completed` → transition `created→paid` (record `stripe_payment_intent`, `method`, compute+store `unlock_at` = now + 120d card / + `BANK_HOLD_DAYS` bank); if `instant`, enqueue `pay` (dedupe `pay:<id>`) immediately.
    - settlement event for the payment (`balance.available` path is coarse — use `charge.updated`→`balance_transaction` availability or, simplest and chosen here: enqueue `pay` with `run_at = availableOn` timestamp read from the charge's balance transaction at `checkout.session.completed` time for default path) → default-path pay is scheduled, not event-chased.
    - `charge.dispute.created` → if state in (`paid`,`settled`,`paying`) before on-chain pay: transition → `canceled`; if `held`: transition → `forfeited` + enqueue `forfeit` job.
    - `charge.refunded` → transition (`paid`→`refunded`).
    - All wrapped in: `INSERT INTO stripe_events ... ON CONFLICT DO NOTHING; if not inserted, return` (idempotency).

- [ ] **Step 1: Failing tests** — session creation rejects suspended project, over-ceiling card, insufficient pool headroom; happy path stores quote and session id (Stripe SDK stubbed via injected `deps.stripe`). Webhook: duplicate event id is a no-op; `checkout.session.completed` transitions and schedules `pay` at the balance-transaction `available_on` for default, immediate for instant; dispute in `held` enqueues `forfeit`; dispute pre-pay cancels. Build real signed payloads with `stripe.webhooks.generateTestHeaderString` and verify through `constructEvent`.
- [ ] **Step 2: Implement. `vitest` → PASS. Commit** `feat: stripe checkout + idempotent webhook router`.

---

### Task 7: Payer worker

**Files:**
- Create: `src/worker/pay.ts`, `src/worker/index.ts`
- Test: `test/pay.test.ts`

**Interfaces:**
- Consumes: `claimNext`/`complete`/`fail`, `transition`, `quoteTokens`, `driftExceeded`, `escrow.processPayment`, `feePaymentId`, Stripe refund API.
- Produces: `handlePay(deps, job)`:
  1. Load payment; require state `paid` (default: also verify the charge's balance transaction is `available`; if not yet, `fail` with short backoff — belt for schedule drift).
  2. `transition(['paid'],'paying')` — this is the at-most-once gate; a crashed run resumes via job retry, and re-entry is guarded by checking for an existing `Processed` entry on-chain (`entries(paymentIdBytes32)`) before re-sending.
  3. For instant payments: pull `amount` USDC from the pool Safe via `transferFrom` (allowance-bounded).
  4. Re-quote; if `driftExceeded` → Stripe full refund → `transition(['paying'],'refunded')`, done.
  5. `escrow.processPayment(...)` with `minReturnedTokens = quoteNow * (10000 - DRIFT_TOLERANCE_BPS) / 10000`, `beneficiary = claim_address` (preset at checkout), `unlockAt` from the row, memo = payment id.
  6. If instant: `escrow.processPayment` again for the premium into `PROCESSOR_PROJECT_ID`, same beneficiary (skip silently if env unset — pre-revnet, premium accrues in the settlement wallet).
  7. `transition(['paying'],'held', {tokens_held, pay_tx})`; send receipt email; enqueue `unlock-note` job with `run_at = unlock_at`.
- Produces: `worker/index.ts` — poll loop: `reapStale`, `claimNext`, dispatch by `kind` to handlers registry, `complete`/`fail`; 2s idle sleep; graceful SIGTERM.

- [ ] **Step 1: Failing tests** — happy default path walks `paid→paying→held` with correct escrow args; drift → refund + `refunded`; crash-after-paying recovery: job retry with on-chain entry present skips re-send and lands `held`; instant path draws pool then pays fee leg. All chain/Stripe deps injected fakes.
- [ ] **Step 2: Implement. `vitest` → PASS. Commit** `feat: payer worker with at-most-once onchain execution`.

---

### Task 8: Magic-link auth + account + redirect + release keeper

**Files:**
- Create: `src/auth/magic.ts`, `src/wallets/para.ts`, `app/api/login/route.ts`, `app/api/redirect/route.ts`, `app/api/payments/[id]/route.ts`, `app/account/page.tsx`, `app/login/page.tsx`, `app/done/page.tsx`, `src/worker/release.ts`
- Test: `test/magic.test.ts`, `test/release.test.ts`

**Interfaces:**
- Consumes: `transition`, `enqueue`, `escrow.setBeneficiary`, `escrow.release`, `sendEmail`.
- Produces: `signToken(email, ttlMinutes)` / `verifyToken(token): email | null` — HMAC-SHA256 over `email|exp|nonce` with `AUTH_SECRET`, base64url, single-use enforced by a `used_tokens` insert (add `002_auth.sql` migration: `used_tokens(hash text primary key, used_at timestamptz)`); session = httpOnly signed cookie carrying `email|exp`, verified per request.
- `src/wallets/para.ts`: `getOrCreatePregenWallet(email): Promise<address>` — Para server SDK, memoized in a `pregen_wallets(email primary key, address, created_at)` table (also in `002_auth.sql`) so one email always maps to one wallet.
- `POST /api/login {email}` → always 200 (no account enumeration); sends magic link via resend.
- `GET /api/payments/:id` → public, returns `{state, amountUsdCents, quoteTokens, tokensHeld, beneficiary, unlockAt, payTx, releaseTx}` — the integrator surface for Artizen.
- `POST /api/redirect {paymentId, address}` — session email must match payment email; viem `isAddress`; requires state `held` or `unlocked` and no release yet; calls `escrow.setBeneficiary` (48h on-chain delay applies), updates `claim_address`, confirmation email. This is the optional power-user path — no action is ever required to receive tokens.
- `handleRelease(deps, job)` — **the keeper crank**: recurring job (every 10 min) selects payments where `state='unlocked'` and any redirect delay has passed, calls permissionless `escrow.release(paymentId)` (project leg + fee leg), `transition(['unlocked'],'claimed',{release_tx})`, delivery email ("your tokens are in your wallet — claim your wallet with your email at ..." for pregen, plain confirmation for self-supplied addresses). `unlock-note` job handler: `transition(['held'],'unlocked')` — release follows on the next crank; no donor action.
- Account page (RSC): payments for session email — project name, amount, state label, expected/held tokens, unlock countdown (server-computed days), destination wallet with "change destination" form, BaseScan links for `pay_tx`/`release_tx`, Para wallet claim instructions. No wallet library.

- [ ] **Step 1: Failing tests** — token round-trip, expiry, single-use, tamper; redirect rejects mismatched session email, bad address, and already-released payments; pregen wallet memoization returns the same address for repeat emails (Para SDK faked); release crank releases due entries, skips redirect-pending ones, transitions and emails; unlock-note flips `held→unlocked`.
- [ ] **Step 2: Implement modules + routes + pages** (pages are thin RSCs over `pg` queries; styling: single global CSS file, house copy conventions).
- [ ] **Step 3: `vitest` → PASS; `next build` passes (the real gate). Commit** `feat: magic-link accounts, pregen wallets, redirect flow, release keeper`.

---

### Task 9: Eligibility watcher + reconciliation + alerts

**Files:**
- Create: `src/worker/watchRulesets.ts`, `src/worker/reconcile.ts`, `src/email/send.ts` (alert template joins receipt/unlock/magic templates here)
- Test: `test/watchRulesets.test.ts`, `test/reconcile.test.ts`

**Interfaces:**
- Consumes: `publicClient()`, pool, `sendEmail`.
- Produces:
  - `watchRulesets(deps)` (recurring self-re-enqueueing job, hourly): for each `active` project, fingerprint current + queued ruleset config via `JBRulesets`/controller reads (`keccak` over the packed config fields); differs from stored `ruleset_fingerprint` → `UPDATE projects SET status='suspended'` + alert email to `ALERT_EMAIL`. Bendystraw is an optimization; onchain reads are the source of truth (bendystraw latency is a known critical-path risk).
  - `reconcile(deps)` (daily): (a) every `held`/`unlocked` payment's escrow entry exists on-chain with `amount == tokens_held` AND its on-chain beneficiary (including any pending redirect) matches DB `claim_address` — a mismatch is the compromised-operator alarm, inside the 48h redirect window; (b) no payment stuck in `paying` older than 1h; (c) Stripe: sum of succeeded charges per day == sum of `payments` rows that left `created`; (d) settlement wallet USDC balance below `RESTING_BALANCE_ALERT` unless instant pool activity explains it. Any mismatch → alert email with the diff table. Never auto-corrects — alerts only.

- [ ] **Step 1: Failing tests** with faked reads: fingerprint change suspends + alerts; matching state is silent; reconcile flags a missing entry, a stuck `paying`, and a count mismatch.
- [ ] **Step 2: Implement. `vitest` → PASS. Commit** `feat: ruleset watcher + daily reconciliation`.

---

### Task 10: Checkout API + integration wiring + deploy

**Files:**
- Create: `app/api/checkout/route.ts`, `app/api/stripe-webhook/route.ts`, `railway.json` (web + worker services), `README.md` (full runbook)
- Modify: `src/worker/index.ts` (register all handlers + self-scheduling cron jobs on boot)

**Interfaces:**
- Consumes: everything above.
- Produces: `POST /api/checkout {projectId, amountUsd, email, instant?}` → `{url, paymentId}` (rate-limited per IP via a `checkout_attempts` insert + count query — no new dependency); `POST /api/stripe-webhook` (raw-body signature verify → `handleStripeEvent`).

- [ ] **Step 1: Wire routes; `next build` + full `vitest` suite green.**
- [ ] **Step 2: End-to-end in Stripe test mode against Base Sepolia or an anvil fork:** checkout → 3DS test card → webhook (Stripe CLI forward) → scheduled pay executes → account page shows `held` with countdown → warp/short `unlock_at` → claim → release tx. Record the walkthrough in README.
- [ ] **Step 3: Deploy escrow to Base** (`forge script Deploy --broadcast --verify`, owner = jango Safe, operator = fresh worker EOA). Railway: provision Postgres, web + worker services, env (`DATABASE_URL`, `BASE_RPC_URL`, `WORKER_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `AUTH_SECRET`, `ALERT_EMAIL`, `ESCROW_ADDRESS`, tunables). Runbook sections: key rotation (`setOperator`), forfeit + manual cash-out recovery, reconciliation alert triage, adding an eligible project (SQL insert + review checklist from the spec).
- [ ] **Step 4: Add submodule to the monorepo:** `git submodule add <repo-url> extensions/juice-processor`, commit pointer.
- [ ] **Step 5: Onboard Artizen:** insert ART project row after eligibility review; Stripe live-mode keys pending the USDC-settlement onboarding conversation (open question #1 in the spec — until resolved, live mode stays off).

---

## Self-review notes

- **Spec coverage:** checkout/3DS/ceiling (T6, T10), settlement-triggered default + premium T0 + pool allowance (T6, T7), escrow contract + hold + forfeit + committed beneficiary + permissionless release + 48h redirect delay (T1, T5, T7, T8), Para pregen wallets + zero-click delivery + redirect flow + account page + magic link (T8), eligibility application gate (manual SQL insert + checklist in runbook, T10) + auto-suspend watcher (T9), reconciliation + alerts (T9; also checks on-chain beneficiaries match DB `claim_address`), refund-on-drift (T7), dispute handling both windows (T6), $PROCESSOR fee leg with pre-revnet accrual fallback (T7), Base-only + env tunables (global constraints). Deliberately deferred per spec: recovery cash-out is a manual runbook step; premium availability = allowance headroom check; no admin UI.
- **Type consistency:** `transition(pool, id, from[], to, patch)` used identically in T6–T9; `processPayment` TS signature mirrors the Solidity ABI in T1 (incl. `beneficiary`); `paymentIdBytes32`/`feePaymentId` defined in T5, consumed in T7; `release(paymentId)` is address-free everywhere.
- **Placeholder scan:** clean — every step names its assertion targets or contains the code.
