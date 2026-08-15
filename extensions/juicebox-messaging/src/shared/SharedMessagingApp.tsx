"use client";

import { MessagingExperience } from "@/components/MessagingDemo";
import type { ViewerRole } from "@/domain/model";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { SharedSupportClient, type SharedClientStatus } from "./SharedSupportClient";
import {
  SharedProtocolError,
  bootstrapSharedRoom,
  exchangeSharedInvitation,
  getSharedSession,
  logoutSharedSession,
  type SharedConversation,
  type SharedExchangeResult,
} from "./protocol";
import { normalizeReachableLanOrigin } from "./reachableOrigin";

type Screen = "loading" | "setup" | "join" | "connected";

const EMPTY_STATUS: SharedClientStatus = {
  connection: "syncing",
  peerJoined: false,
  rosterSize: 0,
};
const EMPTY_SUBSCRIBE = () => () => undefined;
const GET_EMPTY_STATUS = () => EMPTY_STATUS;

export function SharedMessagingApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [client, setClient] = useState<SharedSupportClient | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [invitationExpiresAt, setInvitationExpiresAt] = useState<number | null>(null);
  const [resumedWithoutInvite, setResumedWithoutInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializationStarted = useRef(false);
  const status = useSyncExternalStore(
    client?.subscribeStatus ?? EMPTY_SUBSCRIBE,
    client?.getStatus ?? GET_EMPTY_STATUS,
    client?.getStatus ?? GET_EMPTY_STATUS,
  );

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;
    void initialize();

    async function initialize() {
      await Promise.resolve();
      const parsed = readAndRemoveInviteFragment();
      if (parsed.kind === "valid") {
        setInviteToken(parsed.token);
        setScreen("join");
        return;
      }
      if (parsed.kind === "invalid") {
        setError("This invite link is not valid. Ask the other device to create a new test.");
        setScreen("join");
        return;
      }
      await resumeSession();
    }

    async function resumeSession() {
      try {
        const session = await getSharedSession();
        const conversation = latestConversation(session.conversations);
        if (!conversation) {
          setScreen("setup");
          return;
        }
        setClient(
          new SharedSupportClient({
            actor: session.actor,
            conversation,
            csrfToken: session.csrfToken,
          }),
        );
        setResumedWithoutInvite(true);
        setScreen("connected");
      } catch (caught) {
        if (
          caught instanceof SharedProtocolError &&
          (caught.status === 401 || caught.status === 404)
        ) {
          setScreen("setup");
          return;
        }
        setError(messageFrom(caught));
        setScreen("setup");
      }
    }
  }, []);

  useEffect(() => () => client?.dispose(), [client]);

  useEffect(() => {
    if (!status.peerJoined) return;
    const timer = setTimeout(() => {
      setInvitationUrl(null);
      setInvitationExpiresAt(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [status.peerJoined]);

  function attachClient(result: SharedExchangeResult) {
    client?.dispose();
    setClient(
      new SharedSupportClient({
        actor: result.actor,
        conversation: result.conversation,
        csrfToken: result.csrfToken,
      }),
    );
    setInviteToken(null);
    setResumedWithoutInvite(false);
    setScreen("connected");
  }

  async function leaveSharedTest() {
    const current = client;
    current?.dispose();
    setClient(null);
    setInvitationUrl(null);
    setInvitationExpiresAt(null);
    setResumedWithoutInvite(false);
    setScreen("setup");
    if (!current) return;
    try {
      await logoutSharedSession(current.csrfToken);
    } catch (caught) {
      setError(`The local view was closed, but logout could not be confirmed: ${messageFrom(caught)}`);
    }
  }

  if (screen === "loading") {
    return <SharedShell><SharedNotice title="Opening shared test…" busy /></SharedShell>;
  }

  if (screen === "setup") {
    return (
      <SharedSetupScreen
        error={error}
        onClearError={() => setError(null)}
        onCreated={({ exchange, inviteUrl, expiresAt }) => {
          setError(null);
          setInvitationUrl(inviteUrl);
          setInvitationExpiresAt(expiresAt);
          attachClient(exchange);
        }}
      />
    );
  }

  if (screen === "join") {
    return (
      <SharedJoinScreen
        error={error}
        invitationToken={inviteToken}
        onJoin={async () => {
          if (!inviteToken) return;
          setError(null);
          try {
            const exchange = await exchangeSharedInvitation(inviteToken);
            attachClient(exchange);
          } catch (caught) {
            setError(
              caught instanceof SharedProtocolError && caught.code === "invalid_invitation"
                ? "This one-time invite is invalid, expired, or already used. Ask the other device for a new link."
                : messageFrom(caught),
            );
          }
        }}
        onSetup={() => {
          setError(null);
          setInviteToken(null);
          setScreen("setup");
        }}
      />
    );
  }

  if (!client) {
    return <SharedShell><SharedNotice title="The shared test could not be opened." /></SharedShell>;
  }

  if (!status.peerJoined) {
    return (
      <SharedWaitingScreen
        connection={status.connection}
        error={status.lastError}
        expiresAt={invitationExpiresAt}
        invitationUrl={invitationUrl}
        onLeave={leaveSharedTest}
        resumedWithoutInvite={resumedWithoutInvite}
      />
    );
  }

  return (
    <MessagingExperience
      client={client}
      mode="shared"
      onLeaveShared={leaveSharedTest}
      sharedConnection={status.connection}
      viewer={client.viewerRole}
    />
  );
}

function SharedSetupScreen({
  error,
  onClearError,
  onCreated,
}: {
  error: string | null;
  onClearError: () => void;
  onCreated: (result: {
    exchange: SharedExchangeResult;
    inviteUrl: string;
    expiresAt: number;
  }) => void;
}) {
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [role, setRole] = useState<ViewerRole>("customer");
  const [reachableOrigin, setReachableOrigin] = useState("");
  const [showOriginField, setShowOriginField] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReachableOrigin(window.location.origin);
      setShowOriginField(
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1",
      );
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    onClearError();

    let origin: string;
    try {
      origin = normalizeReachableLanOrigin(
        reachableOrigin || window.location.origin,
        window.location.origin,
      );
    } catch (caught) {
      setLocalError(messageFrom(caught));
      return;
    }
    if (!bootstrapSecret) {
      setLocalError("Enter the bootstrap secret printed by npm run dev:shared.");
      return;
    }

    setSubmitting(true);
    try {
      const room = await bootstrapSharedRoom(bootstrapSecret);
      const localInvitation =
        role === "customer" ? room.invitations.customer : room.invitations.projectStaff;
      const otherInvitation =
        role === "customer" ? room.invitations.projectStaff : room.invitations.customer;
      const exchange = await exchangeSharedInvitation(localInvitation.invitationToken);
      setBootstrapSecret("");
      onCreated({
        exchange,
        inviteUrl: `${origin}/shared#invite=${otherInvitation.invitationToken}`,
        expiresAt: otherInvitation.expiresAt,
      });
    } catch (caught) {
      setLocalError(messageFrom(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SharedShell>
      <form className="shared-card shared-setup-card" onSubmit={create}>
        <div className="shared-card-heading">
          <p className="eyebrow">Two-device development mode</p>
          <h1>Start a shared LAN test</h1>
          <p>Choose this browser’s fixed role. The invite will receive the opposite role.</p>
        </div>

        <div className="shared-warning" role="note">
          <strong>HTTP LAN test · not end-to-end encrypted</strong>
          <p>The service stores simulated base64 payloads. Use fictional messages and addresses only.</p>
        </div>

        {(error || localError) ? <p className="shared-error" role="alert">{localError ?? error}</p> : null}

        <fieldset className="shared-role-options">
          <legend>This browser acts as</legend>
          <label className={role === "customer" ? "selected" : ""}>
            <input
              checked={role === "customer"}
              name="shared-role"
              onChange={() => setRole("customer")}
              type="radio"
            />
            <span><strong>Customer</strong><small>Share a fictional address and receive updates.</small></span>
          </label>
          <label className={role === "project" ? "selected" : ""}>
            <input
              checked={role === "project"}
              name="shared-role"
              onChange={() => setRole("project")}
              type="radio"
            />
            <span><strong>Project team</strong><small>Request, confirm, and fulfill the fictional order.</small></span>
          </label>
        </fieldset>

        <label className="shared-field">
          <span>Development bootstrap secret</span>
          <input
            autoComplete="off"
            onChange={(event) => setBootstrapSecret(event.target.value)}
            placeholder="Printed by npm run dev:shared"
            spellCheck={false}
            type="password"
            value={bootstrapSecret}
          />
          <small>Held only in this form’s memory and cleared after room creation.</small>
        </label>

        {showOriginField ? (
          <label className="shared-field">
            <span>Origin your phone can reach</span>
            <input
              inputMode="url"
              onChange={(event) => {
                setReachableOrigin(event.target.value);
                setLocalError(null);
              }}
              placeholder="http://192.168.1.23:3004"
              spellCheck={false}
              value={reachableOrigin}
            />
            <small>Paste the LAN URL printed by the launcher; a trailing /shared is accepted. Do not use localhost.</small>
          </label>
        ) : null}

        <button className="button primary full-button" disabled={submitting} type="submit">
          {submitting ? "Creating shared test…" : "Create shared test"}
        </button>
        <Link className="shared-back-link" href="/">Return to single-device demo</Link>
      </form>
    </SharedShell>
  );
}

function SharedJoinScreen({
  error,
  invitationToken,
  onJoin,
  onSetup,
}: {
  error: string | null;
  invitationToken: string | null;
  onJoin: () => Promise<void>;
  onSetup: () => void;
}) {
  const [joining, setJoining] = useState(false);
  return (
    <SharedShell>
      <section className="shared-card shared-join-card">
        <div className="shared-card-heading">
          <p className="eyebrow">One-time development invite</p>
          <h1>Join the shared test</h1>
          <p>Your role is fixed by the invitation. The link is not consumed until you choose Join.</p>
        </div>
        <div className="shared-warning" role="note">
          <strong>Not end-to-end encrypted</strong>
          <p>This HTTP LAN test may expose traffic to the local network. Enter fictional data only.</p>
        </div>
        {error ? <p className="shared-error" role="alert">{error}</p> : null}
        {invitationToken ? (
          <button
            className="button primary full-button"
            disabled={joining}
            onClick={async () => {
              setJoining(true);
              try {
                await onJoin();
              } finally {
                setJoining(false);
              }
            }}
            type="button"
          >
            {joining ? "Joining…" : "Join shared test"}
          </button>
        ) : null}
        <button className="shared-back-link shared-link-button" onClick={onSetup} type="button">Open shared-test setup</button>
      </section>
    </SharedShell>
  );
}

function SharedWaitingScreen({
  connection,
  error,
  expiresAt,
  invitationUrl,
  onLeave,
  resumedWithoutInvite,
}: {
  connection: SharedClientStatus["connection"];
  error?: string;
  expiresAt: number | null;
  invitationUrl: string | null;
  onLeave: () => Promise<void>;
  resumedWithoutInvite: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [leaving, setLeaving] = useState(false);
  return (
    <SharedShell>
      <section className="shared-card shared-waiting-card">
        <div className="shared-connection-row">
          <span className={`shared-connection-dot ${connection}`} />
          <strong>{connectionLabel(connection)}</strong>
        </div>
        <div className="shared-card-heading">
          <p className="eyebrow">One role connected</p>
          <h1>Connect the second device</h1>
          <p>Open the one-time link on your phone. It receives the opposite fixed role.</p>
        </div>

        <div className="shared-warning" role="note">
          <strong>HTTP LAN development test · not E2EE</strong>
          <p>Keep both devices on the same network and use fictional information only.</p>
        </div>

        {error ? <p className="shared-error" role="alert">{error}</p> : null}

        {invitationUrl ? (
          <div className="shared-invite-box">
            <label htmlFor="shared-invite-url">One-time phone invite</label>
            <InviteQrCode invitationUrl={invitationUrl} />
            <output id="shared-invite-url">{invitationUrl}</output>
            <button
              className="button primary full-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invitationUrl);
                  setCopyState("copied");
                } catch {
                  setCopyState("failed");
                }
              }}
              type="button"
            >
              {copyState === "copied" ? "Invite copied" : copyState === "failed" ? "Copy failed" : "Copy phone invite"}
            </button>
            <small>
              Anyone with this link can claim the other test role before it expires
              {expiresAt ? ` at ${formatTime(expiresAt)}` : ""}. Do not post or forward it.
            </small>
          </div>
        ) : resumedWithoutInvite ? (
          <p className="shared-empty-note">
            This session resumed, but its one-time invite was intentionally kept only in memory. Leave and create a new shared test to connect another device.
          </p>
        ) : null}

        <button
          className="button secondary full-button"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            await onLeave();
          }}
          type="button"
        >
          {leaving ? "Leaving…" : "Leave this shared test"}
        </button>
      </section>
    </SharedShell>
  );
}

function InviteQrCode({ invitationUrl }: { invitationUrl: string }) {
  const [result, setResult] = useState<
    | { invitationUrl: string; dataUrl: string; failed: false }
    | { invitationUrl: string; dataUrl: null; failed: true }
    | null
  >(null);

  useEffect(() => {
    let active = true;

    void QRCode.toDataURL(invitationUrl, {
      color: {
        dark: "#171717ff",
        light: "#ffffffff",
      },
      errorCorrectionLevel: "M",
      margin: 3,
      width: 240,
    })
      .then((nextDataUrl) => {
        if (active) {
          setResult({ dataUrl: nextDataUrl, failed: false, invitationUrl });
        }
      })
      .catch(() => {
        if (active) {
          setResult({ dataUrl: null, failed: true, invitationUrl });
        }
      });

    return () => {
      active = false;
    };
  }, [invitationUrl]);

  const currentResult = result?.invitationUrl === invitationUrl ? result : null;

  if (currentResult?.failed) {
    return (
      <p className="shared-invite-qr-error" role="status">
        QR unavailable. Copy the one-time link instead.
      </p>
    );
  }

  return (
    <div className="shared-invite-qr">
      {currentResult?.dataUrl ? (
        <Image
          alt="QR code for the one-time phone invite"
          height={240}
          src={currentResult.dataUrl}
          unoptimized
          width={240}
        />
      ) : (
        <div
          aria-label="Generating invitation QR code"
          className="shared-invite-qr-loading"
          role="status"
        >
          <span className="spinner" />
        </div>
      )}
      <p>Scan with your phone camera</p>
    </div>
  );
}

function SharedShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shared-shell">
      <header className="shared-topbar">
        <Link className="brand" href="/" aria-label="Juicebox Messaging single-device demo">
          <span className="brand-mark">J</span>
          <span><strong>Juicebox Messaging</strong><small>Shared-device development test</small></span>
        </Link>
      </header>
      <div className="shared-shell-body">{children}</div>
    </main>
  );
}

function SharedNotice({ title, busy = false }: { title: string; busy?: boolean }) {
  return (
    <section className="shared-card shared-notice">
      {busy ? <span className="spinner" /> : null}
      <h1>{title}</h1>
      <Link className="shared-back-link" href="/">Return to single-device demo</Link>
    </section>
  );
}

function readAndRemoveInviteFragment():
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "valid"; token: string } {
  const fragment = window.location.hash;
  if (!fragment) return { kind: "none" };
  const parameters = new URLSearchParams(fragment.slice(1));
  const token = parameters.get("invite");
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  if (
    parameters.size !== 1 ||
    parameters.getAll("invite").length !== 1 ||
    !token ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    return { kind: "invalid" };
  }
  return { kind: "valid", token };
}

function latestConversation(
  conversations: SharedConversation[],
): SharedConversation | undefined {
  return [...conversations].sort((left, right) => right.createdAt - left.createdAt)[0];
}

function connectionLabel(connection: SharedClientStatus["connection"]): string {
  switch (connection) {
    case "syncing":
      return "Syncing with development service…";
    case "live":
      return "Development service live";
    case "reconnecting":
      return "Reconnecting to development service…";
    case "offline":
      return "Development service offline";
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
