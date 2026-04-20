# RISKS.md Maintenance

Use this note when changing any active repo under `/v6/evm`.

## Goal

`RISKS.md` files are part of the runtime and operational interface of this workspace. They should change whenever the code changes the security model, trust assumptions, failure modes, deployment assumptions, or cross-repo behavior.

This is not limited to exploits or critical bugs. Docs must also move when behavior becomes more fail-open, more fail-closed, more centralized, more operationally fragile, or easier to misuse.

## When `RISKS.md` Must Change

Update the local repo's `RISKS.md` if the PR changes any of these:

- privileged roles, owner powers, wildcard grants, or hardcoded bypass operators
- payment, cash-out, payout, fee, routing, loan, or bridge settlement behavior
- fail-open, fail-closed, retry, forgiveness, under-reporting, or fallback semantics
- deployment assumptions, required artifacts, resume/recovery behavior, or chain capability assumptions
- preview-vs-execution behavior that integrators depend on
- assumptions about shared singletons, registries, hooks, stores, or external dependencies
- fund-stranding, stuck-asset, or recovery behavior
- liveness assumptions, keeper/operator requirements, or monitoring expectations

## When Workspace `RISKS.md` Must Also Change

Update [`/v6/evm/RISKS.md`](../RISKS.md) when the PR changes:

- a shared singleton or registry used across multiple repos
- a cross-repo call chain or ecosystem trust boundary
- cross-chain deployment assumptions or capability-aware parity rules
- any workspace-level fail-open vs fail-closed classification
- the recommended repo drill-down order for auditors or crawlers

## Review Questions

Before merging, answer these questions:

1. Did this PR change who can do something privileged?
2. Did it change how value is routed, minted, burned, refunded, bridged, or forgiven?
3. Did it change what happens on failure?
4. Did it change whether integrators can rely on previews, views, or registry outputs?
5. Did it change deployment, migration, or recovery assumptions?
6. If an auditor read the existing `RISKS.md`, would they now be misled?

If any answer is `yes`, update the relevant `RISKS.md`.

## Minimum PR Standard

Every PR in an active repo should state one of these explicitly:

- `No RISKS.md update needed because ...`
- `Updated local RISKS.md`
- `Updated local RISKS.md and /v6/evm/RISKS.md`

## Lightweight Check

Run the workspace checker from `/v6/evm`:

```bash
bash docs/check_risks_docs.sh
```

This is intentionally lightweight. It checks for presence and a small set of required headings, not semantic correctness. Human review still decides whether the actual content is good enough.
