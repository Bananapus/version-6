# Plain-language copy audit

September 11, 2026. This pass covers Juicebox Center, Juicebox Money, Revnet Money, and Juicescan, following the [coordinated documentation plan](derive-v3-docs-game-plan.md).

The changes make the useful idea come first, introduce the technical name when it becomes necessary, and give readers a glossary to return to. Older overlapping sections were consolidated after moving their useful details. Exact contract identifiers, transaction amounts, permission boundaries, and enforced minimums remain precise.

## Findings and changes

| Finding | Change |
| --- | --- |
| Entry pages used lists of unexplained terms: issuance, surplus, hooks, terminals, SDK, and settlement. | Start with creating tokens, available project funds, extra features, payment contracts, software libraries, and what actually completed. Define the technical name in that context. |
| Some headings described implementation rather than a reader's task. | Use names such as “New tokens,” “Money and chains,” “Sharing funds,” and “Your first test payment.” Keep guide labels aligned with the actual controls. |
| Repeated reassurance and claims about guarantees obscured the explanation. | Shorten introductions and remove claims of guaranteed prices, instant completion, automatic ownership, or zero risk. Describe the commitment or action the contracts actually provide. |
| A quoted token estimate was labeled as a guaranteed minimum. | Label the estimate as an estimate. Preserve the separate minimum enforced by the transaction. |
| Credits, token creation, market price, and cash out value were mixed together. | Define each separately. A creation rate is before tokens set aside for others; cash out value needs an amount-specific quote. Credits remain transferable when the rules allow. |
| Loan copy described tokens as merely locked. | Explain that borrowing removes the tokens from circulation and records a right to recreate the applicable amount through repayment before expiry. |
| Protocol fees appeared in introductions, task summaries, repeated tables, and technical footnotes. | Keep the complete explanation in one fee section per learning guide, linking to it from relevant tasks. Preserve exact transaction costs and settings that a user must understand to choose an action. |
| The first-payment tutorial was difficult to discover from Build. | Add an explicit “Your first test payment” link near the Build introduction. The app-builder card also leads there. |

## Scope by site

- **Center:** homepage, directory, guided paths, agent index, API entry page, account and wallet setup, and twelve REST documents. The shared API glossary explains unavoidable terms. Bot API access remains separate from wallet spending authority; simulation, submission, and completion remain different states.
- **Juicebox Money:** homepage, Learn, Build, first-payment tutorial, assistant prompts, agent index, payment and cash-out reviews, token/rules/terms screens, loans, and creation controls. Shared concept and price tooltips were corrected and synchronized across the clients.
- **Revnet Money:** homepage, Learn, Build, agent index, creation steps, payment, terms, owner controls, bridges, markets, and loans. Explanations begin with payments and tokens, then stages, allocation, market routing, loans, and contract details.
- **Juicescan:** Learn and Build, static guide output, project explorer, creation, payments, cash outs, token actions, payouts, permissions, and transaction queues. Raw contract records keep their exact names; surrounding copy supplies the explanation.

User-authored project descriptions, source comments, API schemas, and transaction construction were not rewritten as marketing copy. Specialized controls retain the terms needed to identify the actual mechanism.

## Consolidated material

| Earlier section | Where its useful information now lives |
| --- | --- |
| Juicebox Learn: Permissions | Rulesets, with owner grants, wildcard scope, ownership changes, and permission-reference links |
| Juicebox Learn: Migration | Contract overview, including handoff checks and payment-terminal moves |
| Juicebox Learn: Buyback hook | Extensions, including supported pools, routing, and minimum-output protection |
| Juicebox Learn: Croptop | NFT shops, with posting rules and a link to the complete fee explanation |
| Juicebox Learn: Project handles | Project names and payment addresses |
| Juicebox Build: repeated Launch, Configure, and Evolve sections | Contract launch/rules and project-read references |
| Juicebox Build: repeated Revnet overview and stages | Model selection and Revnet deployment reference |
| Juicebox Build: repeated protocol and Revnet fee tables | Canonical Learn fee section, linked from surviving Build sections |
| Old placeholder read walkthrough | Runnable first-payment tutorial; unique SDK/reference information stays in Build |
| Revnet Learn: Start here and verification checklist | Main introduction and first transaction journey |
| Revnet Learn: duplicate Juicebox/Revnet comparison | Build's model-selection table |
| Revnet Build: Money in and out | Running a revnet, plus Learn's payment/cash-out/loan explanations |
| Juicescan Build: duplicate Revnet introduction and fee section | Deployment reference and the single Learn fee section |
| Juicescan Build: duplicate glossary | Linked static Learn glossary |
| Center AI guide: duplicate contract-call JSON template | API transaction-lifecycle reference, with agent-specific instructions retained |

