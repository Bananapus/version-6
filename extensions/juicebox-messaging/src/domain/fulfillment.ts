import type {
  AddressValidation,
  AuthenticatedParticipantRole,
  AuthenticatedSupportEvent,
  FulfillmentStatusEvent,
  FulfillmentView,
  RecipientRosterBinding,
  RecipientRosterSnapshot,
  ShippingAddress,
  ShippingAddressCorrectionEvent,
  ShippingAddressEvent,
  SupportEvent,
  TrackingEvent,
  ViewerRole,
} from "./model";

export const EMPTY_SHIPPING_ADDRESS: ShippingAddress = {
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  deliveryNote: "",
};

function canRoleEmitEvent(
  role: AuthenticatedParticipantRole,
  event: SupportEvent,
): boolean {
  switch (event.kind) {
    case "text.v1":
      return role === "customer" || role === "project-staff";
    case "shipping_address.v1":
    case "shipping_address_correction.v1":
      return role === "customer";
    case "address_request.v1":
    case "address_ack.v1":
    case "fulfillment_status.v1":
    case "tracking.v1":
      return role === "project-staff";
  }
}

/**
 * Domain authorization is intentionally checked after decryption. A valid MLS
 * member can still create an event kind their relationship role cannot emit.
 */
export function isAuthorizedSupportEvent(entry: AuthenticatedSupportEvent): boolean {
  const { authenticated, event } = entry;
  const { roleCredential } = authenticated;

  if (
    !authenticated.participantId ||
    !authenticated.deviceId ||
    !authenticated.deviceFingerprint ||
    !roleCredential.credentialId ||
    roleCredential.subjectParticipantId !== authenticated.participantId ||
    roleCredential.subjectDeviceId !== authenticated.deviceId
  ) {
    return false;
  }

  return canRoleEmitEvent(roleCredential.role, event);
}

export function authorizedSupportEvents(
  events: readonly AuthenticatedSupportEvent[],
): AuthenticatedSupportEvent[] {
  const seenEventIds = new Set<string>();
  const authorized: AuthenticatedSupportEvent[] = [];

  // The first authorized occurrence in canonical transcript order wins. This
  // makes retries/replays idempotent and prevents a later conflicting payload
  // from replacing an event that devices have already reduced.
  for (const entry of events) {
    const eventId = entry.event.id.trim();
    if (!eventId || !isAuthorizedSupportEvent(entry) || seenEventIds.has(eventId)) {
      continue;
    }

    seenEventIds.add(eventId);
    authorized.push(entry);
  }

  return authorized;
}

export function eventViewerRole(event: AuthenticatedSupportEvent): ViewerRole {
  return event.authenticated.roleCredential.role === "customer" ? "customer" : "project";
}

export function rosterBindingFromSnapshot(
  roster: RecipientRosterSnapshot,
): RecipientRosterBinding {
  if (!isValidRosterSnapshot(roster)) {
    throw new Error("Roster devices do not exactly match the approved fingerprint set.");
  }

  return {
    rosterVersion: roster.rosterVersion,
    mlsEpoch: roster.mlsEpoch,
    recipientDeviceFingerprints: [...roster.recipientDeviceFingerprints],
  };
}

function hasValidRosterBindingFields(binding: RecipientRosterBinding): boolean {
  return (
    Boolean(binding.rosterVersion) &&
    Number.isSafeInteger(binding.mlsEpoch) &&
    binding.mlsEpoch >= 0 &&
    binding.recipientDeviceFingerprints.length > 0 &&
    binding.recipientDeviceFingerprints.every(Boolean) &&
    new Set(binding.recipientDeviceFingerprints).size ===
      binding.recipientDeviceFingerprints.length
  );
}

function sameFingerprintSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftFingerprints = [...left].sort();
  const rightFingerprints = [...right].sort();
  return leftFingerprints.every(
    (fingerprint, index) => fingerprint === rightFingerprints[index],
  );
}

