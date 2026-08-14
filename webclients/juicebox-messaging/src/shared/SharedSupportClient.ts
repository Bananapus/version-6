import {
  deriveFulfillment,
  rosterBindingFromSnapshot,
  rosterBindingsEqual,
} from "@/domain/fulfillment";
import type {
  AuthenticatedSupportEvent,
  Participant,
  RecipientRosterBinding,
  RecipientRosterSnapshot,
  ShippingAddress,
  SupportClient,
  SupportEvent,
  SupportSnapshot,
  ViewerRole,
} from "@/domain/model";
import {
  SharedProtocolError,
  decodeSimulatedSupportEvent,
  encodeSimulatedSupportEvent,
  getSharedConversation,
  postSharedEnvelope,
  syncSharedEnvelopes,
  type SharedActor,
  type SharedConversation,
  type SharedEnvelope,
} from "./protocol";
import { developmentEventId } from "./ids";

export type SharedConnection = "syncing" | "live" | "reconnecting" | "offline";

export interface SharedClientStatus {
  connection: SharedConnection;
  peerJoined: boolean;
  rosterSize: number;
  lastError?: string;
}

interface PendingAttempt {
  events: SupportEvent[];
}

interface ExpectedConversationContext {
  rosterVersion: string;
  epoch: number;
}

const POLL_INTERVAL_MS = 1_250;
export const MAX_SHARED_SYNC_PAGES = 100;

export class SharedSupportClient implements SupportClient {
  readonly actor: SharedActor;
  readonly viewerRole: ViewerRole;
  readonly csrfToken: string;

  private conversation: SharedConversation;
  private snapshot: SupportSnapshot;
  private status: SharedClientStatus;
  private cursor = 0;
  private stopped = false;
  private consecutiveFailures = 0;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private syncInFlight: Promise<void> | undefined;
  private readonly events: AuthenticatedSupportEvent[] = [];
  private readonly snapshotListeners = new Set<() => void>();
  private readonly statusListeners = new Set<() => void>();
  private readonly attempts = new Map<string, PendingAttempt>();

  constructor(input: {
    actor: SharedActor;
    conversation: SharedConversation;
    csrfToken: string;
  }) {
    this.actor = input.actor;
    this.viewerRole = input.actor.role === "customer" ? "customer" : "project";
    this.conversation = input.conversation;
    this.csrfToken = input.csrfToken;
    this.snapshot = buildSnapshot(input.conversation, this.events);
    this.status = statusFromConversation(input.conversation, "syncing");
    this.schedulePoll(0);
  }

  getSnapshot = (): SupportSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  getStatus = (): SharedClientStatus => this.status;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  dispose(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  async syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.performSync().finally(() => {
      this.syncInFlight = undefined;
    });
    return this.syncInFlight;
  }

  async reset(): Promise<void> {
    throw new Error("Shared test rooms cannot be reset. Leave and create a new test instead.");
  }

  async sendText(body: string): Promise<void> {
    const normalized = body.trim();
    if (!normalized) return;
    await this.submitAttempt(`text:${normalized}`, () => [
      {
        id: eventId("text"),
        kind: "text.v1",
        createdAt: now(),
        body: normalized,
      },
    ]);
  }

  async requestAddress(): Promise<void> {
    this.assertRole("project-staff");
    await this.submitAttempt("request-address", () => [
      {
        id: eventId("address_request"),
        kind: "address_request.v1",
        createdAt: now(),
        reason: "Please share a fictional shipping address for this HTTP LAN test.",
      },
    ]);
  }

  async shareAddress(
    address: ShippingAddress,
    approvedRoster: RecipientRosterBinding,
  ): Promise<void> {
    this.assertRole("customer");
    await this.syncNow();
    assertApprovedRosterMatchesConversation(approvedRoster, this.conversation);

    const fulfillment = deriveFulfillment(this.snapshot.events);
    const frozenApproval = rosterBindingFromSnapshot(this.snapshot.roster);
    const reviewedContext: ExpectedConversationContext = {
      rosterVersion: this.conversation.rosterVersion,
      epoch: this.conversation.epoch,
    };
    const attemptKey = `share-address:${JSON.stringify(address)}:${JSON.stringify(frozenApproval)}`;

    await this.submitAttempt(
      attemptKey,
      () => {
        if (fulfillment.stage === "shipped" && fulfillment.addressEvent) {
          const previous = fulfillment.addressCorrectionEvent;
          return [
            {
              id: eventId("address_correction_event"),
              kind: "shipping_address_correction.v1",
              createdAt: now(),
              correctionId: previous?.correctionId ?? eventId("address_correction"),
              correctionVersion: (previous?.correctionVersion ?? 0) + 1,
              shippedAddressId: fulfillment.addressEvent.addressId,
              shippedAddressVersion: fulfillment.addressEvent.version,
              address: structuredClone(address),
              approvedRoster: frozenApproval,
            },
          ];
        }

        const previous = fulfillment.addressEvent;
        return [
          {
            id: eventId("shipping_address"),
            kind: "shipping_address.v1",
            createdAt: now(),
            addressId: previous?.addressId ?? eventId("address"),
            version: (previous?.version ?? 0) + 1,
            address: structuredClone(address),
            approvedRoster: frozenApproval,
          },
        ];
      },
      reviewedContext,
    );
  }

