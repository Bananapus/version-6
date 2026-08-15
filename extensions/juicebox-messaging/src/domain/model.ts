export type ViewerRole = "customer" | "project";

export type PurchaseStatus = "verified" | "pending" | "refunded" | "disputed";

export interface ProjectIdentity {
  id: string;
  name: string;
  handle: string;
  initial: string;
  chainLabel: string;
}

export interface Participant {
  id: string;
  name: string;
  detail: string;
  role: "customer" | "support" | "owner";
  initial: string;
}

export interface PurchaseContext {
  id: string;
  orderLabel: string;
  itemName: string;
  itemDetail: string;
  amount: string;
  status: PurchaseStatus;
  txLabel: string;
  purchasedAt: string;
  supportUntil: string;
}

export interface ShippingAddress {
  recipientName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  deliveryNote: string;
}

export type AuthenticatedParticipantRole = "customer" | "project-staff";

/**
 * The exact cryptographic group state a person reviewed before sharing a
 * sensitive payload. Fingerprints are device credentials, not device IDs.
 */
export interface RecipientRosterBinding {
  rosterVersion: string;
  mlsEpoch: number;
  recipientDeviceFingerprints: readonly string[];
}

export interface RecipientDeviceMetadata {
  participantId: string;
  deviceId: string;
  deviceFingerprint: string;
  displayName: string;
  role: AuthenticatedParticipantRole;
}

/**
 * `devices` must contain one unique record for every fingerprint in the
 * inherited binding, with no missing, additional, or duplicate fingerprints.
 */
export interface RecipientRosterSnapshot extends RecipientRosterBinding {
  devices: readonly RecipientDeviceMetadata[];
}

interface EventBase {
  /** Stable idempotency key; the first authorized transcript occurrence wins. */
  id: string;
  createdAt: string;
}

export interface TextEvent extends EventBase {
  kind: "text.v1";
  body: string;
}

export interface AddressRequestEvent extends EventBase {
  kind: "address_request.v1";
  reason: string;
}

export interface ShippingAddressEvent extends EventBase {
  kind: "shipping_address.v1";
  addressId: string;
  version: number;
  address: ShippingAddress;
  approvedRoster: RecipientRosterBinding;
}

/**
 * A contact correction sent after dispatch. It is deliberately not another
 * shipping_address event: it cannot reopen or create a fulfillment workflow.
 */
export interface ShippingAddressCorrectionEvent extends EventBase {
  kind: "shipping_address_correction.v1";
  correctionId: string;
  correctionVersion: number;
  shippedAddressId: string;
  shippedAddressVersion: number;
  address: ShippingAddress;
  approvedRoster: RecipientRosterBinding;
}

export interface AddressAcknowledgedEvent extends EventBase {
  kind: "address_ack.v1";
  addressId: string;
  addressVersion: number;
}

export interface FulfillmentStatusEvent extends EventBase {
  kind: "fulfillment_status.v1";
  status: "preparing" | "shipped";
  addressId: string;
  addressVersion: number;
}

export interface TrackingEvent extends EventBase {
  kind: "tracking.v1";
  carrier: string;
  trackingCode: string;
  addressId: string;
  addressVersion: number;
}

export type SupportEvent =
  | TextEvent
  | AddressRequestEvent
  | ShippingAddressEvent
  | ShippingAddressCorrectionEvent
  | AddressAcknowledgedEvent
  | FulfillmentStatusEvent
  | TrackingEvent;

/**
 * Metadata authenticated by the crypto layer. None of these fields come from
 * the decrypted SupportEvent payload.
 */
export interface AuthenticatedEventMetadata {
  participantId: string;
  deviceId: string;
  deviceFingerprint: string;
  roleCredential: {
    credentialId: string;
    role: AuthenticatedParticipantRole;
    subjectParticipantId: string;
    subjectDeviceId: string;
    issuedAt: string;
  };
}

/** Returned by CryptoPort.open after sender and role verification. */
export interface AuthenticatedSupportEvent {
  event: SupportEvent;
  authenticated: AuthenticatedEventMetadata;
}

export interface SupportSnapshot {
  relationshipId: string;
  caseId: string;
  project: ProjectIdentity;
  purchase: PurchaseContext;
  customer: Participant;
  staff: Participant[];
  roster: RecipientRosterSnapshot;
  events: AuthenticatedSupportEvent[];
}

export type FulfillmentStage =
  | "address-needed"
  | "ready-to-fulfill"
  | "preparing"
  | "shipped";

export interface FulfillmentView {
  stage: FulfillmentStage;
  addressEvent?: ShippingAddressEvent;
  acknowledged: boolean;
  statusEvent?: FulfillmentStatusEvent;
  trackingEvent?: TrackingEvent;
  addressCorrectionEvent?: ShippingAddressCorrectionEvent;
}

export interface AddressValidation {
  valid: boolean;
  errors: Partial<Record<keyof ShippingAddress, string>>;
}

export interface SupportClient {
  getSnapshot: () => SupportSnapshot;
  subscribe: (listener: () => void) => () => void;
  reset: () => Promise<void>;
  /**
   * The implementation derives the sender from its bound device/session.
   * Callers must never be able to select an authenticated role per message.
   */
  sendText: (body: string) => Promise<void>;
  requestAddress: () => Promise<void>;
  shareAddress: (
    address: ShippingAddress,
    approvedRoster: RecipientRosterBinding,
  ) => Promise<void>;
  acknowledgeAddress: () => Promise<void>;
  markPreparing: () => Promise<void>;
  markShipped: (carrier: string, trackingCode: string) => Promise<void>;
}
