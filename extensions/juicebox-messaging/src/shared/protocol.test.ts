import type { ShippingAddressEvent, TextEvent } from "@/domain/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SharedProtocolError,
  decodeSimulatedSupportEvent,
  encodeSimulatedSupportEvent,
  syncSharedEnvelopes,
} from "./protocol";

afterEach(() => vi.unstubAllGlobals());

describe("simulated shared envelope codec", () => {
  it("round-trips Unicode text through a base64url-only payload", () => {
    const event: TextEvent = {
      id: "text_attempt_1",
      kind: "text.v1",
      createdAt: "2026-08-14T15:00:00.000Z",
      body: "Olá from the phone 📱",
    };

    const encoded = encodeSimulatedSupportEvent(event);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(event.body);
    expect(decodeSimulatedSupportEvent(encoded)).toEqual(event);
  });

  it("runtime-validates structured address events after decoding", () => {
    const event: ShippingAddressEvent = {
      id: "shipping_address_attempt_1",
      kind: "shipping_address.v1",
      createdAt: "2026-08-14T15:01:00.000Z",
      addressId: "address_attempt_1",
      version: 1,
      address: {
        recipientName: "Fictional Recipient",
        line1: "123 Test Street",
        line2: "",
        city: "São Paulo",
        region: "SP",
        postalCode: "01000-000",
        country: "Brazil",
        deliveryNote: "Fictional details only",
      },
      approvedRoster: {
        rosterVersion: "dev-http-2",
        mlsEpoch: 2,
        recipientDeviceFingerprints: ["dev-http-customer", "dev-http-project"],
      },
    };

    expect(decodeSimulatedSupportEvent(encodeSimulatedSupportEvent(event))).toEqual(event);
  });

  it("rejects arbitrary base64url data that lacks the explicit simulation marker", () => {
    const arbitrary = btoa(JSON.stringify({ event: { kind: "text.v1" } }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");

    expect(() => decodeSimulatedSupportEvent(arbitrary)).toThrow(SharedProtocolError);
  });
});

describe("shared envelope pagination validation", () => {
  function envelope(cursor: number) {
    return {
      cursor,
      conversationId: "conversation_test",
      clientEnvelopeId: `envelope_${cursor}`,
      senderParticipantId: "customer_test",
      senderRole: "customer",
      rosterVersion: "2",
      epoch: 2,
      encoding: "base64url",
      contentType: "application/vnd.juicebox.messaging.simulated-envelope+json",
      ciphertext: encodeSimulatedSupportEvent({
        id: `text_${cursor}`,
        kind: "text.v1",
        createdAt: "2026-08-14T15:00:00.000Z",
        body: `Message ${cursor}`,
      }),
      createdAt: 1_787_000_000_000 + cursor,
    };
  }

  function respondWithPage(page: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  }

  it("accepts a strictly increasing page whose cursor matches its last envelope", async () => {
    respondWithPage({
      envelopes: [envelope(6), envelope(7)],
      nextCursor: 7,
      hasMore: true,
    });

    await expect(syncSharedEnvelopes("conversation_test", 5)).resolves.toMatchObject({
      nextCursor: 7,
      hasMore: true,
    });
  });

  it.each([
    {
      name: "a duplicate or descending envelope cursor",
      page: { envelopes: [envelope(6), envelope(6)], nextCursor: 6, hasMore: false },
    },
    {
      name: "a nextCursor that does not match the last envelope",
      page: { envelopes: [envelope(6), envelope(7)], nextCursor: 6, hasMore: false },
    },
    {
      name: "hasMore on an empty page",
      page: { envelopes: [], nextCursor: 5, hasMore: true },
    },
  ])("rejects $name", async ({ page }) => {
    respondWithPage(page);

    await expect(syncSharedEnvelopes("conversation_test", 5)).rejects.toBeInstanceOf(
      SharedProtocolError,
    );
  });
});
