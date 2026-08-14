import { expect, test } from "@playwright/test";

const PUBLIC_ORIGIN = "https://messages.example.com";
const LOCAL_ORIGIN = "http://127.0.0.1:3020";
const NEXT_ROUTE_ANNOUNCER_STYLE = [
  {
    className: "",
    style: "position: absolute;",
    tagName: "NEXT-ROUTE-ANNOUNCER",
  },
];
const NEXT_ROUTE_ANNOUNCER_SHADOW_STYLE = [
  {
    className: "",
    style:
      "position: absolute; border: 0px; height: 1px; margin: -1px; padding: 0px; width: 1px; clip: rect(0px, 0px, 0px, 0px); overflow: hidden; white-space: nowrap; overflow-wrap: normal;",
    tagName: "DIV",
  },
];
const SERVICE_WORKER_POLICY_REJECTION_VECTORS = [
  "",
  "sw.js",
  "/SW.js",
  "/sw.js/",
  "/sw.js?update=1",
  "/sw.js#fragment",
  "/sw%2Ejs",
  "/%73w.js",
  "//messages.example.com/sw.js",
  "https://messages.example.com/sw.js",
  " /sw.js",
  "/sw.js ",
];

test("documents hydrate under strict production CSP and absent embeds stay explicit", async ({
  context,
}) => {
  test.setTimeout(90_000);
  // Playwright request routing cannot proxy a ServiceWorker script request for
  // this virtual HTTPS authority. Record the real top-level registration call
  // here; the local-lab browser suite separately proves /sw.js activates.
  await context.addInitScript((rejectionVectors) => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const originalRegister = container.register;
    const attempts: Array<{
      scriptURL: string;
      scope?: string;
      typeTag: string;
    }> = [];
    const observedWindow = window as typeof window & {
      __pwaRegistrationAttempts?: Array<{
        scriptURL: string;
        scope?: string;
        typeTag: string;
      }>;
      __serviceWorkerPolicyAudits?: Array<{
        acceptedInputs: string[];
        name: string;
        rejectedInputs: string[];
        returnedLiteral: unknown;
      }>;
      trustedTypes?: {
        createPolicy: (
          name: string,
          rules: { readonly createScriptURL?: (value: string) => unknown },
        ) => unknown;
      };
    };
    observedWindow.__pwaRegistrationAttempts = attempts;
    observedWindow.__serviceWorkerPolicyAudits = [];
    const trustedTypes = observedWindow.trustedTypes;
    if (trustedTypes !== undefined) {
      const originalCreatePolicy = trustedTypes.createPolicy.bind(trustedTypes);
      Object.defineProperty(trustedTypes, "createPolicy", {
        configurable: true,
        value: (
          name: string,
          rules: { readonly createScriptURL?: (value: string) => unknown },
        ) => {
          if (name === "juicebox-messaging#service-worker") {
            const acceptedInputs: string[] = [];
            const rejectedInputs: string[] = [];
            const vectors = ["/sw.js", ...rejectionVectors];
            for (const value of vectors) {
              try {
                rules.createScriptURL?.(value);
                acceptedInputs.push(value);
              } catch {
                rejectedInputs.push(value);
              }
            }
            observedWindow.__serviceWorkerPolicyAudits?.push({
              acceptedInputs,
              name,
              rejectedInputs,
              returnedLiteral: rules.createScriptURL?.("/sw.js"),
            });
          }
          return originalCreatePolicy(name, rules);
        },
      });
    }
    const instrumentedRegister: typeof container.register = (
      scriptURL,
      options,
    ) => {
      attempts.push({
        scriptURL: scriptURL.toString(),
        ...(options?.scope === undefined ? {} : { scope: options.scope }),
        typeTag: Object.prototype.toString.call(scriptURL),
      });
      return originalRegister.call(container, scriptURL, options);
    };
    Object.defineProperty(container, "register", {
      configurable: true,
      value: instrumentedRegister,
    });
  }, SERVICE_WORKER_POLICY_REJECTION_VECTORS);
  await context.route(`${PUBLIC_ORIGIN}/**`, async (route) => {
    const publicUrl = new URL(route.request().url());
    const forwardedHeaders: Record<string, string> = {
      ...route.request().headers(),
      "x-forwarded-host": "messages.example.com",
      "x-forwarded-proto": "https",
    };
    delete forwardedHeaders.host;
    const response = await route.fetch({
      url: `${LOCAL_ORIGIN}${publicUrl.pathname}${publicUrl.search}`,
      headers: forwardedHeaders,
    });
    await route.fulfill({ response });
  });

  const observedNonces = new Set<string>();
  for (const pathname of ["/", "/shared", "/projects"]) {
    const page = await context.newPage();
    const browserSecurityFailures: string[] = [];
    const immutableAssetCacheControls: string[] = [];
    const immutableAssetContentSecurityPolicies: string[] = [];
    page.on("pageerror", (error) => browserSecurityFailures.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /(content security policy|violat|trustedhtml|trustedscript)/i.test(
          message.text(),
        )
      ) {
        browserSecurityFailures.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (
        new URL(response.url()).pathname.startsWith("/_next/static/") &&
        response.status() >= 400
      ) {
        browserSecurityFailures.push(
          `Static asset ${response.url()} returned ${response.status()}.`,
        );
      }
      if (
        new URL(response.url()).pathname.startsWith("/_next/static/") &&
        response.status() < 400
      ) {
        immutableAssetCacheControls.push(
          response.headers()["cache-control"] ?? "",
        );
        immutableAssetContentSecurityPolicies.push(
          response.headers()["content-security-policy"] ?? "",
        );
      }
    });

    const response = await page.goto(`${PUBLIC_ORIGIN}${pathname}`, {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);
    const csp = response?.headers()["content-security-policy"] ?? "";
    const responseHeaders = response?.headers() ?? {};
    const nonce = csp.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain(
      "trusted-types nextjs nextjs#bundler juicebox-messaging#service-worker",
    );
    expect(csp).not.toContain("'unsafe-inline'");
    expect(responseHeaders["x-frame-options"]).toBe("DENY");
    expect(responseHeaders["cross-origin-resource-policy"]).toBe("same-origin");
    expect(responseHeaders["strict-transport-security"]).toBe("max-age=63072000");
    expect(responseHeaders["cache-control"]).toContain("no-store");
    observedNonces.add(nonce!);

    if (pathname === "/") {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const observedWindow = window as typeof window & {
              __pwaRegistrationAttempts?: Array<{
                scriptURL: string;
                scope?: string;
              }>;
            };
            return observedWindow.__pwaRegistrationAttempts ?? [];
          }),
        )
        .toEqual([
          {
            scriptURL: "/sw.js",
            scope: "/",
            typeTag: "[object TrustedScriptURL]",
          },
        ]);
      expect(
        await page.evaluate(() => {
          const observedWindow = window as typeof window & {
            __serviceWorkerPolicyAudits?: unknown[];
          };
          return observedWindow.__serviceWorkerPolicyAudits ?? [];
        }),
      ).toEqual([
        {
          acceptedInputs: ["/sw.js"],
          name: "juicebox-messaging#service-worker",
          rejectedInputs: SERVICE_WORKER_POLICY_REJECTION_VECTORS,
          returnedLiteral: "/sw.js",
        },
      ]);
      const roleButton = page.getByRole("button", { name: "Project team" });
      await roleButton.click();
      await expect(roleButton).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("link", { name: "Resolve a project" }).click();
      await expect(
        page.getByRole("heading", {
          name: "Find the project. Keep trust separate.",
        }),
      ).toBeVisible();
    } else if (pathname === "/shared") {
      await expect(
        page.getByRole("heading", { name: "Start a shared LAN test" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", {
          name: "Find the project. Keep trust separate.",
        }),
      ).toBeVisible();
    }

    const nonceAudit = await page.evaluate(() => {
      const scripts = [...document.scripts];
      const styles = [...document.querySelectorAll("style")];
      return {
        scriptCount: scripts.length,
        scriptsWithoutNonce: scripts.filter((script) => !script.nonce).length,
        scriptNonces: [...new Set(scripts.map((script) => script.nonce))],
        stylesWithoutNonce: styles.filter((style) => !style.nonce).length,
        styleAttributes: [...document.querySelectorAll<HTMLElement>("[style]")].map(
          (element) => ({
            className: element.className,
            style: element.getAttribute("style"),
            tagName: element.tagName,
          }),
        ),
        routeAnnouncerShadowStyles: [
          ...(
            document.querySelector("next-route-announcer")?.shadowRoot ??
            document.createDocumentFragment()
          ).querySelectorAll<HTMLElement>("[style]"),
        ].map((element) => ({
          className: element.className,
          style: element.getAttribute("style"),
          tagName: element.tagName,
        })),
      };
    });
    expect(nonceAudit.scriptCount).toBeGreaterThan(0);
    expect(nonceAudit.scriptsWithoutNonce).toBe(0);
    expect(nonceAudit.scriptNonces).toEqual([nonce]);
    expect(nonceAudit.stylesWithoutNonce).toBe(0);
    expect(nonceAudit.styleAttributes).toEqual(NEXT_ROUTE_ANNOUNCER_STYLE);
    expect(nonceAudit.routeAnnouncerShadowStyles).toEqual(
      NEXT_ROUTE_ANNOUNCER_SHADOW_STYLE,
    );
    expect(immutableAssetCacheControls.length).toBeGreaterThan(0);
    for (const cacheControl of immutableAssetCacheControls) {
      expect(cacheControl).toContain("max-age=31536000");
      expect(cacheControl).toContain("immutable");
    }
    for (const staticCsp of immutableAssetContentSecurityPolicies) {
      expect(staticCsp).toBe("");
    }
    if (pathname === "/") {
      const publicAssetPolicies = await page.evaluate(async () => {
        const paths = ["/icon.svg", "/manifest.webmanifest", "/sw.js"];
        return Object.fromEntries(
          await Promise.all(
            paths.map(async (path) => {
              const response = await fetch(path);
              return [
                path,
                {
                  cacheControl: response.headers.get("cache-control"),
                  contentSecurityPolicy: response.headers.get(
                    "content-security-policy",
                  ),
                },
              ];
            }),
          ),
        );
      });
      expect(publicAssetPolicies["/icon.svg"].cacheControl).toBe(
        "public, max-age=3600, must-revalidate",
      );
      expect(publicAssetPolicies["/manifest.webmanifest"].cacheControl).toBe(
        "public, max-age=3600, must-revalidate",
      );
      expect(publicAssetPolicies["/sw.js"].cacheControl).toBe(
        "no-cache, no-store, must-revalidate",
      );
      expect(publicAssetPolicies["/sw.js"].contentSecurityPolicy).toContain(
        "script-src 'none'",
      );
      expect(publicAssetPolicies["/sw.js"].contentSecurityPolicy).not.toContain(
        "'unsafe-inline'",
      );
    }
    expect(browserSecurityFailures).toEqual([]);
    await page.close();
  }

  const notFoundPage = await context.newPage();
  const notFoundSecurityFailures: string[] = [];
  notFoundPage.on("pageerror", (error) =>
    notFoundSecurityFailures.push(error.message),
  );
  notFoundPage.on("console", (message) => {
    if (
      message.type() === "error" &&
      /(content security policy|violat|trustedhtml|trustedscript)/i.test(
        message.text(),
      )
    ) {
      notFoundSecurityFailures.push(message.text());
    }
  });
  const notFoundResponse = await notFoundPage.goto(
    `${PUBLIC_ORIGIN}/definitely-not-a-real-route`,
    { waitUntil: "networkidle" },
  );
  expect(notFoundResponse?.status()).toBe(404);
  const notFoundCsp =
    notFoundResponse?.headers()["content-security-policy"] ?? "";
  const notFoundNonce = notFoundCsp.match(
    /script-src[^;]*'nonce-([^']+)'/,
  )?.[1];
  expect(notFoundNonce).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  expect(notFoundCsp).not.toContain("'unsafe-inline'");
  expect(notFoundResponse?.headers()["x-frame-options"]).toBe("DENY");
  await expect(
    notFoundPage.getByRole("heading", { name: "This page is not available." }),
  ).toBeVisible();
  const notFoundNonceAudit = await notFoundPage.evaluate(() => ({
    scriptCount: document.scripts.length,
    scriptsWithoutNonce: [...document.scripts].filter((script) => !script.nonce)
      .length,
    scriptNonces: [
      ...new Set([...document.scripts].map((script) => script.nonce)),
    ],
    stylesWithoutNonce: [...document.querySelectorAll("style")].filter(
      (style) => !style.nonce,
    ).length,
    styleAttributes: [...document.querySelectorAll<HTMLElement>("[style]")].map(
      (element) => ({
        className: element.className,
        style: element.getAttribute("style"),
        tagName: element.tagName,
      }),
    ),
    routeAnnouncerShadowStyles: [
      ...(
        document.querySelector("next-route-announcer")?.shadowRoot ??
        document.createDocumentFragment()
      ).querySelectorAll<HTMLElement>("[style]"),
    ].map((element) => ({
      className: element.className,
      style: element.getAttribute("style"),
      tagName: element.tagName,
    })),
  }));
  expect(notFoundNonceAudit.scriptCount).toBeGreaterThan(0);
  expect(notFoundNonceAudit.scriptsWithoutNonce).toBe(0);
  expect(notFoundNonceAudit.scriptNonces).toEqual([notFoundNonce]);
  expect(notFoundNonceAudit.stylesWithoutNonce).toBe(0);
  expect(notFoundNonceAudit.styleAttributes).toEqual(
    NEXT_ROUTE_ANNOUNCER_STYLE,
  );
  expect(notFoundNonceAudit.routeAnnouncerShadowStyles).toEqual(
    NEXT_ROUTE_ANNOUNCER_SHADOW_STYLE,
  );
  expect(notFoundSecurityFailures).toEqual([]);
  observedNonces.add(notFoundNonce!);
  await notFoundPage.close();

  expect(observedNonces.size).toBe(4);

  await context.route("https://juicebox.money/security-host", async (route) => {
    await route.fulfill({
      body: `<!doctype html><title>Allowed embed security host</title><iframe title="Configured embed launch gate" src="${PUBLIC_ORIGIN}/embed/juicebox"></iframe>`,
      contentType: "text/html",
    });
  });
  const allowedAncestorPage = await context.newPage();
  await allowedAncestorPage.goto("https://juicebox.money/security-host", {
    waitUntil: "networkidle",
  });
  const absentEmbedFrame = allowedAncestorPage.frames().find(
    (frame) => frame.url() === `${PUBLIC_ORIGIN}/embed/juicebox`,
  );
  expect(absentEmbedFrame).toBeDefined();
  await expect(
    allowedAncestorPage
      .frameLocator('iframe[title="Configured embed launch gate"]')
      .getByRole("heading", { name: "This page is not available." }),
  ).toBeVisible();
  expect(
    await absentEmbedFrame!.evaluate(() => {
      const observedWindow = window as typeof window & {
        __pwaRegistrationAttempts?: unknown[];
        __serviceWorkerPolicyAudits?: unknown[];
      };
      return {
        policyAudits: observedWindow.__serviceWorkerPolicyAudits ?? [],
        registrationAttempts: observedWindow.__pwaRegistrationAttempts ?? [],
      };
    }),
  ).toEqual({ policyAudits: [], registrationAttempts: [] });
  await allowedAncestorPage.close();

  const embedResponse = await fetch(`${LOCAL_ORIGIN}/embed/juicebox`, {
    headers: {
      "x-forwarded-host": "messages.example.com",
      "x-forwarded-proto": "https",
    },
  });
  // The security contract is configured, but the production tenant route is
  // intentionally not implemented yet. A 404 is a visible launch gate, not a
  // successful embed smoke test.
  expect(embedResponse.status).toBe(404);
  const embedCsp = embedResponse.headers.get("content-security-policy") ?? "";
  expect(embedCsp).toContain("frame-ancestors https://juicebox.money");
  expect(embedCsp).toContain("form-action 'none'");
  expect(embedCsp).toContain("frame-src 'none'");
  expect(embedCsp).toContain("sandbox allow-scripts allow-same-origin");
  expect(embedCsp).toContain("trusted-types nextjs nextjs#bundler");
  expect(embedCsp).not.toContain("juicebox-messaging#service-worker");
  expect(embedCsp).not.toContain("'unsafe-inline'");
  expect(embedResponse.headers.get("cross-origin-resource-policy")).toBe(
    "cross-origin",
  );
  expect(embedResponse.headers.get("permissions-policy")).toContain(
    "storage-access=()",
  );
  expect(embedResponse.headers.get("x-frame-options")).toBeNull();
  await embedResponse.arrayBuffer();

  const unknownEmbedResponse = await fetch(`${LOCAL_ORIGIN}/embed/unconfigured`, {
    headers: {
      "x-forwarded-host": "messages.example.com",
      "x-forwarded-proto": "https",
    },
  });
  expect(unknownEmbedResponse.status).toBe(404);
  expect(unknownEmbedResponse.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  await unknownEmbedResponse.arrayBuffer();

  const queriedEmbedResponse = await fetch(
    `${LOCAL_ORIGIN}/embed/juicebox?context=must-not-be-in-a-url`,
    {
      headers: {
        "x-forwarded-host": "messages.example.com",
        "x-forwarded-proto": "https",
      },
    },
  );
  expect(queriedEmbedResponse.status).toBe(404);
  expect(queriedEmbedResponse.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  await queriedEmbedResponse.arrayBuffer();

  const wrongAuthorityResponse = await fetch(`${LOCAL_ORIGIN}/`);
  expect(wrongAuthorityResponse.status).toBe(421);
  expect(wrongAuthorityResponse.headers.get("cache-control")).toContain("no-store");
  await wrongAuthorityResponse.arrayBuffer();
});

test("production does not enumerate or activate the development messaging namespace", async () => {
  const requests = [
    ["GET", "/api/dev/messaging"],
    ["HEAD", "/api/dev/messaging/status"],
    ["POST", "/api/dev/messaging/bootstrap?secret=must-not-matter"],
    ["OPTIONS", "/api/dev/messaging/conversations/unknown"],
    ["DELETE", "/API/DEV/MESSAGING/status"],
    ["PATCH", "/%61pi/%64ev/%6dessaging/status"],
    ["PUT", "/api/dev/messaging%252fstatus"],
  ] as const;
  const observedPolicies = new Set<string>();

  for (const [method, pathname] of requests) {
    const response = await fetch(`${LOCAL_ORIGIN}${pathname}`, {
      method,
      headers: {
        "x-forwarded-host": "messages.example.com",
        "x-forwarded-proto": "https",
      },
      redirect: "manual",
    });
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("allow")).toBeNull();
    expect(response.headers.get("content-type")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("'unsafe-inline'");
    observedPolicies.add(csp);
  }

  expect(observedPolicies.size).toBe(1);
});
