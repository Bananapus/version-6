import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapHandler,
  exchangeHandler,
  invitationsHandler,
  sessionHandler,
  statusHandler,
} from "./handlers";

const ORIGIN = "http://localhost:3004";
const BOOTSTRAP_SECRET = "test-bootstrap-secret-with-32-bytes";
let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "juicebox-messaging-http-"));
  vi.stubEnv("JUICEBOX_MESSAGING_DEV_SERVICE", "enabled");
  vi.stubEnv("JUICEBOX_MESSAGING_DEV_BOOTSTRAP_SECRET", BOOTSTRAP_SECRET);
  vi.stubEnv("JUICEBOX_MESSAGING_DEV_DB_PATH", join(temporaryDirectory, "messaging.sqlite"));
  vi.stubEnv("JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS", ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function jsonPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  origin = ORIGIN,
): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function cookieValue(response: Response, name: string): string {
  const match = response.headers.get("set-cookie")?.match(new RegExp(`${name}=([^;,]+)`));
  if (!match) throw new Error(`Missing ${name} cookie`);
  return match[1];
}

async function bootstrap() {
  const response = await bootstrapHandler(
    jsonPost(
      "/api/dev/messaging/bootstrap",
      { projectRef: "eip155:11155111:7" },
      { "x-messaging-dev-secret": BOOTSTRAP_SECRET },
    ),
  );
  return { response, body: await response.json() };
}

describe.sequential("dev messaging HTTP handlers", () => {
  it("fails closed unless explicitly enabled and applies no-store to errors", async () => {
    vi.stubEnv("JUICEBOX_MESSAGING_DEV_SERVICE", "disabled");
    const response = await statusHandler(new Request(`${ORIGIN}/api/dev/messaging/status`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("cannot be enabled in production by a complete HTTPS lab configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JUICEBOX_MESSAGING_WEB_SECURITY_MODE", "production");
    vi.stubEnv(
      "JUICEBOX_MESSAGING_PUBLIC_ORIGIN",
      "https://messages.example.com",
    );
    vi.stubEnv(
      "JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS",
      "https://messages.example.com",
    );

    const response = await statusHandler(
      new Request("https://messages.example.com/api/dev/messaging/status"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
    expect(response.headers.get("allow")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("requires an explicit allowlist for LAN origins", async () => {
    vi.stubEnv("JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS", "");
    const lanOrigin = "http://192.168.1.50:3004";
    const blocked = await statusHandler(new Request(`${lanOrigin}/api/dev/messaging/status`));
    expect(blocked.status).toBe(403);

    vi.stubEnv("JUICEBOX_MESSAGING_ALLOWED_DEV_ORIGINS", lanOrigin);
    const allowed = await statusHandler(new Request(`${lanOrigin}/api/dev/messaging/status`));
    expect(allowed.status).toBe(200);
  });

  it("bootstraps explicit one-use role tokens only through the secret header", async () => {
    const denied = await bootstrapHandler(
      jsonPost("/api/dev/messaging/bootstrap", { projectRef: "eip155:1:1" }),
    );
    expect(denied.status).toBe(403);

    const { response, body } = await bootstrap();
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      conversation: { projectRef: "eip155:11155111:7", rosterVersion: "0", epoch: 0 },
      invitations: {
        customer: { role: "customer" },
        projectStaff: { role: "project-staff" },
      },
    });
    expect(body.invitations.customer.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.invitations.projectStaff.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("accepts an allowlisted Host when Next exposes its bind address in Request.url", async () => {
    const response = await bootstrapHandler(
      new Request("http://0.0.0.0:3004/api/dev/messaging/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3004",
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
          "x-messaging-dev-secret": BOOTSTRAP_SECRET,
        },
        body: JSON.stringify({ projectRef: "eip155:1:99" }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("exchanges an invitation for HttpOnly cookies and reuses CSRF across reloads", async () => {
    const { body: bootstrapped } = await bootstrap();
    const invitationToken = bootstrapped.invitations.customer.invitationToken as string;
    const exchange = await exchangeHandler(
      jsonPost("/api/dev/messaging/auth/exchange", { invitationToken }),
    );
    const exchanged = await exchange.json();
    const setCookie = exchange.headers.get("set-cookie") ?? "";

    expect(exchange.status).toBe(200);
    expect(exchanged.actor.role).toBe("customer");
    expect(setCookie).toContain("jbmsg_dev_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("Secure");
    expect(JSON.stringify(exchanged)).not.toContain(cookieValue(exchange, "jbmsg_dev_session"));

    const sessionCookie = cookieValue(exchange, "jbmsg_dev_session");
    const csrfToken = cookieValue(exchange, "jbmsg_dev_csrf");
    const cookie = `jbmsg_dev_session=${sessionCookie}; jbmsg_dev_csrf=${csrfToken}`;
    const [firstIntrospection, secondIntrospection] = await Promise.all([
      sessionHandler(
        new Request(`${ORIGIN}/api/dev/messaging/session`, { headers: { cookie } }),
      ),
      sessionHandler(
        new Request(`${ORIGIN}/api/dev/messaging/session`, { headers: { cookie } }),
      ),
    ]);
    const [firstBody, secondBody] = await Promise.all([
      firstIntrospection.json(),
      secondIntrospection.json(),
    ]);
    expect(firstIntrospection.status).toBe(200);
    expect(secondIntrospection.status).toBe(200);
    expect(firstBody.actor.role).toBe("customer");
    expect(firstBody.csrfToken).toBe(csrfToken);
    expect(secondBody.csrfToken).toBe(csrfToken);
    expect(firstBody.conversations[0].roster).toHaveLength(1);
    expect(firstIntrospection.headers.get("set-cookie")).toBeNull();

    const repeated = await exchangeHandler(
      jsonPost("/api/dev/messaging/auth/exchange", { invitationToken }),
    );
    expect(repeated.status).toBe(401);
  });

  it("enforces fixed rosters, same-origin, and matching CSRF on invitation mutations", async () => {
    const { body: bootstrapped } = await bootstrap();
    const exchange = await exchangeHandler(
      jsonPost("/api/dev/messaging/auth/exchange", {
        invitationToken: bootstrapped.invitations.projectStaff.invitationToken,
      }),
    );
    const sessionCookie = cookieValue(exchange, "jbmsg_dev_session");
    const csrfToken = cookieValue(exchange, "jbmsg_dev_csrf");
    const conversationId = bootstrapped.conversation.conversationId as string;
    const cookies = `jbmsg_dev_session=${sessionCookie}; jbmsg_dev_csrf=${csrfToken}`;

    const missingCsrf = await invitationsHandler(
      jsonPost(
        `/api/dev/messaging/conversations/${conversationId}/invitations`,
        { role: "customer" },
        { cookie: cookies },
      ),
      conversationId,
    );
    expect(missingCsrf.status).toBe(403);

    const fixedRoster = await invitationsHandler(
      jsonPost(
        `/api/dev/messaging/conversations/${conversationId}/invitations`,
        { role: "customer" },
        { cookie: cookies, "x-messaging-csrf": csrfToken },
      ),
      conversationId,
    );
    expect(fixedRoster.status).toBe(403);
    expect(await fixedRoster.json()).toMatchObject({ error: { code: "fixed_roster" } });

    const evilOrigin = await bootstrapHandler(
      jsonPost(
        "/api/dev/messaging/bootstrap",
        { projectRef: "eip155:1:2" },
        { "x-messaging-dev-secret": BOOTSTRAP_SECRET },
        "http://evil.example",
      ),
    );
    expect(evilOrigin.status).toBe(403);
  });
});
