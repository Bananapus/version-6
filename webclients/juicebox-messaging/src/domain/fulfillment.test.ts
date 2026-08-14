import { describe, expect, it } from "vitest";
import {
  authorizedSupportEvents,
  deriveFulfillment,
  genericEventPreview,
  isAuthorizedSupportEvent,
  isValidRosterSnapshot,
  rosterBindingFromSnapshot,
  rosterBindingsEqual,
  validateShippingAddress,
} from "./fulfillment";
import type {
  AuthenticatedParticipantRole,
  AuthenticatedSupportEvent,
  RecipientRosterBinding,
  RecipientRosterSnapshot,
  ShippingAddress,
  SupportEvent,
} from "./model";

const ADDRESS: ShippingAddress = {
  recipientName: "Avery Example",
  line1: "123 Demo Street",
  line2: "Apartment 4B",
  city: "São Paulo",
  region: "SP",
  postalCode: "01000-000",
  country: "Brazil",
  deliveryNote: "Leave with the front desk.",
};

const APPROVED_ROSTER: RecipientRosterBinding = {
  rosterVersion: "roster-12",
  mlsEpoch: 42,
  recipientDeviceFingerprints: ["fingerprint-customer", "fingerprint-mira"],
};

const ROSTER_SNAPSHOT: RecipientRosterSnapshot = {
  ...APPROVED_ROSTER,
  devices: [
    {
      participantId: "customer-1",
      deviceId: "customer-device",
      deviceFingerprint: "fingerprint-customer",
      displayName: "Customer phone",
      role: "customer",
    },
    {
      participantId: "staff-1",
      deviceId: "staff-device",
      deviceFingerprint: "fingerprint-mira",
      displayName: "Mira laptop",
      role: "project-staff",
    },
  ],
};

function opened(
  event: SupportEvent,
  role: AuthenticatedParticipantRole,
  options: { credentialSubject?: string } = {},
): AuthenticatedSupportEvent {
  const participantId = role === "customer" ? "customer-1" : "staff-1";
  const deviceId = role === "customer" ? "customer-device" : "staff-device";
  return {
    event,
    authenticated: {
      participantId,
      deviceId,
      deviceFingerprint: `${deviceId}-fingerprint`,
      roleCredential: {
        credentialId: `${role}-credential`,
        role,
        subjectParticipantId: options.credentialSubject ?? participantId,
        subjectDeviceId: deviceId,
        issuedAt: "2026-08-14T12:00:00.000Z",
      },
    },
  };
}

function customer(event: SupportEvent): AuthenticatedSupportEvent {
  return opened(event, "customer");
}

function project(event: SupportEvent): AuthenticatedSupportEvent {
  return opened(event, "project-staff");
}

function addressEvent(version = 1): AuthenticatedSupportEvent {
  return customer({
    id: `address-${version}`,
    kind: "shipping_address.v1",
    createdAt: "2026-08-14T13:00:00.000Z",
    addressId: "address-demo",
    version,
    address: ADDRESS,
    approvedRoster: APPROVED_ROSTER,
  });
}

function fulfilledEvents(): AuthenticatedSupportEvent[] {
  return [
    addressEvent(),
    project({
      id: "ack-1",
      kind: "address_ack.v1",
      createdAt: "2026-08-14T13:01:00.000Z",
      addressId: "address-demo",
      addressVersion: 1,
    }),
    project({
      id: "preparing-1",
      kind: "fulfillment_status.v1",
      createdAt: "2026-08-14T13:02:00.000Z",
      addressId: "address-demo",
      addressVersion: 1,
      status: "preparing",
    }),
    project({
      id: "tracking-1",
      kind: "tracking.v1",
      createdAt: "2026-08-14T13:03:00.000Z",
      carrier: "Correios",
      trackingCode: "AB123456789CD",
      addressId: "address-demo",
      addressVersion: 1,
    }),
    project({
      id: "shipped-1",
      kind: "fulfillment_status.v1",
      createdAt: "2026-08-14T13:04:00.000Z",
      addressId: "address-demo",
      addressVersion: 1,
      status: "shipped",
    }),
  ];
}

