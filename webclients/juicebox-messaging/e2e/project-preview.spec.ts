import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const LOGO_URI =
  "https://untrusted-content.invalid/project-11/logo.svg?private=logo-sentinel";
const METADATA_URI =
  "https://untrusted-content.invalid/project-11/metadata.json?private=metadata-sentinel";

const CANDIDATE_PROJECT_PREVIEW = {
  kind: "candidate-display-only",
  source: "bendystraw-v6-indexer",
  sourceNetwork: "testnet",
  ref: {
    protocol: "juicebox-v6",
    chainId: 84532,
    projectId: 11,
    version: 6,
  },
  name: "Fictional Base Sepolia Project",
  untrustedLogoUri: LOGO_URI,
  projectTagline: "A deterministic, indexer-only project preview.",
  suckerGroupId: "fictional-sucker-group-11",
  accountingContext: {
    kind: "latest-indexed-terminal-accounting-context",
    tokenAddress: "0x000000000000000000000000000000000000eeee",
    tokenSymbol: "ETH",
    decimals: 18,
    currency: "61166",
    projectTokenIdentity: "not-evaluated",
  },
  isRevnet: true,
  untrustedMetadataUri: METADATA_URI,
  claims: {
    authorization: "not-evaluated",
    eligibility: "not-evaluated",
    purchase: "not-evaluated",
    finality: "not-evaluated",
  },
} as const;

test("shows an untrusted candidate without fetching media or granting access", async ({
  page,
}) => {
  const resolverRequests: URL[] = [];
  const untrustedRequests: string[] = [];

  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "untrusted-content.invalid") {
      untrustedRequests.push(request.url());
    }
  });
  await page.route("**/api/juicebox/projects/resolve?*", async (route) => {
    resolverRequests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ data: CANDIDATE_PROJECT_PREVIEW }),
    });
  });

  await page.goto("/projects");
  await page.getByRole("button", { name: "Load indexed preview" }).click();

  const result = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: CANDIDATE_PROJECT_PREVIEW.name,
      exact: true,
    }),
  });
  await expect(result).toBeVisible();

  expect(resolverRequests).toHaveLength(1);
  expect(resolverRequests[0]?.pathname).toBe(
    "/api/juicebox/projects/resolve",
  );
  expect(Object.fromEntries(resolverRequests[0]?.searchParams ?? [])).toEqual({
    chainId: "84532",
    projectId: "11",
    version: "6",
  });

  await expect(result.getByText("Candidate display only", { exact: true })).toBeVisible();
  await expect(result.getByText("#11", { exact: true })).toBeVisible();
  await expect(result.getByText("Base Sepolia", { exact: true })).toBeVisible();
  await expect(result.getByText("Juicebox v6", { exact: true })).toBeVisible();
  await expect(
    result.getByText("This lookup does not grant chat access.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not an access decision", { exact: true })).toBeVisible();
  await expect(page.getByText("No wallet is connected on this page.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No lookup can unlock or create a conversation.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not evaluated", { exact: true })).toHaveCount(4);

  await result.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  const renderedDocument = await page.content();
  expect(renderedDocument).not.toContain(LOGO_URI);
  expect(renderedDocument).not.toContain(METADATA_URI);
  expect(untrustedRequests).toEqual([]);
  await expect(
    page.getByRole("button", {
      name: /connect wallet|sign with wallet|authorize|grant chat access|open chat|create conversation/i,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: /connect wallet|sign with wallet|authorize|grant chat access|open chat|create conversation/i,
    }),
  ).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByLabel("Project ID").fill("01");
  await page.getByRole("button", { name: "Load indexed preview" }).click();

  const validationError = page
    .getByRole("alert")
    .filter({ hasText: "invalid_project_id" });
  await expect(validationError).toContainText("invalid_project_id");
  await expect(validationError).toContainText(
    "Enter a whole-number project ID greater than zero, with no signs, spaces, decimals, or leading zeros.",
  );
  expect(resolverRequests).toHaveLength(1);
});