  async acknowledgeAddress(): Promise<void> {
    this.assertRole("project-staff");
    await this.syncNow();
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (!fulfillment.addressEvent) throw new Error("A shipping address is required first.");
    if (fulfillment.stage === "shipped") {
      throw new Error("A shipped order cannot approve another fulfillment address.");
    }
    const address = fulfillment.addressEvent;
    await this.submitAttempt(`ack:${address.addressId}:${address.version}`, () => [
      {
        id: eventId("address_ack"),
        kind: "address_ack.v1",
        createdAt: now(),
        addressId: address.addressId,
        addressVersion: address.version,
      },
    ]);
  }

  async markPreparing(): Promise<void> {
    this.assertRole("project-staff");
    await this.syncNow();
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (
      !fulfillment.addressEvent ||
      !fulfillment.acknowledged ||
      fulfillment.stage !== "ready-to-fulfill"
    ) {
      throw new Error("Acknowledge the current address before preparing the order.");
    }
    const address = fulfillment.addressEvent;
    await this.submitAttempt(`preparing:${address.addressId}:${address.version}`, () => [
      {
        id: eventId("fulfillment"),
        kind: "fulfillment_status.v1",
        createdAt: now(),
        status: "preparing",
        addressId: address.addressId,
        addressVersion: address.version,
      },
    ]);
  }

  async markShipped(carrier: string, trackingCode: string): Promise<void> {
    this.assertRole("project-staff");
    await this.syncNow();
    const fulfillment = deriveFulfillment(this.snapshot.events);
    if (!fulfillment.addressEvent || fulfillment.stage !== "preparing") {
      throw new Error("Mark the order as preparing before it ships.");
    }
    const normalizedCarrier = carrier.trim();
    const normalizedTracking = trackingCode.trim();
    if (!normalizedCarrier || !normalizedTracking) {
      throw new Error("Carrier and tracking are required.");
    }
    const address = fulfillment.addressEvent;
    const attemptKey = `shipped:${address.addressId}:${address.version}:${normalizedCarrier}:${normalizedTracking}`;
    await this.submitAttempt(attemptKey, () => {
      const createdAt = now();
      return [
        {
          id: eventId("tracking"),
          kind: "tracking.v1",
          createdAt,
          carrier: normalizedCarrier,
          trackingCode: normalizedTracking,
          addressId: address.addressId,
          addressVersion: address.version,
        },
        {
          id: eventId("fulfillment"),
          kind: "fulfillment_status.v1",
          createdAt,
          status: "shipped",
          addressId: address.addressId,
          addressVersion: address.version,
        },
      ];
    });
  }

  private assertRole(expected: SharedActor["role"]): void {
    if (this.actor.role !== expected) {
      throw new Error(
        expected === "customer"
          ? "Only the customer test device can perform that action."
          : "Only the project-team test device can perform that action.",
      );
    }
  }

  private async submitAttempt(
    key: string,
    buildEvents: () => SupportEvent[],
    expectedContext?: ExpectedConversationContext,
  ): Promise<void> {
    await this.syncNow();
    if (!hasBothRoles(this.conversation)) {
      throw new Error("Wait for the second test device to join before sending.");
    }
    if (expectedContext && !conversationContextMatches(this.conversation, expectedContext)) {
      this.attempts.delete(key);
      throw new Error("The test roster changed. Review the current session devices again.");
    }

    const attempt = this.attempts.get(key) ?? { events: buildEvents() };
    this.attempts.set(key, attempt);

    try {
      for (const event of attempt.events) {
        if (expectedContext && !conversationContextMatches(this.conversation, expectedContext)) {
          this.attempts.delete(key);
          throw new Error("The test roster changed. Review the current session devices again.");
        }
        const submissionConversation = this.conversation;
        await postSharedEnvelope(submissionConversation, this.csrfToken, {
          clientEnvelopeId: `envelope_${event.id}`,
          ciphertext: encodeSimulatedSupportEvent(event),
        });
      }
      await this.syncNow();
      this.attempts.delete(key);
    } catch (error) {
      if (error instanceof SharedProtocolError && error.code === "roster_changed") {
        this.attempts.delete(key);
        await this.syncNow().catch(() => undefined);
        throw new Error("The test roster changed. Review the latest devices and try again.");
      }
      throw error;
    }
  }