describe("authenticated domain events", () => {
  it("keeps sender claims out of the encrypted event payload", () => {
    const entry = addressEvent();

    expect(entry.event).not.toHaveProperty("sender");
    expect(entry.authenticated.roleCredential.role).toBe("customer");
  });

  it("rejects event kinds the authenticated relationship role cannot emit", () => {
    const staffAddress = opened(addressEvent().event, "project-staff");
    const customerAcknowledgement = customer({
      id: "forged-ack",
      kind: "address_ack.v1",
      createdAt: "2026-08-14T13:01:00.000Z",
      addressId: "address-demo",
      addressVersion: 1,
    });

    expect(isAuthorizedSupportEvent(staffAddress)).toBe(false);
    expect(isAuthorizedSupportEvent(customerAcknowledgement)).toBe(false);
    expect(deriveFulfillment([staffAddress]).stage).toBe("address-needed");
    expect(deriveFulfillment([addressEvent(), customerAcknowledgement]).acknowledged).toBe(false);
  });

  it("rejects authenticated metadata whose role credential names another subject", () => {
    const entry = opened(addressEvent().event, "customer", {
      credentialSubject: "another-customer",
    });

    expect(isAuthorizedSupportEvent(entry)).toBe(false);
    expect(deriveFulfillment([entry]).stage).toBe("address-needed");
  });

  it("suppresses duplicate event IDs before reducing, with first authorized occurrence winning", () => {
    const first = addressEvent(1);
    if (first.event.kind !== "shipping_address.v1") throw new Error("test fixture is invalid");
    const conflictingReplay = customer({
      ...first.event,
      id: first.event.id,
      version: 2,
      address: { ...ADDRESS, line1: "Conflicting replay" },
    });

    expect(authorizedSupportEvents([first, conflictingReplay])).toEqual([first]);
    expect(deriveFulfillment([first, conflictingReplay]).addressEvent).toBe(first.event);
  });

  it("does not let an unauthorized duplicate reserve a legitimate event ID", () => {
    const legitimate = addressEvent(1);
    const unauthorized = opened(legitimate.event, "project-staff");

    expect(authorizedSupportEvents([unauthorized, legitimate])).toEqual([legitimate]);
    expect(deriveFulfillment([unauthorized, legitimate]).addressEvent).toBe(
      legitimate.event,
    );
  });
});

describe("roster-bound address disclosure", () => {
  it("compares roster version, MLS epoch, and the exact device set", () => {
    expect(
      rosterBindingsEqual(APPROVED_ROSTER, {
        ...APPROVED_ROSTER,
        recipientDeviceFingerprints: [...APPROVED_ROSTER.recipientDeviceFingerprints].reverse(),
      }),
    ).toBe(true);
    expect(
      rosterBindingsEqual(APPROVED_ROSTER, {
        ...APPROVED_ROSTER,
        mlsEpoch: APPROVED_ROSTER.mlsEpoch + 1,
      }),
    ).toBe(false);
    expect(
      rosterBindingsEqual(APPROVED_ROSTER, {
        ...APPROVED_ROSTER,
        recipientDeviceFingerprints: [
          ...APPROVED_ROSTER.recipientDeviceFingerprints,
          "fingerprint-new-device",
        ],
      }),
    ).toBe(false);
  });

  it("retains the exact approved roster on the sensitive event", () => {
    const result = deriveFulfillment([addressEvent()]);

    expect(result.addressEvent?.approvedRoster).toEqual(APPROVED_ROSTER);
  });

  it("requires a unique one-to-one match between device records and binding fingerprints", () => {
    expect(isValidRosterSnapshot(ROSTER_SNAPSHOT)).toBe(true);
    expect(rosterBindingFromSnapshot(ROSTER_SNAPSHOT)).toEqual(APPROVED_ROSTER);

    const missingDevice: RecipientRosterSnapshot = {
      ...ROSTER_SNAPSHOT,
      devices: ROSTER_SNAPSHOT.devices.slice(0, 1),
    };
    const duplicateDeviceFingerprint: RecipientRosterSnapshot = {
      ...ROSTER_SNAPSHOT,
      devices: [
        ROSTER_SNAPSHOT.devices[0],
        {
          ...ROSTER_SNAPSHOT.devices[1],
          deviceFingerprint: ROSTER_SNAPSHOT.devices[0].deviceFingerprint,
        },
      ],
    };
    const duplicateBindingFingerprint: RecipientRosterSnapshot = {
      ...ROSTER_SNAPSHOT,
      recipientDeviceFingerprints: ["fingerprint-customer", "fingerprint-customer"],
    };

    expect(isValidRosterSnapshot(missingDevice)).toBe(false);
    expect(isValidRosterSnapshot(duplicateDeviceFingerprint)).toBe(false);
    expect(isValidRosterSnapshot(duplicateBindingFingerprint)).toBe(false);
    expect(() => rosterBindingFromSnapshot(missingDevice)).toThrow(
      "Roster devices do not exactly match",
    );
    expect(rosterBindingsEqual(APPROVED_ROSTER, missingDevice)).toBe(false);
  });
});

