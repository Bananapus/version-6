import {
  deriveFulfillment,
  rosterBindingFromSnapshot,
  rosterBindingsEqual,
} from "@/domain/fulfillment";
import type {
  AuthenticatedEventMetadata,
  AuthenticatedSupportEvent,
  RecipientRosterBinding,
  ShippingAddress,
  SupportClient,
  SupportEvent,
  SupportSnapshot,
  ViewerRole,
} from "@/domain/model";

const CUSTOMER_AUTHENTICATION: AuthenticatedEventMetadata = {
  participantId: "person_demo_customer",
  deviceId: "device_demo_customer_phone",
  deviceFingerprint: "demo-fingerprint-customer-phone-7e21",
  roleCredential: {
    credentialId: "credential_demo_customer",
    role: "customer",
    subjectParticipantId: "person_demo_customer",
    subjectDeviceId: "device_demo_customer_phone",
    issuedAt: "2026-08-12T14:20:00.000Z",
  },
};

const PROJECT_AUTHENTICATION: AuthenticatedEventMetadata = {
  participantId: "person_demo_mira",
  deviceId: "device_demo_mira_laptop",
  deviceFingerprint: "demo-fingerprint-mira-laptop-a109",
  roleCredential: {
    credentialId: "credential_demo_project_staff",
    role: "project-staff",
    subjectParticipantId: "person_demo_mira",
    subjectDeviceId: "device_demo_mira_laptop",
    issuedAt: "2026-08-01T10:00:00.000Z",
  },
};

function authenticated(
  event: SupportEvent,
  sender: ViewerRole,
): AuthenticatedSupportEvent {
  return {
    event,
    authenticated: structuredClone(
      sender === "customer" ? CUSTOMER_AUTHENTICATION : PROJECT_AUTHENTICATION,
    ),
  };
}

const INITIAL_SNAPSHOT: SupportSnapshot = {
  relationshipId: "rel_demo_banny_customer",
  caseId: "case_demo_order_8q3m",
  project: {
    id: "project_demo_banny",
    name: "Banny Studio",
    handle: "@banny",
    initial: "B",
    chainLabel: "Base",
  },
  purchase: {
    id: "purchase_demo_8q3m",
    orderLabel: "Order #8Q3M",
    itemName: "Banny artist tee",
    itemDetail: "Sunrise / Medium · Qty 1",
    amount: "0.018 ETH",
    status: "verified",
    txLabel: "0x71f2…a90c",
    purchasedAt: "August 12, 2026",
    supportUntil: "November 12, 2026",
  },
  customer: {
    id: "person_demo_customer",
    name: "sunlit-wallet",
    detail: "0x7e21…91b4",
    role: "customer",
    initial: "S",
  },
  staff: [
    {
      id: "person_demo_mira",
      name: "Mira",
      detail: "Fulfillment",
      role: "support",
      initial: "M",
    },
    {
      id: "person_demo_jo",
      name: "Jo",
      detail: "Project owner",
      role: "owner",
      initial: "J",
    },
  ],
  roster: {
    rosterVersion: "roster_demo_1",
    mlsEpoch: 7,
    recipientDeviceFingerprints: [
      "demo-fingerprint-customer-phone-7e21",
      "demo-fingerprint-mira-laptop-a109",
      "demo-fingerprint-jo-phone-b402",
    ],
    devices: [
      {
        participantId: "person_demo_customer",
        deviceId: "device_demo_customer_phone",
        deviceFingerprint: "demo-fingerprint-customer-phone-7e21",
        displayName: "sunlit-wallet · phone",
        role: "customer",
      },
      {
        participantId: "person_demo_mira",
        deviceId: "device_demo_mira_laptop",
        deviceFingerprint: "demo-fingerprint-mira-laptop-a109",
        displayName: "Mira · laptop",
        role: "project-staff",
      },
      {
        participantId: "person_demo_jo",
        deviceId: "device_demo_jo_phone",
        deviceFingerprint: "demo-fingerprint-jo-phone-b402",
        displayName: "Jo · phone",
        role: "project-staff",
      },
    ],
  },
  events: [
    authenticated(
      {
        id: "evt_welcome",
        kind: "text.v1",
        createdAt: "2026-08-14T13:06:00.000Z",
        body: "Thanks for supporting Banny Studio. We can sort out delivery right here.",
      },
      "project",
    ),
    authenticated(
      {
        id: "evt_address_request",
        kind: "address_request.v1",
        createdAt: "2026-08-14T13:07:00.000Z",
        reason: "We need a destination before preparing your order.",
      },
      "project",
    ),
  ],
};

function freshSnapshot(): SupportSnapshot {
  return structuredClone(INITIAL_SNAPSHOT);
}

function eventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}

async function demoDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 220));
}