  private async performSync(): Promise<void> {
    try {
      const conversation = await getSharedConversation(this.conversation.conversationId);
      if (conversation.conversationId !== this.conversation.conversationId) {
        throw new SharedProtocolError("The development service returned the wrong conversation.");
      }

      let snapshotChanged = !sameConversation(this.conversation, conversation);
      this.conversation = conversation;

      let hasMore = true;
      let pageCount = 0;
      while (hasMore) {
        if (pageCount >= MAX_SHARED_SYNC_PAGES) {
          throw new SharedProtocolError(
            "The shared transcript exceeded the per-sync pagination limit.",
          );
        }
        pageCount += 1;
        const page = await syncSharedEnvelopes(conversation.conversationId, this.cursor);
        for (const envelope of page.envelopes) {
          if (envelope.conversationId !== conversation.conversationId) {
            throw new SharedProtocolError("An envelope belonged to the wrong conversation.");
          }
          const opened = openSimulatedEnvelope(envelope, conversation);
          if (opened) {
            this.events.push(opened);
            snapshotChanged = true;
          }
        }
        this.cursor = page.nextCursor;
        hasMore = page.hasMore;
      }

      if (snapshotChanged) {
        this.snapshot = buildSnapshot(this.conversation, this.events);
        for (const listener of this.snapshotListeners) listener();
      }
      this.consecutiveFailures = 0;
      this.setStatus(statusFromConversation(this.conversation, "live"));
    } catch (error) {
      this.consecutiveFailures += 1;
      const message = error instanceof Error ? error.message : "Shared sync failed.";
      this.setStatus({
        ...statusFromConversation(
          this.conversation,
          this.status.connection === "syncing" || this.consecutiveFailures >= 3
            ? "offline"
            : "reconnecting",
        ),
        lastError: message,
      });
      throw error;
    }
  }

  private schedulePoll(delay: number): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      void this.syncNow()
        .catch(() => undefined)
        .finally(() => this.schedulePoll(POLL_INTERVAL_MS));
    }, delay);
  }

  private setStatus(next: SharedClientStatus): void {
    if (
      this.status.connection === next.connection &&
      this.status.peerJoined === next.peerJoined &&
      this.status.rosterSize === next.rosterSize &&
      this.status.lastError === next.lastError
    ) {
      return;
    }
    this.status = next;
    for (const listener of this.statusListeners) listener();
  }
}

export function openSimulatedEnvelope(
  envelope: SharedEnvelope,
  availableRoster?: SharedConversation,
): AuthenticatedSupportEvent | null {
  let event: SupportEvent;
  try {
    event = decodeSimulatedSupportEvent(envelope.ciphertext);
  } catch {
    // An invalid or future payload must not prevent the cursor from advancing.
    return null;
  }

  if (
    (event.kind === "shipping_address.v1" ||
      event.kind === "shipping_address_correction.v1") &&
    !sensitiveRosterEvidenceMatchesEnvelope(event.approvedRoster, envelope, availableRoster)
  ) {
    return null;
  }

  const role = envelope.senderRole;
  const deviceId = deviceIdFor(envelope.senderParticipantId);
  return {
    event,
    authenticated: {
      participantId: envelope.senderParticipantId,
      deviceId,
      deviceFingerprint: fingerprintFor(envelope.senderParticipantId),
      roleCredential: {
        credentialId: `dev_http_role_${envelope.senderParticipantId}`,
        role,
        subjectParticipantId: envelope.senderParticipantId,
        subjectDeviceId: deviceId,
        issuedAt: new Date(envelope.createdAt).toISOString(),
      },
    },
  };
}

function sensitiveRosterEvidenceMatchesEnvelope(
  approvedRoster: RecipientRosterBinding,
  envelope: SharedEnvelope,
  availableRoster?: SharedConversation,
): boolean {
  if (
    approvedRoster.rosterVersion !== `dev-http-${envelope.rosterVersion}` ||
    approvedRoster.mlsEpoch !== envelope.epoch
  ) {
    return false;
  }

  if (
    availableRoster &&
    availableRoster.rosterVersion === envelope.rosterVersion &&
    availableRoster.epoch === envelope.epoch
  ) {
    return rosterBindingsEqual(
      approvedRoster,
      sharedRosterFromConversation(availableRoster),
    );
  }

  // The development backend currently exposes only the live roster, not a
  // historical roster snapshot. The server-stamped version/epoch still binds
  // older envelopes; exact fingerprints are checked whenever that era is live.
  return true;
}

