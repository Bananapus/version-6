# Coordinated Learn, Build, and Inspect: first milestone

Implemented locally on September 11, 2026, following [the Derive v3 research and game plan](derive-v3-docs-game-plan.md). This is the first delivery from that plan, not completion of the full rollout. Nothing has been deployed and no payment was signed or broadcast.

## The journey

Juicebox Money now has `/build/first-payment`: understand payment terms, read Base Sepolia project 1 without a wallet, optionally simulate a direct terminal payment, use the existing app for a test payment, inspect execution, and recover from uncertain results. Learn and Build both lead into it. Revnet points into the shared journey and back to its own economic model and configuration guidance.

The tutorial displays the exact downloadable `public/examples/read-project.mjs` and `preview-payment.mjs` files. The examples pin SDK and viem versions, validate the network and project, resolve current contracts, and retain minimum-output protection. The read records a block number and hash; the simulation outputs the decoded request and explicitly reports `simulated-only`.

Center adds a public `/llms.txt` index and `/inspect/:chain/:project` handoff. The latter validates the chain and project ID and follows the same published Juicescan URL as Center's directory. Existing API authorization remains in effect.

Juicescan generates script-free `learn.html` and `build.html` from its existing guide renderer, including a readable build prompt. Native links and section anchors work without JavaScript. The interactive guide tabs also link to the shared tutorial and economic explanations.

Economic language now distinguishes issuance from market price, token participation from automatic ownership, committed terms from limited operator powers, and a successful receipt from a signature, proposal, or pending indexer result.

## Source map

- [Tutorial](https://github.com/mejango/juicebox-money/blob/a83e065fa18b05c92bcd2364a15b59fa04c0436e/src/app/build/first-payment/page.tsx) and [example maintenance instructions](https://github.com/mejango/juicebox-money/blob/a83e065fa18b05c92bcd2364a15b59fa04c0436e/public/examples/README.md).
- [Center machine-readable index](https://github.com/mejango/jbcenter/blob/b28a2ec9ab7994968d6a5893e640e791c76b6d85/src/llms.ts) and [routes](https://github.com/mejango/jbcenter/blob/b28a2ec9ab7994968d6a5893e640e791c76b6d85/src/app.ts).
- [Revnet Learn](https://github.com/mejango/revnet-money/blob/3652fa70f612ecb67cebb44e1ebcc1c76f334b45/src/app/learn/page.tsx), [Build](https://github.com/mejango/revnet-money/blob/3652fa70f612ecb67cebb44e1ebcc1c76f334b45/src/app/build/page.tsx), and [agent index](https://github.com/mejango/revnet-money/blob/3652fa70f612ecb67cebb44e1ebcc1c76f334b45/src/app/llms.txt/route.ts).
- [Juicescan shared guide content](https://github.com/mejango/juicescan/blob/1aed55236218950d95ee0683b59d573d709d50f8/src/learn-build.js), [static renderer](https://github.com/mejango/juicescan/blob/1aed55236218950d95ee0683b59d573d709d50f8/build/render-guides.js), and [browser checks](https://github.com/mejango/juicescan/blob/1aed55236218950d95ee0683b59d573d709d50f8/test/e2e/static-guides.spec.js).

## Validation

- Both downloadable examples ran against live Base Sepolia with SDK 2.3.2 and viem 2.55.19. Project 1 was read successfully and the direct terminal payment simulated successfully. No private key was used.
- Center: execution checks, typecheck, build, and 1,399 tests passed; 119 optional integration tests skipped. Its MCP package passed all 373 tests and its remaining checks. Initial parallel test timeouts cleared with two workers.
- Revnet: typecheck and lint/format checks for all edited files passed. The repository-wide format check still flags the untouched `next.config.js`.
- Juicescan: six guide tests, eight browser checks across four viewport widths, source checks, and bundle budget passed. Browser checks cover JavaScript-disabled reading/navigation and WCAG A/AA automated accessibility checks. Static and interactive guide content are compared directly. Generated static guides add about 25.4 KB gzip across two optional documents.
- Juicebox Money: changed-file lint, source checks, typecheck, and the final production build passed. All 16 guide browser tests passed against that build, including the new tutorial at 320px and desktop widths, keyboard navigation, JavaScript-disabled content and deep links, clipboard fallback, and automated WCAG A/AA checks. This focused documentation run did not exercise payment or loan fixtures.

Automated accessibility checks do not replace assistive-technology testing. The guided wallet payment remains documented but was not executed during this work.

## Publishing dependencies

1. Publish Center's inspection route and Juicebox Money's tutorial/examples in a coordinated release. The new cross-links depend on those destinations.
2. Publish Revnet's updated Learn, Build, and agent-index links.
3. Publish Juicescan's build including the two static guide files; record its resulting verified CID and update Center's shared directory URL through the normal release process. The current CID was deliberately retained in this local change.
4. Smoke-test the public journey from each site's Learn and Build entry points, downloading and running the examples from the published origin. Verify that the inspection handoff preserves the chain and project ID.

The next substantial milestone is the shared economic scenario model and its coordinated Learn/Build explanations. Further task guides and cross-site measurement remain in the original rollout plan.
