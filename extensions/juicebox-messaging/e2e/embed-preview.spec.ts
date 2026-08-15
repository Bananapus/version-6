import { expect, test, type Page } from "@playwright/test";

test("establishes the deterministic cross-origin channel without console errors", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/embed-preview");

  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[title="Local cross-origin secure messaging preview"]');
  await expect(frame.getByRole("heading", { name: "Sample Project" })).toBeVisible();
  const frameDocument = page.frames().find((candidate) =>
    candidate.url().endsWith("/embed-preview/frame"),
  );
  expect(frameDocument).toBeDefined();
  expect(
    await frameDocument!.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration("/")) === undefined,
    ),
  ).toBe(true);

  const standalone = page.getByRole("link", { name: "Open standalone messaging" });
  await expect(standalone).toBeVisible();
  await expect(standalone).toHaveAttribute("href", "http://localhost:3004/");
  await expect(standalone).toHaveAttribute("rel", "noopener noreferrer");

  await page.getByRole("button", { name: "Revnet" }).click();
  await expect(frame.getByText("Revnet", { exact: true })).toHaveText("Revnet");
  await frame.getByRole("button", { name: "Request full client" }).click();
  await expect(page.getByText("user-request", { exact: true })).toBeVisible();
  await expect(standalone).toHaveAttribute("href", "http://localhost:3004/");

  await expect(page.getByText("frame.bootstrap_ready", { exact: true })).toBeVisible();
  await expect(page.getByText("host.init", { exact: true })).toBeVisible();
  await expect(page.getByText("frame.ready", { exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("materializes a nonce-bound custom semantic theme and rejects unsafe contrast", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const frameResponsePromise = page.waitForResponse(
    (response) =>
      response.request().resourceType() === "document" &&
      response.url().endsWith("/embed-preview/frame"),
  );
  await page.goto("/embed-preview");
  const frameResponse = await frameResponsePromise;

  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();
  const csp = (await frameResponse.headerValue("content-security-policy")) ?? "";
  const cspNonce = csp.match(/style-src[^;]*'nonce-([^']+)'/)?.[1];
  expect(cspNonce).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain("style-src-attr 'none'");
  expect(csp).not.toContain("'unsafe-inline'");

  const frame = page.frameLocator(
    'iframe[title="Local cross-origin secure messaging preview"]',
  );
  const securityBar = frame
    .getByText("Local frame · non-production", { exact: true })
    .locator("..");
  const securityBefore = await securityBar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });

  await page.getByRole("button", { name: "Custom semantic" }).click();
  await expect(
    frame.getByText(
      "Custom semantic tokens are active through a validated, nonce-bearing owned stylesheet.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(frame.getByText("Juicebox", { exact: true })).toHaveText(
    "Juicebox",
  );

  const customMetrics = await frame
    .locator('[data-embed-custom-theme="v1"]')
    .evaluate((scope) => {
      const document = scope.ownerDocument;
      const ownedStyles = [...document.querySelectorAll("style")].filter(
        (style) =>
          style.textContent?.startsWith(
            ':where([data-embed-custom-theme="v1"]) {',
          ),
      );
      const threadCard = document
        .getElementById("sample-thread-title")
        ?.closest("section");
      if (ownedStyles.length !== 1 || !threadCard) {
        throw new Error("Missing owned theme stylesheet or sample thread.");
      }
      const scopeStyle = getComputedStyle(scope);
      const threadStyle = getComputedStyle(threadCard);
      return {
        background: scopeStyle.backgroundColor,
        density: scopeStyle.getPropertyValue("--theme-density").trim(),
        fontFamily: scopeStyle.fontFamily,
        inlineStyleCount: scope.querySelectorAll("[style]").length,
        ownedStyleNonce: ownedStyles[0].nonce,
        ownedStyleText: ownedStyles[0].textContent ?? "",
        scriptNonces: [...document.scripts].map((script) => script.nonce),
        threadRadius: threadStyle.borderRadius,
      };
    });

  expect(customMetrics.background).toBe("rgb(255, 255, 255)");
  expect(customMetrics.density).toBe("0.875");
  expect(customMetrics.fontFamily).toContain("ui-monospace");
  expect(customMetrics.threadRadius).toBe("0px");
  expect(customMetrics.inlineStyleCount).toBe(0);
  expect(customMetrics.ownedStyleNonce).toBe(cspNonce);
  expect(customMetrics.scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(customMetrics.scriptNonces)).toEqual(new Set([cspNonce!]));
  expect(customMetrics.ownedStyleText).not.toMatch(
    /url\s*\(|@import|expression\s*\(|javascript:|<|>/i,
  );

  const securityAfter = await securityBar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(securityAfter).toEqual(securityBefore);
  expect(securityAfter).toEqual({
    background: "rgb(18, 24, 39)",
    color: "rgb(255, 255, 255)",
  });

  await page.getByRole("button", { name: "Revnet" }).click();
  await expect(frame.getByText("Revnet", { exact: true })).toHaveText("Revnet");
  await expect(
    frame.locator('[data-embed-custom-theme="v1"]'),
  ).toHaveCount(0);
  expect(
    await frame.locator("style").evaluateAll((styles) =>
      styles.filter((style) =>
        style.textContent?.startsWith(
          ':where([data-embed-custom-theme="v1"]) {',
        ),
      ).length,
    ),
  ).toBe(0);

  await page
    .getByRole("button", { name: "Exercise unsafe-theme rejection" })
    .click();
  await expect(page.getByText("Preview channel rejected")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("replaces trusted malformed and origin-drifted iframe documents", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/embed-preview");
  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();
  await installStatusHistory(page);

  const firstElement = await page.locator("iframe").elementHandle();
  const firstFrame = page.frames().find((frame) =>
    frame.url().endsWith("/embed-preview/frame"),
  );
  expect(firstElement).not.toBeNull();
  expect(firstFrame).toBeDefined();
  await firstFrame!.evaluate((parentOrigin) => {
    window.parent.postMessage({ trustedButMalformed: true }, parentOrigin);
  }, new URL(page.url()).origin);

  await expect
    .poll(() => wasStatusObserved(page, "outside the bounded channel"))
    .toBe(true);
  await expect.poll(() => firstElement!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();

  const secondElement = await page.locator("iframe").elementHandle();
  expect(secondElement).not.toBeNull();
  await page.evaluate(() => {
    const child = document.querySelector("iframe")?.contentWindow;
    if (!child) throw new Error("Missing active frame WindowProxy.");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { drift: true },
        origin: "https://origin-drift.invalid",
        source: child,
      }),
    );
  });

  await expect
    .poll(() => wasStatusObserved(page, "changed origin"))
    .toBe(true);
  await expect.poll(() => secondElement!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();

  const thirdElement = await page.locator("iframe").elementHandle();
  const thirdFrame = page.frames().find((frame) =>
    frame.url().endsWith("/embed-preview/frame"),
  );
  expect(thirdElement).not.toBeNull();
  expect(thirdFrame).toBeDefined();
  await thirdFrame!.evaluate(() => window.location.assign("about:blank"));
  await expect
    .poll(() => wasStatusObserved(page, "Frame navigation destroyed"))
    .toBe(true);
  await expect.poll(() => thirdElement!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("removes a timed-out frame and reconstructs only the fixed source on restart", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  test.setTimeout(30_000);
  const browserErrors = collectBrowserErrors(page);
  const framePattern = "**/embed-preview/frame";
  await page.route(framePattern, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>inert frame fixture</title>",
    });
  });

  await page.goto("/embed-preview");
  await expect(page.getByText("Preview channel rejected")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("iframe")).toHaveCount(0);
  const restart = page.getByRole("button", { name: "Restart with a fresh channel" });
  await expect(restart).toBeEnabled();

  await page.unroute(framePattern);
  await restart.click();
  await expect(
    page.getByText("Authenticated preview channel established"),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "http://localhost:3004/embed-preview/frame",
  );
  expect(browserErrors).toEqual([]);
});

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installStatusHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const global = window as typeof window & { __embedStatusHistory?: string[] };
    global.__embedStatusHistory = [];
    const record = () => global.__embedStatusHistory?.push(document.body.innerText);
    new MutationObserver(record).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    record();
  });
}

async function wasStatusObserved(page: Page, fragment: string): Promise<boolean> {
  return page.evaluate((expected) => {
    const global = window as typeof window & { __embedStatusHistory?: string[] };
    return global.__embedStatusHistory?.some((entry) => entry.includes(expected)) ?? false;
  }, fragment);
}