function buildSnapshot(
  conversation: SharedConversation,
  events: readonly AuthenticatedSupportEvent[],
): SupportSnapshot {
  const customerMember = conversation.roster.find((member) => member.role === "customer");
  const projectMembers = conversation.roster.filter((member) => member.role === "project-staff");
  const customer: Participant = {
    id: customerMember?.participantId ?? "pending_customer_device",
    name: customerMember ? "sunlit-wallet" : "Customer device pending",
    detail: "Fictional HTTP LAN test identity",
    role: "customer",
    initial: "S",
  };
  const staff: Participant[] = projectMembers.map((member, index) => ({
    id: member.participantId,
    name: index === 0 ? "Mira" : `Project tester ${index + 1}`,
    detail: "Fictional project-team identity",
    role: index === 0 ? "support" : "owner",
    initial: index === 0 ? "M" : "P",
  }));

  return {
    relationshipId: `shared_${conversation.conversationId}`,
    caseId: `shared_case_${conversation.conversationId}`,
    project: {
      id: "project_demo_banny",
      name: "Banny Studio",
      handle: "@banny",
      initial: "B",
      chainLabel: "Fictional Base test context",
    },
    purchase: {
      id: "purchase_demo_8q3m",
      orderLabel: "Order #8Q3M",
      itemName: "Banny artist tee",
      itemDetail: "Sunrise / Medium · Qty 1",
      amount: "0.018 test ETH",
      status: "pending",
      txLabel: "fictional",
      purchasedAt: "Fictional test purchase",
      supportUntil: "End of shared test",
    },
    customer,
    staff,
    roster: sharedRosterFromConversation(conversation),
    events: [...events],
  };
}

export function sharedRosterFromConversation(
  conversation: SharedConversation,
): RecipientRosterSnapshot {
  const devices = conversation.roster.map((member, index) => ({
    participantId: member.participantId,
    deviceId: deviceIdFor(member.participantId),
    deviceFingerprint: fingerprintFor(member.participantId),
    displayName:
      member.role === "customer"
        ? "Customer shared browser"
        : `Project-team shared browser${index > 1 ? ` ${index}` : ""}`,
    role: member.role,
  }));
  return {
    rosterVersion: `dev-http-${conversation.rosterVersion}`,
    mlsEpoch: conversation.epoch,
    recipientDeviceFingerprints: devices.map((device) => device.deviceFingerprint),
    devices,
  };
}

export function assertApprovedRosterMatchesConversation(
  approvedRoster: RecipientRosterBinding,
  conversation: SharedConversation,
): void {
  if (!rosterBindingsEqual(approvedRoster, sharedRosterFromConversation(conversation))) {
    throw new Error("The test roster changed. Review the current session devices again.");
  }
}

function statusFromConversation(
  conversation: SharedConversation,
  connection: SharedConnection,
): SharedClientStatus {
  return {
    connection,
    peerJoined: hasBothRoles(conversation),
    rosterSize: conversation.roster.length,
  };
}

function hasBothRoles(conversation: SharedConversation): boolean {
  return (
    conversation.roster.some((member) => member.role === "customer") &&
    conversation.roster.some((member) => member.role === "project-staff")
  );
}

function sameConversation(left: SharedConversation, right: SharedConversation): boolean {
  return (
    left.rosterVersion === right.rosterVersion &&
    left.epoch === right.epoch &&
    left.roster.length === right.roster.length &&
    left.roster.every((member, index) => {
      const other = right.roster[index];
      return (
        other?.participantId === member.participantId &&
        other.role === member.role &&
        other.joinedAt === member.joinedAt
      );
    })
  );
}

function conversationContextMatches(
  conversation: SharedConversation,
  expected: ExpectedConversationContext,
): boolean {
  return (
    conversation.rosterVersion === expected.rosterVersion &&
    conversation.epoch === expected.epoch
  );
}

function deviceIdFor(participantId: string): string {
  return `dev_http_device_${participantId}`;
}

function fingerprintFor(participantId: string): string {
  return `dev-http-simulation-${participantId}`;
}

function eventId(prefix: string): string {
  return developmentEventId(prefix);
}

function now(): string {
  return new Date().toISOString();
}
