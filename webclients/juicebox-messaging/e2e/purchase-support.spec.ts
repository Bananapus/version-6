import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PRIVATE_ADDRESS_VALUES = [
  "Avery Example",
  "123 Demo Street",
  "Apartment 4B",
  "01000-000",
  "Leave with the front desk.",
];

test("completes private purchase fulfillment without leaking the address before reveal", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Prototype mode.")).toBeVisible();
  await page.getByRole("button", { name: "Project team" }).click();
  await expect(page.getByRole("button", { name: "Project team" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Customer" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 720) {
    const backToMessages = page.getByRole("button", { name: "Back to messages" });
    await expect(page.locator(".inbox-sidebar")).toBeVisible();
    await page.locator(".thread-card").click();
    await expect(backToMessages).toBeVisible();
    await backToMessages.click();
    await expect(page.locator(".inbox-sidebar")).toBeVisible();
    await page.locator(".thread-card").click();
  }

  await page.locator(".composer-tool").click();

  const dialog = page.getByRole("dialog", { name: "Share shipping address" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fill with fictional demo data" }).click();
  await dialog.getByRole("button", { name: "Review recipients" }).click();
  await expect(dialog.getByText("Mira")).toBeVisible();
  await expect(dialog.getByText("Jo")).toBeVisible();
  await dialog.getByRole("button", { name: "Share privately" }).click();

  await expect(
    page.locator("#main-conversation").getByText("Shipping address shared", { exact: true }),
  ).toBeVisible();
  for (const privateValue of PRIVATE_ADDRESS_VALUES) {
    await expect(page.locator("body")).not.toContainText(privateValue);
  }

  await page.getByRole("button", { name: "Project team" }).click();
  if ((page.viewportSize()?.width ?? 0) <= 1040) {
    await page.getByRole("button", { name: "Open purchase details" }).click();
  }

  const details = page.getByRole("complementary", {
    name: "Purchase and fulfillment details",
  });
  await expect(details.getByText("Shipping destination hidden")).toBeVisible();
  await details.getByRole("button", { name: "Reveal" }).click();
  await expect(details.getByText("123 Demo Street", { exact: false })).toBeVisible();

  await details.getByRole("button", { name: "Confirm address v1" }).click();
  await details.getByRole("button", { name: "Mark preparing" }).click();
  await details.getByLabel("Tracking code").fill("AB123456789CD");
  await details.getByRole("button", { name: "Share tracking & mark shipped" }).click();

  await expect(details.locator(".stage-pill")).toHaveText("Shipped");
  await expect(details.getByText("AB123456789CD", { exact: true })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 1040) {
    await page.getByRole("button", { name: "Close order details" }).click();
  }
  await page.getByRole("button", { name: "Customer" }).click();
  await page.locator(".composer-tool").click();

  const correctionDialog = page.getByRole("dialog", { name: "Share delivery correction" });
  await correctionDialog.getByLabel("Address line 1").fill("456 Correction Lane");
  await correctionDialog.getByRole("button", { name: "Review recipients" }).click();
  await correctionDialog.getByRole("button", { name: "Share correction" }).click();
  await expect(
    page.getByText("Delivery address correction shared", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("456 Correction Lane");

  await page.getByRole("button", { name: "Project team" }).click();
  if ((page.viewportSize()?.width ?? 0) <= 1040) {
    await page.getByRole("button", { name: "Open purchase details" }).click();
  }
  await expect(details.locator(".stage-pill")).toHaveText("Shipped");
  await expect(details.getByText("Correction details hidden")).toBeVisible();
  await details.getByRole("button", { name: "Reveal correction" }).click();
  await expect(details.getByText("456 Correction Lane", { exact: false })).toBeVisible();

  const browserPersistence = await page.evaluate(async () => ({
    cacheNames: await caches.keys(),
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
  }));
  expect(browserPersistence).toEqual({
    cacheNames: [],
    localStorageKeys: [],
    sessionStorageKeys: [],
  });
});

test("initial experience and security-owned shipping review remain accessible", async ({
  page,
}) => {
  await page.goto("/");
  const app = page.locator(".app-shell");
  const theme = page.getByLabel("Preview theme");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  if ((page.viewportSize()?.width ?? 0) <= 720) {
    await page.locator(".thread-card").click();
  }
  await page.locator(".composer-tool").click();
  const dialog = page.getByRole("dialog", { name: "Share shipping address" });
  const recipientName = dialog.getByLabel("Recipient name");
  await expect(recipientName).toHaveAttribute("name", "recipientName");
  await expect(recipientName).toHaveAttribute("required", "");
  await dialog.getByRole("button", { name: "Review recipients" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Complete the highlighted required fields",
  );
  await expect(recipientName).toBeFocused();
  await expect(recipientName).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Fill with fictional demo data" }).click();
  await dialog.getByRole("button", { name: "Review recipients" }).click();
  await expect(dialog.getByText("Messaging service check")).toBeVisible();

  await page.locator(".security-confirmation").evaluate((confirmation) => {
    const probe = document.createElement("div");
    probe.className = "security-roster-alert";
    probe.dataset.securityRosterProbe = "true";
    probe.setAttribute("aria-hidden", "true");
    probe.textContent = "Roster changed";
    confirmation.append(probe);
  });

  const securityColors = () =>
    page.locator(".security-confirmation").evaluate((confirmation) => {
      const colorsOf = (element: Element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.borderTopColor, style.color];
      };
      const colorsFor = (selector: string) => {
        const element = confirmation.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing security element: ${selector}`);
        return colorsOf(element);
      };
      return {
        confirmation: colorsOf(confirmation),
        marker: colorsFor(".security-confirmation-marker"),
        roster: colorsFor(".recipient-review"),
        rosterMeta: colorsFor(".recipient-review-heading small"),
        recipient: colorsFor(".recipient-row strong"),
        credential: colorsFor(".recipient-row small"),
        verified: colorsFor(".verified-mini"),
        rosterChanged: colorsFor('[data-security-roster-probe="true"]'),
        copyLimit: colorsFor(".security-copy-limit"),
      };
    });
  const fixedSecurityColors = await securityColors();

  for (const preset of ["juicebox", "revnet", "neutral"] as const) {
    await theme.evaluate((element, nextPreset) => {
      const select = element as HTMLSelectElement;
      select.value = nextPreset;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, preset);
    await expect(app).toHaveAttribute("data-theme-preset", preset);
    expect(await securityColors()).toEqual(fixedSecurityColors);
  }

  await page.locator('[data-security-roster-probe="true"]').evaluate((probe) => probe.remove());
  const reviewResults = await new AxeBuilder({ page }).analyze();
  expect(reviewResults.violations).toEqual([]);
});

test("applies only bounded first-party theme presets without restyling security warnings", async ({
  page,
}) => {
  await page.goto("/");

  const app = page.locator(".app-shell");
  const theme = page.getByLabel("Preview theme");
  const developmentBanner = page.locator(".prototype-banner");
  const warningBackground = await developmentBanner.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await expect(theme.locator("option")).toHaveCount(3);
  await theme.selectOption("revnet");
  await expect(app).toHaveAttribute("data-theme-preset", "revnet");
  await expect(page.locator(".brand-mark")).toHaveCSS("border-radius", "0px");
  await expect(page.locator(".brand-mark")).toHaveCSS("background-color", "rgb(104, 202, 143)");
  await expect(page.locator(".brand-mark")).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.locator(".thread-card")).toHaveCSS("padding-top", "8px");
  expect(await app.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    "ui-monospace",
  );
  await expect(developmentBanner).toHaveCSS("background-color", warningBackground);

  await theme.selectOption("neutral");
  await expect(app).toHaveAttribute("data-theme-preset", "neutral");
  await expect(page.locator(".brand-mark")).toHaveCSS("border-radius", "6px");
  await expect(page.locator(".brand-mark")).toHaveCSS("background-color", "rgb(53, 72, 165)");
  await expect(page.locator(".thread-card")).toHaveCSS("padding-top", "11px");
  await expect(developmentBanner).toHaveCSS("background-color", warningBackground);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("registers a no-cache service worker without adding an application cache", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL;
  });
  expect(scriptUrl).toBe("http://127.0.0.1:3004/sw.js");

  const response = await request.get("/sw.js");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
