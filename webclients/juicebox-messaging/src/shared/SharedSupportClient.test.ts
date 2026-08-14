import { rosterBindingFromSnapshot } from "@/domain/fulfillment";
import type { RecipientRosterBinding, ShippingAddressEvent } from "@/domain/model";
import { describe, expect, it } from "vitest";
import {
  openSimulatedEnvelope,
  assertApprovedRosterMatchesConversation,
  sharedRosterFromConversation,
} from "./SharedSupportClient";
import {
  encodeSimulatedSupportEvent,
  type SharedConversation,
  type SharedEnvelope,
} from "./protocol";

const REVIEWED_CONVERSATION: SharedConversation = {
  conversationId: "conversation_test",
  projectRef: "demo:banny-studio",
  rosterVersion: "2",
  epoch: 2,
  createdAt: 1_787_000_000_000,
  roster: [
    { participantId: "customer_test", role: "customer", joinedAt: 1_787_000_000_001 },
    { participantId: "staff_test", role: "project-staff", joinedAt: 1_787_000_000_002 },
  ],
};

const TEST_ADDRESS: ShippingAddressEvent["address"] = {
  recipientName: "Fictional Recipient",
  line1: "123 Test Street",
  line2: "",
  city: "São Paulo",
  region: "SP",
  postalCode: "01000-000",
  country: "Brazil",
  deliveryNote: "Fictional details only",
};

function shippingEvent(approvedRoster: RecipientRosterBinding): ShippingAddressEvent {
  return {
    id: "shipping_address_test",
    kind: "shipping_address.v1",
    createdAt: "2026-08-14T15:01:00.000Z",
    addressId: "address_test",
    version: 1,
    address: TEST_ADDRESS,
    approvedRoster,
  };
}

function simulatedEnvelope(event: ShippingAddressEvent): SharedEnvelope {
  return {
    cursor: 1,
    conversationId: REVIEWED_CONVERSATION.conversationId,
    clientEnvelopeId: "envelope_shipping_address_test",
    senderParticipantId: "customer_test",
    senderRole: "customer",
    rosterVersion: REVIEWED_CONVERSATION.rosterVersion,
    epoch: REVIEWED_CONVERSATION.epoch,
    encoding: "base64url",
    contentType: "application/vnd.juicebox.messaging.simulated-envelope+json",
    ciphertext: encodeSimulatedSupportEvent(event),
    createdAt: 1_787_000_000_010,
  };
}

describe("shared sensitive-recipient binding", () => {
  it("accepts the exact server roster version, epoch, and participant set", () => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );

    expect(() =>
      assertApprovedRosterMatchesConversation(reviewed, REVIEWED_CONVERSATION),
    ).not.toThrow();
  });

  it("aborts when another participant joins after address review", () => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );
    const changed: SharedConversation = {
      ...REVIEWED_CONVERSATION,
      rosterVersion: "3",
      epoch: 3,
      roster: [
        ...REVIEWED_CONVERSATION.roster,
        {
          participantId: "staff_unreviewed",
          role: "project-staff",
          joinedAt: 1_787_000_000_003,
        },
      ],
    };

    expect(() => assertApprovedRosterMatchesConversation(reviewed, changed)).toThrow(
      "The test roster changed",
    );
  });

  it("aborts when only the server epoch changes after review", () => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );

    expect(() =>
      assertApprovedRosterMatchesConversation(reviewed, {
        ...REVIEWED_CONVERSATION,
        epoch: REVIEWED_CONVERSATION.epoch + 1,
      }),
    ).toThrow("The test roster changed");
  });

  it("opens an address only when its reviewed roster matches server-stamped envelope context", () => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );

    expect(
      openSimulatedEnvelope(
        simulatedEnvelope(shippingEvent(reviewed)),
        REVIEWED_CONVERSATION,
      ),
    ).toMatchObject({ event: { kind: "shipping_address.v1" } });
  });

  it.each([
    { field: "version", mutate: (reviewed: RecipientRosterBinding) => ({ ...reviewed, rosterVersion: "dev-http-999" }) },
    { field: "epoch", mutate: (reviewed: RecipientRosterBinding) => ({ ...reviewed, mlsEpoch: 999 }) },
  ])("rejects a payload-asserted roster $field that disagrees with the envelope", ({ mutate }) => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );
    const forged = shippingEvent(mutate(reviewed));

    expect(openSimulatedEnvelope(simulatedEnvelope(forged), REVIEWED_CONVERSATION)).toBeNull();
  });

  it("rejects a forged fingerprint set when the envelope-era roster is available", () => {
    const reviewed = rosterBindingFromSnapshot(
      sharedRosterFromConversation(REVIEWED_CONVERSATION),
    );
    const forged = shippingEvent({
      ...reviewed,
      recipientDeviceFingerprints: [
        reviewed.recipientDeviceFingerprints[0],
        "dev-http-simulation-unreviewed_staff",
      ],
    });

    expect(openSimulatedEnvelope(simulatedEnvelope(forged), REVIEWED_CONVERSATION)).toBeNull();
  });
});
