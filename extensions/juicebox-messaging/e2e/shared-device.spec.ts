import { expect, test, type Page } from "@playwright/test";

const SERVICE_ORIGIN =
  process.env.SHARED_E2E_SERVICE_ORIGIN ?? "http://localhost:3005";
const REACHABLE_ORIGIN =
  process.env.SHARED_E2E_REACHABLE_ORIGIN ?? "http://0.0.0.0:3005";
const BOOTSTRAP_SECRET = "playwright-shared-bootstrap-secret";
const CUSTOMER_MESSAGE = "Fictional customer checking in from the laptop.";
const PROJECT_REPLY = "Fictional project reply from the second test device.";
const CATCH_UP_MESSAGE = "Fictional update sent while the customer view is closed.";
const TRACKING_CODE = "TEST-ONLY-123456";

async function sendMessage(page: Page, body: string) {
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".timeline").getByText(body, { exact: true })).toBeVisible();
}

test("pairs opposite fixed roles and completes a durable fictional fulfillment flow", async ({
  browser,
}) => {
  const customerContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const projectContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.6,
    hasTouch: true,
    isMobile: true,
  });
  const reuseContext = await browser.newContext({
    viewport: { width: 1100, height: 800 },
  });

  try {
    let customerPage = await customerContext.newPage();
    const projectPage = await projectContext.newPage();

    await customerPage.goto(`${SERVICE_ORIGIN}/shared`);
    await expect(
      customerPage.getByRole("heading", { name: "Start a shared LAN test" }),
    ).toBeVisible();
    await customerPage.getByLabel("Customer").check();
    await customerPage.getByLabel("Development bootstrap secret").fill(BOOTSTRAP_SECRET);
    const reachableOriginField = customerPage.getByLabel("Origin your phone can reach");
    if (await reachableOriginField.count()) {
      await reachableOriginField.fill(REACHABLE_ORIGIN);
    }
    await customerPage.getByRole("button", { name: "Create shared test" }).click();

    await expect(
      customerPage.getByRole("heading", { name: "Connect the second device" }),
    ).toBeVisible();
    const invitationUrl = (await customerPage.locator("#shared-invite-url").textContent())?.trim();
    expect(invitationUrl).toBeTruthy();
    const parsedInvitation = new URL(invitationUrl!);
    expect(parsedInvitation.pathname).toBe("/shared");
    expect(parsedInvitation.search).toBe("");
    expect(parsedInvitation.hash).toMatch(/^#invite=[A-Za-z0-9_-]{43}$/);
    const invitationOrigin = parsedInvitation.origin;
    expect(invitationOrigin).toBe(REACHABLE_ORIGIN);
    const invitationQr = customerPage.getByRole("img", {
      name: "QR code for the one-time phone invite",
    });
    await expect(invitationQr).toBeVisible();
    await expect(invitationQr).toHaveAttribute("src", /^data:image\/png;base64,/);

    await projectPage.goto(invitationUrl!);
    await expect(
      projectPage.getByRole("heading", { name: "Join the shared test" }),
    ).toBeVisible();
    await expect(projectPage).toHaveURL(`${invitationOrigin}/shared`);
    await expect(
      customerPage.getByRole("heading", { name: "Connect the second device" }),
    ).toBeVisible();
    await projectPage.getByRole("button", { name: "Join shared test" }).click();

    await expect(
      customerPage.getByLabel("Fixed shared-test role: Customer"),
    ).toBeVisible();
    await expect(
      projectPage.getByLabel("Fixed shared-test role: Project team"),
    ).toBeVisible();
    await expect(
      customerPage.getByRole("group", { name: "Switch demo role" }),
    ).toHaveCount(0);
    await expect(
      projectPage.getByRole("group", { name: "Switch demo role" }),
    ).toHaveCount(0);
    await expect(
      customerPage.getByRole("button", { name: "Project team", exact: true }),
    ).toHaveCount(0);
    await expect(
      projectPage.getByRole("button", { name: "Customer", exact: true }),
    ).toHaveCount(0);

    await sendMessage(customerPage, CUSTOMER_MESSAGE);
    await expect(
      projectPage.locator(".timeline").getByText(CUSTOMER_MESSAGE, { exact: true }),
    ).toBeVisible();
    await sendMessage(projectPage, PROJECT_REPLY);
    await expect(
      customerPage.locator(".timeline").getByText(PROJECT_REPLY, { exact: true }),
    ).toBeVisible();

    await customerPage.reload();
    await expect(
      customerPage.getByLabel("Fixed shared-test role: Customer"),
    ).toBeVisible();
    await expect(
      customerPage.locator(".timeline").getByText(PROJECT_REPLY, { exact: true }),
    ).toBeVisible();

    await customerPage.close();
    await sendMessage(projectPage, CATCH_UP_MESSAGE);
    customerPage = await customerContext.newPage();
    await customerPage.goto(`${SERVICE_ORIGIN}/shared`);
    await expect(
      customerPage.locator(".timeline").getByText(CATCH_UP_MESSAGE, { exact: true }),
    ).toBeVisible();

    await projectPage.getByRole("button", { name: "Open purchase details" }).click();
    const projectDetails = projectPage.getByRole("complementary", {
      name: "Purchase and fulfillment details",
    });
    await expect(projectDetails).toBeVisible();
    await projectDetails.getByRole("button", { name: "Request address" }).click();
    await expect(
      customerPage.locator(".timeline").getByText("Shipping address requested", {
        exact: true,
      }),
    ).toBeVisible();

    await customerPage
      .getByRole("button", { name: "Share shipping address", exact: true })
      .first()
      .click();
    const addressDialog = customerPage.getByRole("dialog", {
      name: "Share shipping address",
    });
    await addressDialog.getByRole("button", { name: "Fill with fictional demo data" }).click();
    await addressDialog.getByRole("button", { name: "Review recipients" }).click();
    await expect(addressDialog.getByText("Customer role", { exact: true })).toBeVisible();
    await expect(addressDialog.getByText("Project role", { exact: true })).toBeVisible();
    await addressDialog.getByRole("button", { name: "Send fictional address" }).click();

    await expect(
      projectPage.locator(".timeline").getByText("Shipping address shared", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(projectPage.locator("body")).not.toContainText("123 Demo Street");
    await expect(projectDetails.getByText("Shipping destination hidden")).toBeVisible();
    await projectDetails.getByRole("button", { name: "Reveal" }).click();
    await expect(projectDetails.getByText("123 Demo Street", { exact: false })).toBeVisible();

    await projectDetails.getByRole("button", { name: "Confirm address v1" }).click();
    await projectDetails.getByRole("button", { name: "Mark preparing" }).click();
    await projectDetails.getByLabel("Tracking code").fill(TRACKING_CODE);
    await projectDetails
      .getByRole("button", { name: "Share tracking & mark shipped" })
      .click();

    await expect(projectDetails.locator(".stage-pill")).toHaveText("Shipped");
    await expect(projectDetails.getByText(TRACKING_CODE, { exact: true })).toBeVisible();
    await expect(
      customerPage.locator(".timeline").getByText("Order marked shipped", { exact: false }),
    ).toBeVisible();
    await expect(
      customerPage.locator(".timeline").getByText(TRACKING_CODE, { exact: true }),
    ).toBeVisible();
    await expect(
      customerPage.getByRole("group", { name: "Switch demo role" }),
    ).toHaveCount(0);

    const reusePage = await reuseContext.newPage();
    await reusePage.goto(invitationUrl!);
    await expect(reusePage).toHaveURL(`${invitationOrigin}/shared`);
    await reusePage.getByRole("button", { name: "Join shared test" }).click();
    await expect(reusePage.locator(".shared-error")).toContainText(
      "invalid, expired, or already used",
    );
  } finally {
    await reuseContext.close();
    await projectContext.close();
    await customerContext.close();
  }
});