export class DemoSupportClient implements SupportClient {
  private snapshot = freshSnapshot();
  private viewerRole: ViewerRole = "customer";
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): SupportSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Single-device prototype control only. Network clients bind this at login. */
  setViewerRole(role: ViewerRole): void {
    this.viewerRole = role;
  }

  private replaceEvents(events: AuthenticatedSupportEvent[]): void {
    this.snapshot = { ...this.snapshot, events };
    for (const listener of this.listeners) listener();
  }

  private append(event: SupportEvent, sender: ViewerRole): void {
    this.replaceEvents([...this.snapshot.events, authenticated(event, sender)]);
  }

  async reset(): Promise<void> {
    await demoDelay();
    this.snapshot = freshSnapshot();
    for (const listener of this.listeners) listener();
  }

  async sendText(body: string): Promise<void> {
    const normalized = body.trim();
    if (!normalized) return;
    await demoDelay();
    this.append(
      { id: eventId("text"), kind: "text.v1", createdAt: now(), body: normalized },
      this.viewerRole,
    );
  }

  async requestAddress(): Promise<void> {
    await demoDelay();
    this.append(
      {
        id: eventId("address_request"),
        kind: "address_request.v1",
        createdAt: now(),
        reason: "Please share a shipping address for this order.",
      },
      "project",
    );
  }

  async shareAddress(
    address: ShippingAddress,
    approvedRoster: RecipientRosterBinding,
  ): Promise<void> {
    await demoDelay();

    if (!rosterBindingsEqual(approvedRoster, this.snapshot.roster)) {
      throw new Error("The recipient roster changed. Review the devices before sharing again.");
    }

    const fulfillment = deriveFulfillment(this.snapshot.events);
    const frozenApproval = rosterBindingFromSnapshot(this.snapshot.roster);

    if (fulfillment.stage === "shipped" && fulfillment.addressEvent) {
      const previousCorrection = fulfillment.addressCorrectionEvent;
      this.append(
        {
          id: eventId("address_correction_event"),
          kind: "shipping_address_correction.v1",
          createdAt: now(),
          correctionId: previousCorrection?.correctionId ?? eventId("address_correction"),
          correctionVersion: (previousCorrection?.correctionVersion ?? 0) + 1,
          shippedAddressId: fulfillment.addressEvent.addressId,
          shippedAddressVersion: fulfillment.addressEvent.version,
          address: structuredClone(address),
          approvedRoster: frozenApproval,
        },
        "customer",
      );
      return;
    }

    const previous = fulfillment.addressEvent;
    this.append(
      {
        id: eventId("shipping_address"),
        kind: "shipping_address.v1",
        createdAt: now(),
        addressId: previous?.addressId ?? eventId("address"),
        version: (previous?.version ?? 0) + 1,
        address: structuredClone(address),
        approvedRoster: frozenApproval,
      },
      "customer",
    );
  }

  async acknowledgeAddress(): Promise<void> {
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (!fulfillment.addressEvent) throw new Error("A shipping address is required first.");
    if (fulfillment.stage === "shipped") {
      throw new Error("A shipped order cannot approve another fulfillment address.");
    }
    await demoDelay();
    this.append(
      {
        id: eventId("address_ack"),
        kind: "address_ack.v1",
        createdAt: now(),
        addressId: fulfillment.addressEvent.addressId,
        addressVersion: fulfillment.addressEvent.version,
      },
      "project",
    );
  }

  async markPreparing(): Promise<void> {
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (
      !fulfillment.addressEvent ||
      !fulfillment.acknowledged ||
      fulfillment.stage !== "ready-to-fulfill"
    ) {
      throw new Error("Acknowledge the current address before preparing the order.");
    }
    await demoDelay();
    this.append(
      {
        id: eventId("fulfillment"),
        kind: "fulfillment_status.v1",
        createdAt: now(),
        status: "preparing",
        addressId: fulfillment.addressEvent.addressId,
        addressVersion: fulfillment.addressEvent.version,
      },
      "project",
    );
  }

  async markShipped(carrier: string, trackingCode: string): Promise<void> {
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (!fulfillment.addressEvent || fulfillment.stage !== "preparing") {
      throw new Error("Mark the order as preparing before it ships.");
    }
    const normalizedCarrier = carrier.trim();
    const normalizedTracking = trackingCode.trim();
    if (!normalizedCarrier || !normalizedTracking) {
      throw new Error("Carrier and tracking are required.");
    }

    await demoDelay();
    const createdAt = now();
    this.replaceEvents([
      ...this.snapshot.events,
      authenticated(
        {
          id: eventId("tracking"),
          kind: "tracking.v1",
          createdAt,
          carrier: normalizedCarrier,
          trackingCode: normalizedTracking,
          addressId: fulfillment.addressEvent.addressId,
          addressVersion: fulfillment.addressEvent.version,
        },
        "project",
      ),
      authenticated(
        {
          id: eventId("fulfillment"),
          kind: "fulfillment_status.v1",
          createdAt,
          status: "shipped",
          addressId: fulfillment.addressEvent.addressId,
          addressVersion: fulfillment.addressEvent.version,
        },
        "project",
      ),
    ]);
  }
}
