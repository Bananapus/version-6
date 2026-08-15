export const DEV_MESSAGING_API_PREFIX = "/api/dev/messaging";

export const SESSION_COOKIE_NAME = "jbmsg_dev_session";
export const CSRF_COOKIE_NAME = "jbmsg_dev_csrf";
export const CSRF_HEADER_NAME = "x-messaging-csrf";
export const BOOTSTRAP_SECRET_HEADER_NAME = "x-messaging-dev-secret";

export type MessagingRole = "customer" | "project-staff";

export interface SessionActor {
  participantId: string;
  role: MessagingRole;
  expiresAt: number;
}

export interface ConversationSummary {
  conversationId: string;
  projectRef: string;
  rosterVersion: string;
  epoch: number;
  createdAt: number;
}

export interface RosterMember {
  participantId: string;
  role: MessagingRole;
  joinedAt: number;
}

export interface ConversationDetail extends ConversationSummary {
  roster: RosterMember[];
}

export interface StoredEnvelope {
  cursor: number;
  conversationId: string;
  clientEnvelopeId: string;
  senderParticipantId: string;
  senderRole: MessagingRole;
  rosterVersion: string;
  epoch: number;
  encoding: "base64url";
  contentType: "application/vnd.juicebox.messaging.simulated-envelope+json";
  ciphertext: string;
  createdAt: number;
}

export class DevMessagingError extends Error {
  readonly devMessagingError = true;
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "DevMessagingError";
    this.code = code;
    this.status = status;
  }
}

export function isDevMessagingError(error: unknown): error is DevMessagingError {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Partial<DevMessagingError>;
  return (
    candidate.devMessagingError === true &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599 &&
    typeof candidate.message === "string"
  );
}