export function isValidRosterSnapshot(roster: RecipientRosterSnapshot): boolean {
  if (!hasValidRosterBindingFields(roster) || !Array.isArray(roster.devices)) return false;

  const deviceIds = roster.devices.map((device) => device.deviceId);
  const deviceFingerprints = roster.devices.map((device) => device.deviceFingerprint);
  if (
    roster.devices.length === 0 ||
    roster.devices.some(
      (device) =>
        !device.participantId ||
        !device.deviceId ||
        !device.deviceFingerprint ||
        !device.displayName ||
        (device.role !== "customer" && device.role !== "project-staff"),
    ) ||
    new Set(deviceIds).size !== deviceIds.length ||
    new Set(deviceFingerprints).size !== deviceFingerprints.length
  ) {
    return false;
  }

  return sameFingerprintSet(deviceFingerprints, roster.recipientDeviceFingerprints);
}

export function isValidRosterBinding(binding: RecipientRosterBinding): boolean {
  if (!hasValidRosterBindingFields(binding)) return false;

  // RecipientRosterSnapshot structurally extends the binding. Whenever callers
  // provide the richer object, validate that its device records correspond
  // one-for-one with the approved fingerprints rather than discarding them.
  if ("devices" in binding) {
    return isValidRosterSnapshot(binding as RecipientRosterSnapshot);
  }

  return true;
}

/** Device order is presentation-only; the approved set itself must match. */
export function rosterBindingsEqual(
  left: RecipientRosterBinding,
  right: RecipientRosterBinding,
): boolean {
  if (
    !isValidRosterBinding(left) ||
    !isValidRosterBinding(right) ||
    left.rosterVersion !== right.rosterVersion ||
    left.mlsEpoch !== right.mlsEpoch ||
    left.recipientDeviceFingerprints.length !== right.recipientDeviceFingerprints.length
  ) {
    return false;
  }

  return sameFingerprintSet(left.recipientDeviceFingerprints, right.recipientDeviceFingerprints);
}

export function latestAddressEvent(
  events: readonly AuthenticatedSupportEvent[],
): ShippingAddressEvent | undefined {
  return deriveFulfillment(events).addressEvent;
}

/**
 * Reduces only authenticated, role-authorized events and enforces the
 * fulfillment transition graph. In particular, `shipped` is terminal.
 */
