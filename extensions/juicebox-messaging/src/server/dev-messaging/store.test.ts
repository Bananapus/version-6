import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM,
  MAX_ENCODED_ENVELOPE_CHARS,
  MAX_ENVELOPES_PER_ROOM,
  ROOM_TTL_MS,
} from "./limits";
import { DevMessagingStore } from "./store";
import { expectCiphertext } from "./validation";

const CONTENT_TYPE = "application/vnd.juicebox.messaging.simulated-envelope+json" as const;
const CIPHERTEXT = "eyJvcGFxdWUiOiJwYXlsb2FkIn0";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function seededStore(now = 1_800_000_000_000) {
  const store = new DevMessagingStore(":memory:", () => now);
  const bootstrap = store.bootstrap("eip155:11155111:7");
  const staff = store.exchangeInvitation(bootstrap.invitations.projectStaff.invitationToken);
  const customer = store.exchangeInvitation(bootstrap.invitations.customer.invitationToken);
  return { store, bootstrap, staff, customer };
}

describe("DevMessagingStore", () => {
  it("exchanges each role invitation once and stamps authorization from the session", () => {
    const { store, bootstrap, staff, customer } = seededStore();

    expect(JSON.stringify(bootstrap.invitations)).not.toContain("tokenHash");
    expect(staff.actor.role).toBe("project-staff");
    expect(customer.actor.role).toBe("customer");
    expect(customer.conversation.rosterVersion).toBe("2");
    expect(customer.conversation.roster).toHaveLength(2);
    expect(() =>
      store.exchangeInvitation(bootstrap.invitations.customer.invitationToken),
    ).toThrowError(expect.objectContaining({ code: "invalid_invitation", status: 401 }));

    expect(() =>
      store.getConversation(
        { ...staff.actor, role: "customer" },
        bootstrap.conversation.conversationId,
      ),
    ).toThrowError(expect.objectContaining({ code: "conversation_not_found", status: 404 }));
    store.close();
  });

  it("stores opaque envelopes byte-for-byte with idempotent submission and cursor sync", () => {
    const { store, bootstrap, staff } = seededStore();
    const conversationId = bootstrap.conversation.conversationId;
    const input = {
      clientEnvelopeId: "envelope-1",
      rosterVersion: "2",
      epoch: 2,
      encoding: "base64url" as const,
      contentType: CONTENT_TYPE,
      ciphertext: CIPHERTEXT,
    };

    const submitted = store.submitEnvelope(staff.actor, conversationId, input);
    const repeated = store.submitEnvelope(staff.actor, conversationId, input);
    const page = store.syncEnvelopes(staff.actor, conversationId, 0, 10);

    expect(submitted.duplicate).toBe(false);
    expect(repeated).toEqual({ ...submitted, duplicate: true });
    expect(page.envelopes).toHaveLength(1);
    expect(page.envelopes[0]).toMatchObject({
      ciphertext: CIPHERTEXT,
      senderParticipantId: staff.actor.participantId,
      senderRole: "project-staff",
      contentType: CONTENT_TYPE,
    });
    expect(page.nextCursor).toBe(submitted.envelope.cursor);
    expect(store.syncEnvelopes(staff.actor, conversationId, page.nextCursor, 10).envelopes).toEqual(
      [],
    );

    expect(() =>
      store.submitEnvelope(staff.actor, conversationId, {
        ...input,
        ciphertext: `${CIPHERTEXT}x`,
      }),
    ).toThrowError(expect.objectContaining({ code: "idempotency_conflict", status: 409 }));
    store.close();
  });

  it("rejects all pre-join envelopes until the fixed two-role roster is complete", () => {
    const store = new DevMessagingStore(":memory:");
    const bootstrap = store.bootstrap("eip155:11155111:7");
    const staff = store.exchangeInvitation(bootstrap.invitations.projectStaff.invitationToken);
    const conversationId = bootstrap.conversation.conversationId;

    expect(() =>
      store.submitEnvelope(staff.actor, conversationId, {
        clientEnvelopeId: "prejoin-envelope",
        rosterVersion: "1",
        epoch: 1,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: CIPHERTEXT,
      }),
    ).toThrowError(expect.objectContaining({ code: "roster_incomplete", status: 409 }));

    const customer = store.exchangeInvitation(bootstrap.invitations.customer.invitationToken);
    expect(customer.conversation.roster.map(({ role }) => role).sort()).toEqual([
      "customer",
      "project-staff",
    ]);
    expect(
      store.submitEnvelope(staff.actor, conversationId, {
        clientEnvelopeId: "postjoin-envelope",
        rosterVersion: "2",
        epoch: 2,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: CIPHERTEXT,
      }).duplicate,
    ).toBe(false);
    store.close();
  });

  it("enforces encoded envelope, room count, and room byte quotas transactionally", () => {
    expect(expectCiphertext("A".repeat(MAX_ENCODED_ENVELOPE_CHARS))).toHaveLength(
      MAX_ENCODED_ENVELOPE_CHARS,
    );
    expect(() => expectCiphertext("A".repeat(MAX_ENCODED_ENVELOPE_CHARS + 1))).toThrowError(
      expect.objectContaining({ code: "invalid_request" }),
    );

    const countRoom = seededStore();
    const countConversationId = countRoom.bootstrap.conversation.conversationId;
    for (let index = 0; index < MAX_ENVELOPES_PER_ROOM; index += 1) {
      countRoom.store.submitEnvelope(countRoom.staff.actor, countConversationId, {
        clientEnvelopeId: `count-${index}`,
        rosterVersion: "2",
        epoch: 2,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: "A".repeat(16),
      });
    }
    expect(() =>
      countRoom.store.submitEnvelope(countRoom.staff.actor, countConversationId, {
        clientEnvelopeId: "count-overflow",
        rosterVersion: "2",
        epoch: 2,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: "A".repeat(16),
      }),
    ).toThrowError(expect.objectContaining({ code: "room_quota_exceeded", status: 429 }));
    countRoom.store.close();

    const byteRoom = seededStore();
    const byteConversationId = byteRoom.bootstrap.conversation.conversationId;
    const maximumEnvelopes =
      MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM / MAX_ENCODED_ENVELOPE_CHARS;
    for (let index = 0; index < maximumEnvelopes; index += 1) {
      byteRoom.store.submitEnvelope(byteRoom.staff.actor, byteConversationId, {
        clientEnvelopeId: `bytes-${index}`,
        rosterVersion: "2",
        epoch: 2,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: "A".repeat(MAX_ENCODED_ENVELOPE_CHARS),
      });
    }
    expect(() =>
      byteRoom.store.submitEnvelope(byteRoom.staff.actor, byteConversationId, {
        clientEnvelopeId: "bytes-overflow",
        rosterVersion: "2",
        epoch: 2,
        encoding: "base64url",
        contentType: CONTENT_TYPE,
        ciphertext: "A".repeat(16),
      }),
    ).toThrowError(expect.objectContaining({ code: "room_quota_exceeded", status: 429 }));
    byteRoom.store.close();
  });

  it("expires rooms and their sessions after the fixed 24-hour lifetime", () => {
    let now = 1_800_000_000_000;
    const store = new DevMessagingStore(":memory:", () => now);
    const bootstrap = store.bootstrap("eip155:1:24");
    const staff = store.exchangeInvitation(bootstrap.invitations.projectStaff.invitationToken);
    store.exchangeInvitation(bootstrap.invitations.customer.invitationToken);

    now += ROOM_TTL_MS - 1;
    expect(store.authenticate(staff.sessionToken).participantId).toBe(staff.actor.participantId);
    now += 1;
    expect(() => store.authenticate(staff.sessionToken)).toThrowError(
      expect.objectContaining({ code: "unauthenticated", status: 401 }),
    );
    expect(
      store.database.prepare("SELECT COUNT(*) AS count FROM conversations").get(),
    ).toMatchObject({ count: 0 });
    store.close();
  });

  it("persists sessions and the opaque log across SQLite reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "juicebox-messaging-store-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "messaging.sqlite");
    const first = new DevMessagingStore(databasePath);
    const bootstrap = first.bootstrap("eip155:1:42");
    const staff = first.exchangeInvitation(bootstrap.invitations.projectStaff.invitationToken);
    first.exchangeInvitation(bootstrap.invitations.customer.invitationToken);
    first.submitEnvelope(staff.actor, bootstrap.conversation.conversationId, {
      clientEnvelopeId: "durable-envelope",
      rosterVersion: "2",
      epoch: 2,
      encoding: "base64url",
      contentType: CONTENT_TYPE,
      ciphertext: CIPHERTEXT,
    });
    first.close();

    const reopened = new DevMessagingStore(databasePath);
    const actor = reopened.authenticate(staff.sessionToken);
    expect(
      reopened.syncEnvelopes(actor, bootstrap.conversation.conversationId, 0, 10).envelopes,
    ).toEqual([
      expect.objectContaining({
        clientEnvelopeId: "durable-envelope",
        ciphertext: CIPHERTEXT,
      }),
    ]);
    reopened.close();
  });
});