describe("fulfillment state", () => {
  it("requires a shipping address before fulfillment starts", () => {
    expect(deriveFulfillment([])).toEqual({ stage: "address-needed", acknowledged: false });
  });

  it("invalidates an old acknowledgement and status when the address changes", () => {
    const events: AuthenticatedSupportEvent[] = [
      addressEvent(1),
      project({
        id: "ack-1",
        kind: "address_ack.v1",
        createdAt: "2026-08-14T13:01:00.000Z",
        addressId: "address-demo",
        addressVersion: 1,
      }),
      project({
        id: "preparing-1",
        kind: "fulfillment_status.v1",
        createdAt: "2026-08-14T13:02:00.000Z",
        addressId: "address-demo",
        addressVersion: 1,
        status: "preparing",
      }),
      addressEvent(2),
    ];

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("ready-to-fulfill");
    expect(result.acknowledged).toBe(false);
    expect(result.addressEvent?.version).toBe(2);
    expect(result.statusEvent).toBeUndefined();
  });

  it("accepts only exact sequential address versions on one stable address ID", () => {
    const skippedVersion = addressEvent(3);
    const secondVersion = addressEvent(2);
    if (secondVersion.event.kind !== "shipping_address.v1") {
      throw new Error("test fixture is invalid");
    }
    const changedAddressId = customer({
      ...secondVersion.event,
      id: "changed-address-id",
      addressId: "different-address",
    });
    const validSecondVersion = secondVersion;

    const result = deriveFulfillment([
      addressEvent(1),
      skippedVersion,
      changedAddressId,
      validSecondVersion,
    ]);

    expect(result.addressEvent).toBe(validSecondVersion.event);
    expect(result.addressEvent?.addressId).toBe("address-demo");
    expect(result.addressEvent?.version).toBe(2);
  });

  it("does not jump fulfillment transitions or accept tracking before preparation", () => {
    const directShipment = project({
      id: "jumped-shipment",
      kind: "fulfillment_status.v1",
      createdAt: "2026-08-14T13:02:00.000Z",
      addressId: "address-demo",
      addressVersion: 1,
      status: "shipped",
    });
    const earlyTracking = project({
      id: "early-tracking",
      kind: "tracking.v1",
      createdAt: "2026-08-14T13:02:30.000Z",
      carrier: "Correios",
      trackingCode: "TOO-EARLY",
      addressId: "address-demo",
      addressVersion: 1,
    });
    const events = [
      addressEvent(1),
      project({
        id: "ack-1",
        kind: "address_ack.v1",
        createdAt: "2026-08-14T13:01:00.000Z",
        addressId: "address-demo",
        addressVersion: 1,
      }),
      directShipment,
      earlyTracking,
    ];

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("ready-to-fulfill");
    expect(result.statusEvent).toBeUndefined();
    expect(result.trackingEvent).toBeUndefined();
  });

  it("does not replace an active preparing transition or reopen a shipped order", () => {
    const events = fulfilledEvents();
    const shippedEvent = events.at(-1)?.event;
    events.splice(
      3,
      0,
      project({
        id: "duplicate-preparing-transition",
        kind: "fulfillment_status.v1",
        createdAt: "2026-08-14T13:02:30.000Z",
        addressId: "address-demo",
        addressVersion: 1,
        status: "preparing",
      }),
    );
    events.push(
      project({
        id: "reopen-after-shipping",
        kind: "fulfillment_status.v1",
        createdAt: "2026-08-14T14:00:00.000Z",
        addressId: "address-demo",
        addressVersion: 1,
        status: "preparing",
      }),
    );

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("shipped");
    expect(result.statusEvent).toBe(shippedEvent);
  });

  it("matches tracking to both address id and address version", () => {
    const events = fulfilledEvents();
    const trackingIndex = events.findIndex((entry) => entry.event.kind === "tracking.v1");
    const tracking = events[trackingIndex];
    if (tracking.event.kind !== "tracking.v1") throw new Error("test fixture is invalid");
    events[trackingIndex] = project({ ...tracking.event, addressId: "another-address" });

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("shipped");
    expect(result.trackingEvent).toBeUndefined();
  });

  it("treats shipped as terminal and records a correction without opening a second shipment", () => {
    const events = fulfilledEvents();
    events.push(
      customer({
        id: "correction-1",
        kind: "shipping_address_correction.v1",
        createdAt: "2026-08-14T14:00:00.000Z",
        correctionId: "correction-address-demo",
        correctionVersion: 1,
        shippedAddressId: "address-demo",
        shippedAddressVersion: 1,
        address: { ...ADDRESS, line1: "456 Corrected Street" },
        approvedRoster: APPROVED_ROSTER,
      }),
      addressEvent(2),
      project({
        id: "second-preparing",
        kind: "fulfillment_status.v1",
        createdAt: "2026-08-14T14:02:00.000Z",
        addressId: "address-demo",
        addressVersion: 2,
        status: "preparing",
      }),
    );

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("shipped");
    expect(result.addressEvent?.version).toBe(1);
    expect(result.statusEvent?.status).toBe("shipped");
    expect(result.addressCorrectionEvent?.address.line1).toBe("456 Corrected Street");
  });

  it("accepts correction versions only when they increment exactly on one stable ID", () => {
    const events = fulfilledEvents();
    const correction = (version: number, id = "correction-address-demo") =>
      customer({
        id: `correction-event-${version}-${id}`,
        kind: "shipping_address_correction.v1",
        createdAt: `2026-08-14T14:0${version}:00.000Z`,
        correctionId: id,
        correctionVersion: version,
        shippedAddressId: "address-demo",
        shippedAddressVersion: 1,
        address: { ...ADDRESS, line1: `Correction ${version}` },
        approvedRoster: APPROVED_ROSTER,
      });

    const skipped = correction(3);
    const changedId = correction(2, "different-correction-id");
    const validFirst = correction(1);
    const validSecond = correction(2);
    events.push(validFirst, skipped, changedId, validSecond);

    const result = deriveFulfillment(events);
    expect(result.stage).toBe("shipped");
    expect(result.addressCorrectionEvent).toBe(validSecond.event);
    expect(result.addressCorrectionEvent?.correctionVersion).toBe(2);
  });

  it("never includes structured address fields in a thread preview", () => {
    const event = addressEvent().event;
    const preview = genericEventPreview(event);

    expect(preview).toBe("Shipping address shared");
    for (const privateValue of Object.values(ADDRESS)) {
      expect(preview).not.toContain(privateValue);
    }
  });
});

describe("shipping address validation", () => {
  it("requires the minimum fulfillment fields", () => {
    const result = validateShippingAddress({
      ...ADDRESS,
      recipientName: "",
      country: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.recipientName).toBe("Required");
    expect(result.errors.country).toBe("Required");
  });

  it("accepts destinations without a region or postal code", () => {
    expect(
      validateShippingAddress({ ...ADDRESS, region: "", postalCode: "" }),
    ).toEqual({ valid: true, errors: {} });
  });

  it("accepts a complete structured address", () => {
    expect(validateShippingAddress(ADDRESS)).toEqual({ valid: true, errors: {} });
  });
});
