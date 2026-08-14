import {
  assertBootstrapSecret,
  assertMutationRequest,
  authenticateRequest,
  clearSessionCookies,
  jsonResponse,
  readJson,
  sessionCookies,
  withApiErrors,
} from "./http";
import {
  MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM,
  MAX_ENCODED_ENVELOPE_CHARS,
  MAX_ENVELOPES_PER_ROOM,
  ROOM_TTL_MS,
} from "./limits";
import { DevMessagingError } from "./types";
import {
  expectCiphertext,
  expectIdentifier,
  expectInteger,
  expectInvitationToken,
  expectObject,
  expectProjectRef,
  expectRosterVersion,
  invalidRequest,
} from "./validation";

export function statusHandler(request: Request): Promise<Response> {
  return withApiErrors(request, () =>
    jsonResponse({
      enabled: true,
      mode: "development-only",
      storage: "sqlite",
      payloadPolicy: "opaque-envelopes-only",
      schemaVersion: 1,
      limits: {
        roomTtlMs: ROOM_TTL_MS,
        maxEncodedEnvelopeChars: MAX_ENCODED_ENVELOPE_CHARS,
        maxEnvelopesPerRoom: MAX_ENVELOPES_PER_ROOM,
        maxEncodedCiphertextCharsPerRoom: MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM,
      },
    }),
  );
}

export function bootstrapHandler(request: Request): Promise<Response> {
  return withApiErrors(request, async ({ config, store }) => {
    assertMutationRequest(request, config);
    assertBootstrapSecret(request, config);
    const body = expectObject(await readJson(request), ["projectRef"]);
    const result = store.bootstrap(expectProjectRef(body.projectRef));
    return jsonResponse(result, { status: 201 });
  });
}

export function exchangeHandler(request: Request): Promise<Response> {
  return withApiErrors(request, async ({ config, store }) => {
    assertMutationRequest(request, config);
    const body = expectObject(await readJson(request), ["invitationToken"]);
    const result = store.exchangeInvitation(expectInvitationToken(body.invitationToken));
    const maxAgeSeconds = Math.max(0, Math.floor((result.actor.expiresAt - Date.now()) / 1000));
    return jsonResponse(
      {
        actor: result.actor,
        csrfToken: result.csrfToken,
        conversation: result.conversation,
      },
      {
        status: 200,
        cookies: sessionCookies(
          request,
          {
            sessionToken: result.sessionToken,
            csrfToken: result.csrfToken,
            maxAgeSeconds,
          },
        ),
      },
    );
  });
}

export function sessionHandler(request: Request): Promise<Response> {
  return withApiErrors(request, ({ store }) => {
    const session = authenticateRequest(request, store, "cookie");
    if (!session.csrfToken) {
      throw new Error("Validated CSRF cookie is unavailable");
    }
    const conversations = store
      .listConversations(session.actor)
      .map(({ conversationId }) => store.getConversation(session.actor, conversationId));
    return jsonResponse({
      actor: session.actor,
      csrfToken: session.csrfToken,
      conversations,
    });
  });
}

export function logoutHandler(request: Request): Promise<Response> {
  return withApiErrors(request, async ({ config, store }) => {
    assertMutationRequest(request, config);
    const session = authenticateRequest(request, store, "header");
    expectObject(await readJson(request), []);
    store.logout(session.sessionToken);
    return jsonResponse(
      { ok: true },
      { cookies: clearSessionCookies(request) },
    );
  });
}

export function conversationsHandler(request: Request): Promise<Response> {
  return withApiErrors(request, ({ store }) => {
    const session = authenticateRequest(request, store, "none");
    return jsonResponse({ conversations: store.listConversations(session.actor) });
  });
}

export function conversationHandler(
  request: Request,
  conversationIdValue: string,
): Promise<Response> {
  return withApiErrors(request, ({ store }) => {
    const session = authenticateRequest(request, store, "none");
    const conversationId = expectIdentifier(conversationIdValue, "conversationId");
    return jsonResponse({ conversation: store.getConversation(session.actor, conversationId) });
  });
}

export function invitationsHandler(
  request: Request,
  conversationIdValue: string,
): Promise<Response> {
  return withApiErrors(request, async ({ config, store }) => {
    assertMutationRequest(request, config);
    const session = authenticateRequest(request, store, "header");
    const conversationId = expectIdentifier(conversationIdValue, "conversationId");
    store.getConversation(session.actor, conversationId);
    throw new DevMessagingError(
      "fixed_roster",
      403,
      "Milestone-one rooms have exactly one customer and one project-staff participant.",
    );
  });
}

export function envelopesHandler(
  request: Request,
  conversationIdValue: string,
): Promise<Response> {
  return withApiErrors(request, async ({ config, store }) => {
    const session = authenticateRequest(
      request,
      store,
      request.method === "GET" ? "none" : "header",
    );
    const conversationId = expectIdentifier(conversationIdValue, "conversationId");

    if (request.method === "GET") {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) {
        if (key !== "after" && key !== "limit") throw invalidRequest(`Unexpected query: ${key}.`);
        if (url.searchParams.getAll(key).length !== 1) {
          throw invalidRequest(`Query parameter ${key} must appear once.`);
        }
      }
      const afterValue = url.searchParams.get("after") ?? "0";
      const limitValue = url.searchParams.get("limit") ?? "100";
      if (!/^\d+$/.test(afterValue) || !/^\d+$/.test(limitValue)) {
        throw invalidRequest("Cursor query parameters are invalid.");
      }
      return jsonResponse(
        store.syncEnvelopes(
          session.actor,
          conversationId,
          expectInteger(Number(afterValue), "after", 0, Number.MAX_SAFE_INTEGER),
          expectInteger(Number(limitValue), "limit", 1, 100),
        ),
      );
    }

    assertMutationRequest(request, config);
    const body = expectObject(await readJson(request), [
      "clientEnvelopeId",
      "rosterVersion",
      "epoch",
      "encoding",
      "contentType",
      "ciphertext",
    ]);
    if (body.encoding !== "base64url") {
      throw invalidRequest("encoding must be base64url.");
    }
    if (body.contentType !== "application/vnd.juicebox.messaging.simulated-envelope+json") {
      throw invalidRequest("contentType is invalid.");
    }
    const result = store.submitEnvelope(session.actor, conversationId, {
      clientEnvelopeId: expectIdentifier(body.clientEnvelopeId, "clientEnvelopeId"),
      rosterVersion: expectRosterVersion(body.rosterVersion),
      epoch: expectInteger(body.epoch, "epoch", 0, Number.MAX_SAFE_INTEGER),
      encoding: body.encoding,
      contentType: body.contentType,
      ciphertext: expectCiphertext(body.ciphertext),
    });
    return jsonResponse(result, { status: result.duplicate ? 200 : 201 });
  });
}
