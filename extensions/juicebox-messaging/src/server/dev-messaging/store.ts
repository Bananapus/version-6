import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM,
  MAX_ENVELOPES_PER_ROOM,
  ROOM_TTL_MS,
} from "./limits";
import {
  type ConversationDetail,
  type ConversationSummary,
  DevMessagingError,
  type MessagingRole,
  type RosterMember,
  type SessionActor,
  type StoredEnvelope,
} from "./types";

const SCHEMA_VERSION = 1;
const INVITATION_LIFETIME_MS = 30 * 60 * 1000;
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

type SqlRow = Record<string, unknown>;

interface SessionRow extends SessionActor {
  tokenHash: string;
  csrfHash: string;
}

interface InvitationResult {
  invitationToken: string;
  participantId: string;
  role: MessagingRole;
  expiresAt: number;
}

interface ExchangeResult {
  sessionToken: string;
  csrfToken: string;
  actor: SessionActor;
  conversation: ConversationDetail;
}

interface SubmitEnvelopeInput {
  clientEnvelopeId: string;
  rosterVersion: string;
  epoch: number;
  encoding: "base64url";
  contentType: "application/vnd.juicebox.messaging.simulated-envelope+json";
  ciphertext: string;
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function asNumber(value: unknown, field: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new Error(`Invalid SQLite integer in ${field}`);
  }
  return number;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid SQLite text in ${field}`);
  }
  return value;
}

function asRole(value: unknown): MessagingRole {
  if (value !== "customer" && value !== "project-staff") {
    throw new Error("Invalid SQLite role");
  }
  return value;
}

function mapConversation(row: SqlRow): ConversationSummary {
  return {
    conversationId: asString(row.id, "conversation.id"),
    projectRef: asString(row.project_ref, "conversation.project_ref"),
    rosterVersion: String(asNumber(row.roster_version, "conversation.roster_version")),
    epoch: asNumber(row.epoch, "conversation.epoch"),
    createdAt: asNumber(row.created_at, "conversation.created_at"),
  };
}

function mapRosterMember(row: SqlRow): RosterMember {
  return {
    participantId: asString(row.participant_id, "membership.participant_id"),
    role: asRole(row.role),
    joinedAt: asNumber(row.joined_at, "membership.joined_at"),
  };
}

function mapEnvelope(row: SqlRow): StoredEnvelope {
  return {
    cursor: asNumber(row.sequence, "envelope.sequence"),
    conversationId: asString(row.conversation_id, "envelope.conversation_id"),
    clientEnvelopeId: asString(row.client_envelope_id, "envelope.client_envelope_id"),
    senderParticipantId: asString(row.sender_participant_id, "envelope.sender_participant_id"),
    senderRole: asRole(row.sender_role),
    rosterVersion: String(asNumber(row.roster_version, "envelope.roster_version")),
    epoch: asNumber(row.epoch, "envelope.epoch"),
    encoding: "base64url",
    contentType: "application/vnd.juicebox.messaging.simulated-envelope+json",
    ciphertext: asString(row.ciphertext, "envelope.ciphertext"),
    createdAt: asNumber(row.created_at, "envelope.created_at"),
  };
}

export class DevMessagingStore {
  readonly database: DatabaseSync;
  readonly now: () => number;

  constructor(databasePath: string, now: () => number = Date.now) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    }

    this.database = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
    });
    this.now = now;
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.initializeSchema();
  }

  close(): void {
    this.database.close();
  }

  bootstrap(projectRef: string): {
    conversation: ConversationDetail;
    invitations: { customer: InvitationResult; projectStaff: InvitationResult };
  } {
    this.cleanupExpiredRooms();
    const conversationId = randomUUID();
    const createdAt = this.now();
    const customer = this.prepareInvitation(conversationId, "customer", createdAt);
    const projectStaff = this.prepareInvitation(conversationId, "project-staff", createdAt);

    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO conversations
            (id, client_conversation_id, project_ref, roster_version, epoch, created_at)
           VALUES (?, NULL, ?, 0, 0, ?)`,
        )
        .run(conversationId, projectRef, createdAt);
      this.insertInvitation(conversationId, customer, null, createdAt);
      this.insertInvitation(conversationId, projectStaff, null, createdAt);
    });

    return {
      conversation: this.getConversationUnscoped(conversationId),
      invitations: {
        customer: this.toPublicInvitation(customer),
        projectStaff: this.toPublicInvitation(projectStaff),
      },
    };
  }

  exchangeInvitation(invitationToken: string): ExchangeResult {
    this.cleanupExpiredRooms();
    const tokenHash = hashSecret(invitationToken);
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const now = this.now();

    return this.transaction(() => {
      const invitation = this.database
        .prepare(
          `SELECT conversation_id, participant_id, role, expires_at, consumed_at
             FROM invitations
            WHERE token_hash = ?`,
        )
        .get(tokenHash) as SqlRow | undefined;

      if (
        !invitation ||
        invitation.consumed_at !== null ||
        asNumber(invitation.expires_at, "invitation.expires_at") <= now
      ) {
        throw new DevMessagingError(
          "invalid_invitation",
          401,
          "Invitation is invalid, expired, or already used.",
        );
      }

      const conversationId = asString(invitation.conversation_id, "invitation.conversation_id");
      const participantId = asString(invitation.participant_id, "invitation.participant_id");
      const role = asRole(invitation.role);
      const consumed = this.database
        .prepare(
          `UPDATE invitations
              SET consumed_at = ?
            WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
        )
        .run(now, tokenHash, now);

      if (Number(consumed.changes) !== 1) {
        throw new DevMessagingError(
          "invalid_invitation",
          401,
          "Invitation is invalid, expired, or already used.",
        );
      }

      const membership = this.database
        .prepare(
          `INSERT INTO memberships (conversation_id, participant_id, role, joined_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(conversation_id, participant_id) DO NOTHING`,
        )
        .run(conversationId, participantId, role, now);

      if (Number(membership.changes) === 1) {
        this.database
          .prepare(
            `UPDATE conversations
                SET roster_version = roster_version + 1,
                    epoch = epoch + 1
              WHERE id = ?`,
          )
          .run(conversationId);
      }

      const expiresAt = now + SESSION_LIFETIME_MS;
      this.database
        .prepare(
          `INSERT INTO sessions
            (token_hash, participant_id, role, csrf_hash, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          hashSecret(sessionToken),
          participantId,
          role,
          hashSecret(csrfToken),
          now,
          expiresAt,
        );

      return {
        sessionToken,
        csrfToken,
        actor: { participantId, role, expiresAt },
        conversation: this.getConversationUnscoped(conversationId),
      };
    });
  }

  authenticate(sessionToken: string): SessionRow {
    this.cleanupExpiredRooms();
    const now = this.now();
    const tokenHash = hashSecret(sessionToken);
    const row = this.database
      .prepare(
        `SELECT token_hash, participant_id, role, csrf_hash, expires_at
           FROM sessions
          WHERE token_hash = ? AND expires_at > ?`,
      )
      .get(tokenHash, now) as SqlRow | undefined;

    if (!row) {
      throw new DevMessagingError("unauthenticated", 401, "A valid session is required.");
    }

    return {
      tokenHash: asString(row.token_hash, "session.token_hash"),
      participantId: asString(row.participant_id, "session.participant_id"),
      role: asRole(row.role),
      csrfHash: asString(row.csrf_hash, "session.csrf_hash"),
      expiresAt: asNumber(row.expires_at, "session.expires_at"),
    };
  }

  verifyCsrf(session: SessionRow, csrfToken: string): void {
    if (hashSecret(csrfToken) !== session.csrfHash) {
      throw new DevMessagingError("invalid_csrf", 403, "CSRF verification failed.");
    }
  }

  logout(sessionToken: string): void {
    this.database
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(hashSecret(sessionToken));
  }

  listConversations(session: SessionActor): ConversationSummary[] {
    this.cleanupExpiredRooms();
    const rows = this.database
      .prepare(
        `SELECT c.id, c.project_ref, c.roster_version, c.epoch, c.created_at
           FROM conversations c
           JOIN memberships m ON m.conversation_id = c.id
          WHERE m.participant_id = ? AND m.role = ?
          ORDER BY c.created_at ASC, c.id ASC`,
      )
      .all(session.participantId, session.role) as SqlRow[];
    return rows.map(mapConversation);
  }

  getConversation(session: SessionActor, conversationId: string): ConversationDetail {
    this.cleanupExpiredRooms();
    this.assertMembership(session, conversationId);
    return this.getConversationUnscoped(conversationId);
  }

  syncEnvelopes(
    session: SessionActor,
    conversationId: string,
    afterCursor: number,
    limit: number,
  ): { envelopes: StoredEnvelope[]; nextCursor: number; hasMore: boolean } {
    this.cleanupExpiredRooms();
    this.assertMembership(session, conversationId);
    const rows = this.database
      .prepare(
        `SELECT sequence, conversation_id, client_envelope_id, sender_participant_id,
                sender_role, roster_version, epoch, ciphertext, created_at
           FROM envelopes
          WHERE conversation_id = ? AND sequence > ?
          ORDER BY sequence ASC
          LIMIT ?`,
      )
      .all(conversationId, afterCursor, limit + 1) as SqlRow[];
    const hasMore = rows.length > limit;
    const envelopes = rows.slice(0, limit).map(mapEnvelope);
    return {
      envelopes,
      nextCursor: envelopes.at(-1)?.cursor ?? afterCursor,
      hasMore,
    };
  }

  submitEnvelope(
    session: SessionActor,
    conversationId: string,
    input: SubmitEnvelopeInput,
  ): { envelope: StoredEnvelope; duplicate: boolean } {
    this.cleanupExpiredRooms();
    return this.transaction(() => this.submitEnvelopeInTransaction(session, conversationId, input));
  }

  private submitEnvelopeInTransaction(
    session: SessionActor,
    conversationId: string,
    input: SubmitEnvelopeInput,
  ): { envelope: StoredEnvelope; duplicate: boolean } {
    const conversation = this.getConversation(session, conversationId);
    this.assertFixedRoster(conversationId);
    if (
      conversation.rosterVersion !== input.rosterVersion ||
      conversation.epoch !== input.epoch
    ) {
      throw new DevMessagingError(
        "roster_changed",
        409,
        "The conversation roster or epoch changed; refresh before encrypting again.",
      );
    }

    const existing = this.findEnvelope(conversationId, input.clientEnvelopeId);
    if (existing) {
      const matches =
        existing.senderParticipantId === session.participantId &&
        existing.senderRole === session.role &&
        existing.rosterVersion === input.rosterVersion &&
        existing.epoch === input.epoch &&
        existing.encoding === input.encoding &&
        existing.contentType === input.contentType &&
        existing.ciphertext === input.ciphertext;
      if (!matches) {
        throw new DevMessagingError(
          "idempotency_conflict",
          409,
          "The client envelope ID was already used with different data.",
        );
      }
      return { envelope: existing, duplicate: true };
    }

    this.assertRoomQuota(conversationId, input.ciphertext.length);

    const createdAt = this.now();
    this.database
      .prepare(
        `INSERT INTO envelopes
          (conversation_id, client_envelope_id, sender_participant_id, sender_role,
           roster_version, epoch, encoding, content_type, ciphertext, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conversationId,
        input.clientEnvelopeId,
        session.participantId,
        session.role,
        Number(input.rosterVersion),
        input.epoch,
        input.encoding,
        input.contentType,
        input.ciphertext,
        createdAt,
      );

    const envelope = this.findEnvelope(conversationId, input.clientEnvelopeId);
    if (!envelope) {
      throw new Error("Inserted envelope could not be read back");
    }
    return { envelope, duplicate: false };
  }

  private initializeSchema(): void {
    const versionRow = this.database.prepare("PRAGMA user_version").get() as SqlRow;
    const version = asNumber(versionRow.user_version, "PRAGMA user_version");
    if (version !== 0 && version !== SCHEMA_VERSION) {
      throw new Error(`Unsupported dev messaging schema version ${version}`);
    }

    if (version === SCHEMA_VERSION) return;

    this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        client_conversation_id TEXT UNIQUE,
        project_ref TEXT NOT NULL,
        roster_version INTEGER NOT NULL CHECK (roster_version >= 0),
        epoch INTEGER NOT NULL CHECK (epoch >= 0),
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE memberships (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('customer', 'project-staff')),
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (conversation_id, participant_id)
      ) STRICT;
      CREATE TABLE invitations (
        token_hash TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('customer', 'project-staff')),
        created_by_participant_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      ) STRICT;
      CREATE INDEX invitations_conversation_idx ON invitations(conversation_id);
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('customer', 'project-staff')),
        csrf_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
      CREATE TABLE envelopes (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        client_envelope_id TEXT NOT NULL,
        sender_participant_id TEXT NOT NULL,
        sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'project-staff')),
        roster_version INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        encoding TEXT NOT NULL CHECK (encoding = 'base64url'),
        content_type TEXT NOT NULL CHECK (content_type = 'application/vnd.juicebox.messaging.simulated-envelope+json'),
        ciphertext TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (conversation_id, client_envelope_id)
      ) STRICT;
      CREATE INDEX envelopes_sync_idx ON envelopes(conversation_id, sequence);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private cleanupExpiredRooms(): void {
    const cutoff = this.now() - ROOM_TTL_MS;
    this.database.prepare("DELETE FROM conversations WHERE created_at <= ?").run(cutoff);
    this.database.prepare(
      `DELETE FROM sessions
        WHERE participant_id NOT IN (SELECT participant_id FROM memberships)`,
    ).run();
  }

  private assertFixedRoster(conversationId: string): void {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS member_count,
                COALESCE(SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END), 0) AS customer_count,
                COALESCE(SUM(CASE WHEN role = 'project-staff' THEN 1 ELSE 0 END), 0) AS staff_count
           FROM memberships
          WHERE conversation_id = ?`,
      )
      .get(conversationId) as SqlRow;
    if (
      asNumber(row.member_count, "roster.member_count") !== 2 ||
      asNumber(row.customer_count, "roster.customer_count") !== 1 ||
      asNumber(row.staff_count, "roster.staff_count") !== 1
    ) {
      throw new DevMessagingError(
        "roster_incomplete",
        409,
        "This lab room cannot accept envelopes until its customer and project staff have joined.",
      );
    }
  }

  private assertRoomQuota(conversationId: string, addedChars: number): void {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS envelope_count,
                COALESCE(SUM(length(ciphertext)), 0) AS ciphertext_chars
           FROM envelopes
          WHERE conversation_id = ?`,
      )
      .get(conversationId) as SqlRow;
    const envelopeCount = asNumber(row.envelope_count, "quota.envelope_count");
    const ciphertextChars = asNumber(row.ciphertext_chars, "quota.ciphertext_chars");
    if (
      envelopeCount >= MAX_ENVELOPES_PER_ROOM ||
      ciphertextChars + addedChars > MAX_ENCODED_CIPHERTEXT_CHARS_PER_ROOM
    ) {
      throw new DevMessagingError(
        "room_quota_exceeded",
        429,
        "This development room reached its bounded storage quota.",
      );
    }
  }

  private prepareInvitation(
    conversationId: string,
    role: MessagingRole,
    createdAt: number,
  ): InvitationResult & { tokenHash: string } {
    const invitationToken = randomToken();
    return {
      invitationToken,
      tokenHash: hashSecret(invitationToken),
      participantId: `${role === "customer" ? "customer" : "staff"}_${randomUUID()}`,
      role,
      expiresAt: createdAt + INVITATION_LIFETIME_MS,
    };
  }

  private insertInvitation(
    conversationId: string,
    invitation: InvitationResult & { tokenHash: string },
    createdByParticipantId: string | null,
    createdAt: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO invitations
          (token_hash, conversation_id, participant_id, role, created_by_participant_id,
           created_at, expires_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        invitation.tokenHash,
        conversationId,
        invitation.participantId,
        invitation.role,
        createdByParticipantId,
        createdAt,
        invitation.expiresAt,
      );
  }

  private toPublicInvitation(
    invitation: InvitationResult & { tokenHash: string },
  ): InvitationResult {
    return {
      invitationToken: invitation.invitationToken,
      participantId: invitation.participantId,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  private assertMembership(session: SessionActor, conversationId: string): void {
    const row = this.database
      .prepare(
        `SELECT 1 AS present
           FROM memberships
          WHERE conversation_id = ? AND participant_id = ? AND role = ?`,
      )
      .get(conversationId, session.participantId, session.role) as SqlRow | undefined;
    if (!row) {
      // Deliberately does not reveal whether the conversation exists.
      throw new DevMessagingError("conversation_not_found", 404, "Conversation not found.");
    }
  }

  private getConversationUnscoped(conversationId: string): ConversationDetail {
    const row = this.database
      .prepare(
        `SELECT id, project_ref, roster_version, epoch, created_at
           FROM conversations
          WHERE id = ?`,
      )
      .get(conversationId) as SqlRow | undefined;
    if (!row) {
      throw new DevMessagingError("conversation_not_found", 404, "Conversation not found.");
    }
    const rosterRows = this.database
      .prepare(
        `SELECT participant_id, role, joined_at
           FROM memberships
          WHERE conversation_id = ?
          ORDER BY joined_at ASC, participant_id ASC`,
      )
      .all(conversationId) as SqlRow[];
    return { ...mapConversation(row), roster: rosterRows.map(mapRosterMember) };
  }

  private findEnvelope(
    conversationId: string,
    clientEnvelopeId: string,
  ): StoredEnvelope | undefined {
    const row = this.database
      .prepare(
        `SELECT sequence, conversation_id, client_envelope_id, sender_participant_id,
                sender_role, roster_version, epoch, ciphertext, created_at
           FROM envelopes
          WHERE conversation_id = ? AND client_envelope_id = ?`,
      )
      .get(conversationId, clientEnvelopeId) as SqlRow | undefined;
    return row ? mapEnvelope(row) : undefined;
  }
}
