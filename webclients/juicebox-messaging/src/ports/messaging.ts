import type {
  AuthenticatedSupportEvent,
  ProjectIdentity,
  PurchaseContext,
  RecipientRosterBinding,
  RecipientRosterSnapshot,
  SupportEvent,
} from "@/domain/model";

declare const ciphertextBrand: unique symbol;

export type OpaqueCiphertext = string & { readonly [ciphertextBrand]: true };

export interface CiphertextEnvelope {
  envelopeId: string;
  conversationId: string;
  epoch: number;
  rosterVersion: string;
  contentType: "application/vnd.juicebox.messaging.mls";
  ciphertext: OpaqueCiphertext;
  ciphertextHash: string;
}

export interface IdentityAdapter {
  getAccountId(): Promise<string>;
  getDeviceId(): Promise<string>;
  requestWalletProof(reason: "purchase" | "project-authority" | "device-recovery"): Promise<void>;
}

export interface EligibilityAdapter {
  resolvePurchaseContext(opaqueClaimHandle: string): Promise<PurchaseContext>;
  resolveProject(projectRef: string): Promise<ProjectIdentity>;
  evaluatePurchaseSupport(purchaseId: string, deviceId: string): Promise<{
    eligible: boolean;
    leaseId?: string;
    expiresAt?: string;
  }>;
}

export interface RecipientRosterAdapter {
  getRoster(conversationId: string): Promise<RecipientRosterSnapshot>;
}

export interface SealContext {
  /**
   * The roster the user saw and approved. `seal` must abort if the live group
   * differs by version, MLS epoch, or even one device fingerprint.
   */
  expectedRoster: RecipientRosterBinding;
}

export interface CryptoPort {
  seal(
    conversationId: string,
    event: SupportEvent,
    context: SealContext,
  ): Promise<CiphertextEnvelope>;
  /** Verifies sender device and role credential before returning plaintext. */
  open(envelope: CiphertextEnvelope): Promise<AuthenticatedSupportEvent>;
}

export interface MessagingPort {
  sync(cursor?: string): Promise<{ envelopes: CiphertextEnvelope[]; nextCursor: string }>;
  submitEnvelope(envelope: CiphertextEnvelope, idempotencyKey: string): Promise<void>;
}

export interface HostBridgePort {
  announceReady(): void;
  publishUnreadCount(count: number): void;
  requestClose(): void;
}

// The demo intentionally does not implement these ports. Production wiring must
// seal a domain event before MessagingPort can accept it.