export function deriveFulfillment(
  entries: readonly AuthenticatedSupportEvent[],
): FulfillmentView {
  let addressEvent: ShippingAddressEvent | undefined;
  let acknowledged = false;
  let statusEvent: FulfillmentStatusEvent | undefined;
  let trackingEvent: TrackingEvent | undefined;
  let addressCorrectionEvent: ShippingAddressCorrectionEvent | undefined;

  for (const { event } of authorizedSupportEvents(entries)) {
    switch (event.kind) {
      case "shipping_address.v1": {
        const expectedVersion = addressEvent ? addressEvent.version + 1 : 1;
        if (
          statusEvent?.status === "shipped" ||
          !isValidRosterBinding(event.approvedRoster) ||
          !Number.isSafeInteger(event.version) ||
          !event.addressId ||
          event.version !== expectedVersion
        ) {
          break;
        }

        if (addressEvent && event.addressId !== addressEvent.addressId) {
          break;
        }

        addressEvent = event;
        acknowledged = false;
        statusEvent = undefined;
        trackingEvent = undefined;
        break;
      }

      case "address_ack.v1":
        if (
          statusEvent?.status !== "shipped" &&
          addressEvent &&
          event.addressId === addressEvent.addressId &&
          event.addressVersion === addressEvent.version
        ) {
          acknowledged = true;
        }
        break;

      case "fulfillment_status.v1":
        if (
          !addressEvent ||
          !acknowledged ||
          event.addressId !== addressEvent.addressId ||
          event.addressVersion !== addressEvent.version ||
          statusEvent?.status === "shipped"
        ) {
          break;
        }

        if (event.status === "preparing") {
          if (!statusEvent) statusEvent = event;
        } else if (statusEvent?.status === "preparing") {
          statusEvent = event;
        }
        break;

      case "tracking.v1":
        if (
          addressEvent &&
          (statusEvent?.status === "preparing" || statusEvent?.status === "shipped") &&
          event.addressId === addressEvent.addressId &&
          event.addressVersion === addressEvent.version
        ) {
          trackingEvent = event;
        }
        break;

      case "shipping_address_correction.v1": {
        const expectedCorrectionVersion = addressCorrectionEvent
          ? addressCorrectionEvent.correctionVersion + 1
          : 1;
        if (
          statusEvent?.status !== "shipped" ||
          !addressEvent ||
          !isValidRosterBinding(event.approvedRoster) ||
          event.shippedAddressId !== addressEvent.addressId ||
          event.shippedAddressVersion !== addressEvent.version ||
          !Number.isSafeInteger(event.correctionVersion) ||
          !event.correctionId ||
          event.correctionVersion !== expectedCorrectionVersion
        ) {
          break;
        }

        if (addressCorrectionEvent && event.correctionId !== addressCorrectionEvent.correctionId) {
          break;
        }

        addressCorrectionEvent = event;
        break;
      }

      case "text.v1":
      case "address_request.v1":
        break;
    }
  }

  if (!addressEvent) return { stage: "address-needed", acknowledged: false };

  if (statusEvent?.status === "shipped") {
    return {
      stage: "shipped",
      addressEvent,
      acknowledged,
      statusEvent,
      trackingEvent,
      addressCorrectionEvent,
    };
  }

  if (statusEvent?.status === "preparing") {
    return { stage: "preparing", addressEvent, acknowledged, statusEvent, trackingEvent };
  }

  return { stage: "ready-to-fulfill", addressEvent, acknowledged };
}

export function validateShippingAddress(address: ShippingAddress): AddressValidation {
  const errors: AddressValidation["errors"] = {};
  const required: Array<keyof ShippingAddress> = [
    "recipientName",
    "line1",
    "city",
    "country",
  ];

  for (const field of required) {
    if (!address[field].trim()) errors[field] = "Required";
  }

  if (address.deliveryNote.length > 240) {
    errors.deliveryNote = "Keep delivery instructions under 240 characters";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function addressToMultiline(address: ShippingAddress): string {
  const locality = [address.city, address.region].filter(Boolean).join(", ");
  const localityAndPostalCode = [locality, address.postalCode].filter(Boolean).join(" ");
  return [
    address.recipientName,
    address.line1,
    address.line2,
    localityAndPostalCode,
    address.country,
    address.deliveryNote ? `Delivery note: ${address.deliveryNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function maskedAddressLabel(): string {
  return "Shipping destination hidden";
}

export function genericEventPreview(event: SupportEvent): string {
  switch (event.kind) {
    case "text.v1":
      return event.body.length > 72 ? `${event.body.slice(0, 69)}…` : event.body;
    case "address_request.v1":
      return "Shipping address requested";
    case "shipping_address.v1":
      return event.version === 1 ? "Shipping address shared" : "Shipping address updated";
    case "shipping_address_correction.v1":
      return event.correctionVersion === 1
        ? "Post-shipment address correction shared"
        : "Post-shipment address correction updated";
    case "address_ack.v1":
      return "Shipping address acknowledged";
    case "fulfillment_status.v1":
      return event.status === "shipped" ? "Order marked shipped" : "Order is being prepared";
    case "tracking.v1":
      return "Tracking details shared";
  }
}

export function stageLabel(stage: FulfillmentView["stage"]): string {
  switch (stage) {
    case "address-needed":
      return "Address needed";
    case "ready-to-fulfill":
      return "Ready to fulfill";
    case "preparing":
      return "Preparing";
    case "shipped":
      return "Shipped";
  }
}