Juicebox Learn has 19 sections, down from 24; Juicebox Build has 35, down from 42. Retired public section links remain as anchors at their relevant successors instead of separate contents entries. Distinct technical references remain available.

## Fee explanation

The dedicated sections explain that Juicebox, Revnet, and Croptop protocol fees are payments to revnets that can return tokens to the people and projects paying them. They identify the receiving revnet and the token recipient for each action. The recipient can be the project owner, holder, cash-out recipient, or another explicitly chosen account.

The text distinguishes cash out tax retained in the original project from payments to fee revnets. It also distinguishes the Revnet cash-out fee's token-count basis from the core fee's outgoing-value basis, explains held fees and exemptions, and avoids treating received tokens as a refund or guaranteed return. Network gas and external exchange costs are separate.

Facts were checked against `JBMultiTerminal`, `JBProjects`, `REVOwner`, `REVLoans`, `CTPublisher`, the buyback hook, and the canonical deployment configuration. A read of Ethereum's deployed Croptop publisher confirmed `FEE_DIVISOR() = 20` and `FEE_PROJECT_ID() = 2`: posting adds 5% of item prices and pays the Croptop Publishing Network. Posting to CPN itself is exempt. Normal subsequent shop purchases do not incur this posting charge.

## Validation

- **Center:** production build and typecheck passed; 1,399 application tests, 373 MCP tests, 53 contract tests, artifact checks, and six desktop/mobile browser checks passed. The 119 optional integration skips were pre-existing. Parallel timeout failures passed on serial retry.
- **Juicebox Money:** production build, typecheck, source checks, and all edited-file lint checks passed. All 48 focused UI tests passed, including a serial timeout retry. All 16 guide browser checks passed, covering narrow/desktop layouts, keyboard use, automatic accessibility checks, clipboard fallback, reading without JavaScript, the explicit tutorial link, and preserved old section links.
- **Juicescan:** all 1,571 tests passed across the broad run and focused retries; syntax checks covered 251 files. Eight static-guide browser checks passed, including reading without JavaScript and automatic accessibility checks. The final bundle remains within its existing budget at 2,108,587 gzip bytes.
- **Revnet Money:** typecheck, source checks, edited-file lint/format, and 145 focused tests passed. All 30 guide browser checks passed against an isolated copy of the revised source, covering desktop, tablet, mobile, 320 px, keyboard use, automatic accessibility checks, clipboard fallback, and reading without JavaScript. The unrelated repository-wide formatting issue in `next.config.js` was not changed.
- Shared definitions match across clients. Retired sections retain their old anchors; no prior Juicebox or Revnet guide ID was lost. Executable tutorial examples and transaction-building logic were unchanged.

Audit commits: Center `1a7bc37`, Juicebox Money `a10e744`, Revnet Money `4bf1afc`, and Juicescan `d24fd11`. The parent reference also preserves Juicebox Money's subsequently published `8b2584c`, which only removes repeated sign-in subtitles. That small diff was inspected separately; the production and browser run above covered `a10e744`.

## Public-site follow-ups

- The public Juicebox Build page inspected during this audit was still the older version: its app-builder card led to the SDK section and it displayed the placeholder read example. The new explicit tutorial link is in the revised source. Publish the tutorial, examples, and navigation together; Center's link alone does not establish that Juicebox Money has deployed them.
- The [CPN project description](https://juicebox.money/eth:2) says 2.5%, which conflicts with the deployed publisher's 5% calculation. The guides use the verified contract rule. That separately managed project description still needs its owner to update it.
- Juicescan's static guides require a new published build and verified CID, followed by Center's directory update. Git pushes alone do not publish that content.

## Rules for future copy

1. Lead with the action or result. Introduce a technical name only when the reader needs to recognize it in a control, contract, or reference.
2. Explain the idea in familiar words, then give its exact name. Keep a short glossary definition and link to the fuller explanation.
3. Keep one complete explanation for each topic. When replacing a section, move unique information and preserve old links before removing it.
4. Put protocol-fee explanations in their dedicated section. Show real costs in transaction reviews and explain settings where the choice depends on them.
5. Say what is committed, estimated, proposed, submitted, or confirmed. Never shorten these into the same claim.
6. Match guide labels to the actual interface. Check entry links, old links, narrow screens, keyboard use, and reading without JavaScript.
