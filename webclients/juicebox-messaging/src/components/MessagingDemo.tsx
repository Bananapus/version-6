"use client";

import {
  addressToMultiline,
  authorizedSupportEvents,
  deriveFulfillment,
  eventViewerRole,
  genericEventPreview,
  maskedAddressLabel,
  stageLabel,
} from "@/domain/fulfillment";
import type {
  AuthenticatedSupportEvent,
  FulfillmentView,
  Participant,
  SupportClient,
  SupportSnapshot,
  ViewerRole,
} from "@/domain/model";
import { DemoSupportClient } from "@/demo/DemoSupportClient";
import {
  THEME_PRESET_IDS,
  type ThemePresetId,
} from "@/theme/theme";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";
import { ShippingDialog } from "./ShippingDialog";

type PendingAction =
  | "send"
  | "reset"
  | "request-address"
  | "share-address"
  | "acknowledge"
  | "preparing"
  | "shipped";

type MobilePane = "inbox" | "conversation";

export function MessagingDemo() {
  const client = useMemo(() => new DemoSupportClient(), []);
  const [viewer, setViewer] = useState<ViewerRole>("customer");
  const [themePreset, setThemePreset] = useState<ThemePresetId>("juicebox");

  return (
    <MessagingExperience
      client={client}
      onThemePresetChange={setThemePreset}
      onViewerChange={(role) => {
        client.setViewerRole(role);
        setViewer(role);
      }}
      viewer={viewer}
      themePreset={themePreset}
    />
  );
}

export interface MessagingExperienceProps {
  client: SupportClient;
  mode?: "demo" | "shared";
  onLeaveShared?: () => Promise<void>;
  onThemePresetChange?: (preset: ThemePresetId) => void;
  onViewerChange?: (role: ViewerRole) => void;
  sharedConnection?: "syncing" | "live" | "reconnecting" | "offline";
  themePreset?: ThemePresetId;
  viewer: ViewerRole;
}

export function MessagingExperience({
  client,
  mode = "demo",
  onLeaveShared,
  onThemePresetChange,
  onViewerChange,
  sharedConnection = "syncing",
  themePreset = "juicebox",
  viewer,
}: MessagingExperienceProps) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const fulfillment = useMemo(() => deriveFulfillment(snapshot.events), [snapshot.events]);
  const visibleEvents = useMemo(() => authorizedSupportEvents(snapshot.events), [snapshot.events]);
  const [drafts, setDrafts] = useState<Record<ViewerRole, string>>({
    customer: "",
    project: "",
  });
  const [shippingOpen, setShippingOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>(
    mode === "shared" ? "conversation" : "inbox",
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const draft = drafts[viewer];

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [viewer]: value }));
  }

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !stickToBottomRef.current) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
  }, [mobilePane, visibleEvents.length]);

  useEffect(() => {
    const wideLayout = window.matchMedia("(min-width: 1041px)");
    const closeCompactDetails = () => {
      if (wideLayout.matches) setContextOpen(false);
    };

    closeCompactDetails();
    wideLayout.addEventListener("change", closeCompactDetails);
    return () => wideLayout.removeEventListener("change", closeCompactDetails);
  }, []);

  async function run(action: PendingAction, operation: () => Promise<void>) {
    setError(null);
    setPending(action);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    const sent = await run("send", () => client.sendText(body));
    if (sent) setDraft("");
  }

  const latestEvent = visibleEvents.at(-1);

  return (
    <main className={`app-shell mode-${mode}`} data-theme-preset={themePreset}>
      <header className="site-header">
        <a
          className="brand"
          href="#messages-inbox"
          aria-label="Open messages inbox"
          onClick={() => {
            setContextOpen(false);
            setMobilePane("inbox");
          }}
        >
          <span className="brand-mark"><Icon name="message" size={20} /></span>
          <span>
            <h1>Juicebox Messaging</h1>
            <small>{mode === "shared" ? "Shared-device development test" : "Private project inbox"}</small>
          </span>
        </a>

        {mode === "shared" ? (
          <div className="shared-role-lock" aria-label={`Fixed shared-test role: ${viewer === "customer" ? "Customer" : "Project team"}`}>
            <span className={`shared-connection-dot ${sharedConnection}`} />
            <span>Testing as <strong>{viewer === "customer" ? "Customer" : "Project team"}</strong></span>
          </div>
        ) : (
          <div className="demo-controls" aria-label="Prototype viewer">
            <span className="demo-label">Preview as</span>
            <div className="role-switch" role="group" aria-label="Switch demo role">
              <button
                aria-pressed={viewer === "customer"}
                className={viewer === "customer" ? "active" : ""}
                disabled={Boolean(pending)}
                onClick={() => onViewerChange?.("customer")}
                type="button"
              >
                Customer
              </button>
              <button
                aria-pressed={viewer === "project"}
                className={viewer === "project" ? "active" : ""}
                disabled={Boolean(pending)}
                onClick={() => onViewerChange?.("project")}
                type="button"
              >
                Project team
              </button>
            </div>
          </div>
        )}

        <div className="account-pill" aria-label={mode === "shared" ? "Fixed shared-test identity" : "Demo identity"}>
          <span className="avatar account-avatar">{viewer === "customer" ? "S" : "M"}</span>
          <span>{viewer === "customer" ? "sunlit-wallet" : "Mira"}</span>
        </div>
      </header>

      <div className={`prototype-banner ${mode === "shared" ? "shared-prototype-banner" : ""}`} role="status">
        <Icon name="info" size={18} />
        {mode === "shared" ? (
          <p><strong>HTTP LAN development test.</strong> Payloads are simulated, not end-to-end encrypted, and stored by the development service. Use fictional data only.</p>
        ) : (
          <p><strong>Prototype mode.</strong> Wallet and purchase proofs, delivery, and encryption are simulated. Shipping details stay in memory and reset on reload.</p>
        )}
        <div className="banner-actions">
          {mode === "demo" ? (
            <>
              <Link className="banner-shared-link" href="/projects">Resolve a project</Link>
              <Link className="banner-shared-link" href="/shared">Test across devices</Link>
            </>
          ) : null}
          <button
            className="banner-reset"
            disabled={pending === "reset"}
            onClick={() =>
              run("reset", mode === "shared" && onLeaveShared ? onLeaveShared : () => client.reset())
            }
            type="button"
          >
            <Icon name="refresh" size={15} /> {pending === "reset" ? (mode === "shared" ? "Leaving…" : "Resetting…") : (mode === "shared" ? "Leave test" : "Reset demo")}
          </button>
        </div>
      </div>

      <section className={`messaging-layout mobile-${mobilePane}`}>
        <InboxSidebar
          fulfillment={fulfillment}
          latestEvent={latestEvent}
          mode={mode}
          onThemePresetChange={onThemePresetChange}
          onOpenThread={() => {
            stickToBottomRef.current = true;
            setMobilePane("conversation");
          }}
          snapshot={snapshot}
          themePreset={themePreset}
          viewer={viewer}
        />

        <section className="conversation" id="main-conversation">
          <ConversationHeader
            contextOpen={contextOpen}
            mode={mode}
            onBack={() => {
              setContextOpen(false);
              setMobilePane("inbox");
            }}
            onOpenContext={() => setContextOpen(true)}
            sharedConnection={sharedConnection}
            snapshot={snapshot}
          />

          <div
            aria-label="Conversation messages"
            className="timeline"
            ref={timelineRef}
            aria-live="polite"
            role="log"
            tabIndex={0}
            onScroll={(event) => {
              const timeline = event.currentTarget;
              stickToBottomRef.current =
                timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;
            }}
          >
            <div className="conversation-intro">
              <span className="project-avatar large-project-avatar">{snapshot.project.initial}</span>
              <h2>{snapshot.project.name}</h2>
              <p>{mode === "shared" ? "Shared development test" : "Private purchase support"} for {snapshot.purchase.orderLabel}</p>
              <div className="intro-chips">
                {mode === "shared" ? (
                  <>
                    <span className="chip success"><Icon name="info" size={13} /> Fictional purchase context</span>
                    <span className="chip privacy security-status"><Icon name="info" size={13} /> Simulated payloads · not E2EE</span>
                  </>
                ) : (
                  <>
                    <span className="chip success"><Icon name="check" size={13} /> Verified purchase · demo evidence</span>
                    <span className="chip privacy security-status"><Icon name="shield" size={13} /> Secure-channel design</span>
                  </>
                )}
              </div>
            </div>

            <div className="date-divider"><span>Today</span></div>

            {visibleEvents.map((entry) => (
              <TimelineEvent
                entry={entry}
                key={entry.event.id}
                mode={mode}
                project={snapshot.project.name}
                viewer={viewer}
              />
            ))}

            {pending && pending !== "send" && pending !== "reset" ? (
              <div className="timeline-working"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>
            ) : null}
          </div>

          {error ? (
            <div className="inline-error" role="alert">
              <Icon name="info" />
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error" type="button"><Icon name="x" size={15} /></button>
            </div>
          ) : null}

          <form className="composer" onSubmit={sendMessage}>
            <div className="composer-box">
              <textarea
                aria-label="Message"
                disabled={pending === "send"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={viewer === "customer" ? "Message the project team…" : "Reply to sunlit-wallet…"}
                rows={1}
                value={draft}
              />
              <div className="composer-actions">
                {viewer === "customer" ? (
                  <button className="composer-tool" onClick={() => setShippingOpen(true)} type="button">
                    <Icon name="map" size={17} />
                    {fulfillment.addressEvent ? "Update address" : "Share shipping address"}
                  </button>
                ) : (
                  <span className="composer-hint"><Icon name={mode === "shared" ? "message" : "lock"} size={14} /> Project reply</span>
                )}
                <button className="send-button" disabled={!draft.trim() || Boolean(pending)} type="submit" aria-label="Send message">
                  {pending === "send" ? <span className="spinner" /> : <Icon name="send" size={18} />}
                </button>
              </div>
            </div>
            <p className="composer-caption">
              <Icon name={mode === "shared" ? "info" : "lock"} size={12} />
              {mode === "shared"
                ? "HTTP LAN test messages are not encrypted end to end. Use fictional data only."
                : "Production messages will encrypt on this device. This demo does not yet implement cryptography."}
            </p>
          </form>
        </section>

        <ContextPanel
          client={client}
          fulfillment={fulfillment}
          mode={mode}
          onClose={() => setContextOpen(false)}
          onOpenShipping={() => setShippingOpen(true)}
          pending={pending}
          run={run}
          snapshot={snapshot}
          variant="desktop"
          viewer={viewer}
        />

        {contextOpen ? (
          <DetailsDialog onClose={() => setContextOpen(false)}>
            <ContextPanel
              client={client}
              fulfillment={fulfillment}
              mode={mode}
              onClose={() => setContextOpen(false)}
              onOpenShipping={() => {
                setContextOpen(false);
                setShippingOpen(true);
              }}
              pending={pending}
              run={run}
              snapshot={snapshot}
              variant="mobile"
              viewer={viewer}
            />
          </DetailsDialog>
        ) : null}
      </section>

      {shippingOpen ? (
        <ShippingDialog
          currentAddress={
            fulfillment.stage === "shipped"
              ? fulfillment.addressCorrectionEvent?.address ?? fulfillment.addressEvent?.address
              : fulfillment.addressEvent?.address
          }
          currentVersion={
            fulfillment.stage === "shipped"
              ? fulfillment.addressCorrectionEvent?.correctionVersion
              : fulfillment.addressEvent?.version
          }
          fulfillmentStage={fulfillment.stage}
          mode={mode}
          onClose={() => setShippingOpen(false)}
          onSubmit={(address, approvedRoster) =>
            run("share-address", () => client.shareAddress(address, approvedRoster))
          }
          open
          recipients={snapshot.staff}
          roster={snapshot.roster}
        />
      ) : null}
    </main>
  );
}

function InboxSidebar({
  fulfillment,
  latestEvent,
  mode,
  onOpenThread,
  onThemePresetChange,
  snapshot,
  themePreset,
  viewer,
}: {
  fulfillment: FulfillmentView;
  latestEvent?: AuthenticatedSupportEvent;
  mode: "demo" | "shared";
  onOpenThread: () => void;
  onThemePresetChange?: (preset: ThemePresetId) => void;
  snapshot: SupportSnapshot;
  themePreset: ThemePresetId;
  viewer: ViewerRole;
}) {
  return (
    <aside className="inbox-sidebar" id="messages-inbox">
      <div className="inbox-heading">
        <div>
          <p className="eyebrow">{viewer === "customer" ? "Your inbox" : snapshot.project.name}</p>
          <h2>{viewer === "customer" ? "Messages" : "Project inbox"}</h2>
        </div>
        {onThemePresetChange ? (
          <label className="theme-preview-control">
            <span>Theme</span>
            <select
              aria-label="Preview theme"
              onChange={(event) => onThemePresetChange(event.currentTarget.value as ThemePresetId)}
              value={themePreset}
            >
              {THEME_PRESET_IDS.map((preset) => (
                <option key={preset} value={preset}>{themePresetLabel(preset)}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="thread-list">
        <button
          aria-current="page"
          className="thread-card active"
          onClick={onOpenThread}
          type="button"
        >
          <span className="project-avatar">{viewer === "customer" ? snapshot.project.initial : snapshot.customer.initial}</span>
          <span className="thread-copy">
            <span className="thread-title-row">
              <strong>{viewer === "customer" ? snapshot.project.name : snapshot.customer.name}</strong>
              <time>now</time>
            </span>
            <span className="thread-subtitle">{snapshot.purchase.itemName}</span>
            <span className="thread-preview">{latestEvent ? genericEventPreview(latestEvent.event) : "Purchase support"}</span>
            <span className={`thread-state stage-${fulfillment.stage}`}><span />{stageLabel(fulfillment.stage)}</span>
          </span>
        </button>
      </div>

      <div className="sidebar-footnote">
        <Icon name={mode === "shared" ? "info" : "shield"} size={16} />
        <p>{mode === "shared" ? "This browser polls the HTTP development service for simulated envelopes." : "One inbox, ready to be opened from Juicebox or Revnet without sharing message content with the host app."}</p>
      </div>
    </aside>
  );
}

function themePresetLabel(preset: ThemePresetId): string {
  if (preset === "juicebox") return "Juicebox";
  if (preset === "revnet") return "Revnet";
  return "Neutral";
}

function ConversationHeader({
  contextOpen,
  mode,
  onBack,
  onOpenContext,
  sharedConnection,
  snapshot,
}: {
  contextOpen: boolean;
  mode: "demo" | "shared";
  onBack: () => void;
  onOpenContext: () => void;
  sharedConnection: NonNullable<MessagingExperienceProps["sharedConnection"]>;
  snapshot: SupportSnapshot;
}) {
  return (
    <header className="conversation-header">
      <button className="icon-button mobile-back-button" onClick={onBack} aria-label="Back to messages" type="button">
        <Icon name="arrow" />
      </button>
      <span className="project-avatar compact-project-avatar">{snapshot.project.initial}</span>
      <div>
        <strong>{snapshot.project.name}</strong>
        <span>
          <span className={mode === "shared" ? `shared-connection-dot ${sharedConnection}` : "presence-dot"} />
          {mode === "shared" ? sharedConnectionLabel(sharedConnection) : `${snapshot.staff.length} named project staff`}
        </span>
      </div>
      <span className="header-security">
        <Icon name={mode === "shared" ? "info" : "lock"} size={15} /> {mode === "shared" ? "HTTP LAN test" : "Private support"}
      </span>
      <button
        aria-controls="compact-order-details"
        aria-expanded={contextOpen}
        className="icon-button context-button"
        onClick={onOpenContext}
        aria-label="Open purchase details"
        type="button"
      >
        <Icon name="info" />
      </button>
    </header>
  );
}

function TimelineEvent({
  entry,
  mode,
  project,
  viewer,
}: {
  entry: AuthenticatedSupportEvent;
  mode: "demo" | "shared";
  project: string;
  viewer: ViewerRole;
}) {
  const event = entry.event;
  const eventRole = eventViewerRole(entry);
  const own = eventRole === viewer;
  const label = eventRole === "project" ? project : "Customer";

  if (event.kind === "text.v1") {
    return (
      <article className={`message-row ${own ? "own" : ""}`}>
        {!own ? <span className={`avatar message-avatar ${eventRole === "project" ? "project-message-avatar" : ""}`}>{eventRole === "project" ? "B" : "S"}</span> : null}
        <div className="message-stack">
          <span className="message-sender">{own ? "You" : label}</span>
          <div className="message-bubble">{event.body}</div>
          <time>{formatEventTime(event.createdAt)} {own ? <Icon name="check" size={12} /> : null}</time>
        </div>
      </article>
    );
  }

  if (event.kind === "address_request.v1") {
    return (
      <article className="structured-event request-event">
        <span className="structured-icon"><Icon name="map" /></span>
        <div>
          <strong>Shipping address requested</strong>
          <p>{event.reason}</p>
          <small>{formatEventTime(event.createdAt)} · Address details stay out of previews</small>
        </div>
      </article>
    );
  }

  if (event.kind === "shipping_address.v1") {
    return (
      <article className="structured-event address-event">
        <span className="structured-icon"><Icon name={mode === "shared" ? "info" : "lock"} /></span>
        <div>
          <p className="eyebrow">{mode === "shared" ? "Test fulfillment card" : "Private fulfillment card"} · v{event.version}</p>
          <strong>{event.version === 1 ? "Shipping address shared" : "Shipping address updated"}</strong>
          <p>Full details are masked until deliberately opened in order details.</p>
          <small>{formatEventTime(event.createdAt)} · {mode === "shared" ? "Sent to the current test roster" : "Shared with named project staff"}</small>
        </div>
      </article>
    );
  }

  if (event.kind === "shipping_address_correction.v1") {
    return (
      <article className="structured-event address-event correction-event">
        <span className="structured-icon"><Icon name="info" /></span>
        <div>
          <p className="eyebrow">Post-shipment correction · v{event.correctionVersion}</p>
          <strong>Delivery address correction shared</strong>
          <p>The shipped order remains bound to address v{event.shippedAddressVersion}; this note cannot reroute it.</p>
          <small>{formatEventTime(event.createdAt)} · Details remain hidden in previews</small>
        </div>
      </article>
    );
  }

  if (event.kind === "address_ack.v1") {
    return <CompactSystemEvent icon="check" text={`Project confirmed shipping address v${event.addressVersion}`} time={event.createdAt} />;
  }

  if (event.kind === "fulfillment_status.v1") {
    return (
      <CompactSystemEvent
        icon={event.status === "shipped" ? "truck" : "package"}
        text={event.status === "shipped" ? "Order marked shipped" : "The project is preparing this order"}
        time={event.createdAt}
      />
    );
  }

  return (
    <article className="structured-event tracking-event">
      <span className="structured-icon"><Icon name="truck" /></span>
      <div>
        <p className="eyebrow">Tracking shared</p>
        <strong>{event.carrier}</strong>
        <p className="tracking-code">{event.trackingCode}</p>
        <small>{formatEventTime(event.createdAt)} · Bound to address v{event.addressVersion}</small>
      </div>
    </article>
  );
}

function CompactSystemEvent({ icon, text, time }: { icon: "check" | "package" | "truck"; text: string; time: string }) {
  return (
    <div className="compact-system-event">
      <span><Icon name={icon} size={14} /></span>
      <p>{text}<small>{formatEventTime(time)}</small></p>
    </div>
  );
}

interface ContextPanelProps {
  client: SupportClient;
  fulfillment: FulfillmentView;
  mode: "demo" | "shared";
  onClose: () => void;
  onOpenShipping: () => void;
  pending: PendingAction | null;
  run: (action: PendingAction, operation: () => Promise<void>) => Promise<boolean>;
  snapshot: SupportSnapshot;
  variant: "desktop" | "mobile";
  viewer: ViewerRole;
}

function ContextPanel({
  client,
  fulfillment,
  mode,
  onClose,
  onOpenShipping,
  pending,
  run,
  snapshot,
  variant,
  viewer,
}: ContextPanelProps) {
  return (
    <aside className={`context-panel ${variant}-context-panel`} aria-label="Purchase and fulfillment details">
      {variant === "mobile" ? (
        <div className="context-mobile-header">
          <strong>Order details</strong>
          <button className="icon-button" onClick={onClose} aria-label="Close order details" type="button"><Icon name="x" /></button>
        </div>
      ) : null}

      <PurchaseCard mode={mode} snapshot={snapshot} />
      <FulfillmentCard
        client={client}
        fulfillment={fulfillment}
        key={`${viewer}:${fulfillment.addressEvent?.version ?? "none"}:${fulfillment.addressCorrectionEvent?.correctionVersion ?? "none"}`}
        mode={mode}
        onOpenShipping={onOpenShipping}
        pending={pending}
        run={run}
        viewer={viewer}
      />
      <ParticipantsCard customer={snapshot.customer} mode={mode} staff={snapshot.staff} viewer={viewer} />
      <PrivacyCard mode={mode} />
    </aside>
  );
}

function DetailsDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-label="Order details"
      aria-modal="true"
      className="details-dialog"
      id="compact-order-details"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      onKeyDown={trapDialogFocus}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}

function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function PurchaseCard({ mode, snapshot }: { mode: "demo" | "shared"; snapshot: SupportSnapshot }) {
  return (
    <section className="context-card purchase-card">
      <div className="card-heading">
        <span className="card-icon product-thumb"><Icon name="package" /></span>
        <div><p className="eyebrow">{mode === "shared" ? "Fictional purchase" : "Verified purchase · demo"}</p><h2>{snapshot.purchase.orderLabel}</h2></div>
        {mode === "demo" ? <span className="verified-badge"><Icon name="check" size={12} /></span> : null}
      </div>
      <div className="purchase-item">
        <span className="item-art"><span>B</span></span>
        <div><strong>{snapshot.purchase.itemName}</strong><p>{snapshot.purchase.itemDetail}</p></div>
        <strong>{snapshot.purchase.amount}</strong>
      </div>
      <p className="support-window">Support open until {snapshot.purchase.supportUntil}</p>
      <details className="purchase-proof">
        <summary>Purchase proof</summary>
        <dl className="purchase-meta">
          <div><dt>Purchased</dt><dd>{snapshot.purchase.purchasedAt}</dd></div>
          <div><dt>Network</dt><dd>{snapshot.project.chainLabel}</dd></div>
          <div><dt>Transaction</dt><dd>{snapshot.purchase.txLabel}</dd></div>
        </dl>
      </details>
    </section>
  );
}

function FulfillmentCard({
  client,
  fulfillment,
  mode,
  onOpenShipping,
  pending,
  run,
  viewer,
}: {
  client: SupportClient;
  fulfillment: FulfillmentView;
  mode: "demo" | "shared";
  onOpenShipping: () => void;
  pending: PendingAction | null;
  run: ContextPanelProps["run"];
  viewer: ViewerRole;
}) {
  const [revealedVersion, setRevealedVersion] = useState<number | null>(null);
  const [revealedCorrectionVersion, setRevealedCorrectionVersion] = useState<number | null>(null);
  const [clipboardState, setClipboardState] = useState<"idle" | "copied" | "failed">("idle");
  const [carrier, setCarrier] = useState("Correios");
  const [trackingCode, setTrackingCode] = useState("");
  const addressEvent = fulfillment.addressEvent;
  const correctionEvent = fulfillment.addressCorrectionEvent;
  const revealed = Boolean(addressEvent && revealedVersion === addressEvent.version);
  const correctionRevealed = Boolean(
    correctionEvent && revealedCorrectionVersion === correctionEvent.correctionVersion,
  );

  async function copyAddress() {
    if (!addressEvent) return;
    try {
      await navigator.clipboard.writeText(addressToMultiline(addressEvent.address));
      setClipboardState("copied");
    } catch {
      setClipboardState("failed");
    }
  }

  return (
    <section className="context-card fulfillment-card">
      <div className="card-title-row">
        <h2>Fulfillment</h2>
        <span className={`stage-pill stage-${fulfillment.stage}`}><span />{stageLabel(fulfillment.stage)}</span>
      </div>

      {addressEvent ? (
        <div className="fulfillment-steps" aria-label="Fulfillment progress">
          <ProgressStep done label="Address" />
          <i />
          <ProgressStep done={fulfillment.acknowledged || fulfillment.stage === "preparing" || fulfillment.stage === "shipped"} label="Confirmed" />
          <i />
          <ProgressStep done={fulfillment.stage === "preparing" || fulfillment.stage === "shipped"} label="Preparing" />
          <i />
          <ProgressStep done={fulfillment.stage === "shipped"} label="Shipped" />
        </div>
      ) : null}

      {!addressEvent ? (
        <div className="empty-fulfillment">
          <span><Icon name="map" /></span>
          <strong>No shipping address yet</strong>
          <p>{viewer === "customer" ? (mode === "shared" ? "Send a structured fictional test card when you are ready." : "Share it as a structured private card when you are ready.") : "Ask the customer to share it inside this thread."}</p>
          {viewer === "customer" ? (
            <button className="button primary full-button" onClick={onOpenShipping} type="button"><Icon name="map" /> Share shipping address</button>
          ) : (
            <button
              className="button secondary full-button"
              disabled={pending === "request-address"}
              onClick={() => run("request-address", () => client.requestAddress())}
              type="button"
            >
              <Icon name="send" /> {pending === "request-address" ? "Requesting…" : "Request address"}
            </button>
          )}
        </div>
      ) : (
        <div className="address-summary">
          <div className="address-summary-heading">
            <span className="structured-icon"><Icon name="map" /></span>
            <div><p className="eyebrow">Shipping address · v{addressEvent.version}</p><strong>{revealed ? addressEvent.address.recipientName : maskedAddressLabel()}</strong></div>
          </div>

          {revealed ? <pre className="revealed-address">{addressToMultiline(addressEvent.address)}</pre> : <p className="masked-copy">Hidden by default to reduce accidental exposure.</p>}

          <div className="address-actions">
            <button className="button subtle" onClick={() => setRevealedVersion(revealed ? null : addressEvent.version)} type="button">
              <Icon name="eye" /> {revealed ? "Hide" : "Reveal"}
            </button>
            {revealed ? (
              <button className="button subtle" onClick={copyAddress} type="button">
                <Icon name="copy" /> {clipboardState === "copied" ? "Copied" : clipboardState === "failed" ? "Copy failed" : "Copy"}
              </button>
            ) : null}
            {viewer === "customer" ? <button className="button link-button" onClick={onOpenShipping} type="button">{fulfillment.stage === "shipped" ? "Share correction" : "Update"}</button> : null}
          </div>

          {clipboardState === "copied" ? <p className="clipboard-warning">Copied to this device’s clipboard. Other apps may be able to read it.</p> : null}

          {viewer === "project" ? (
            <div className="owner-actions">
              {!fulfillment.acknowledged ? (
                <button
                  className="button primary full-button"
                  disabled={pending === "acknowledge"}
                  onClick={() => run("acknowledge", () => client.acknowledgeAddress())}
                  type="button"
                >
                  <Icon name="check" /> {pending === "acknowledge" ? "Confirming…" : `Confirm address v${addressEvent.version}`}
                </button>
              ) : null}

              {fulfillment.acknowledged && fulfillment.stage === "ready-to-fulfill" ? (
                <button
                  className="button primary full-button"
                  disabled={pending === "preparing"}
                  onClick={() => run("preparing", () => client.markPreparing())}
                  type="button"
                >
                  <Icon name="package" /> {pending === "preparing" ? "Updating…" : "Mark preparing"}
                </button>
              ) : null}

              {fulfillment.stage === "preparing" ? (
                <form
                  className="tracking-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run("shipped", () => client.markShipped(carrier, trackingCode));
                  }}
                >
                  <label><span>Carrier</span><input onChange={(event) => setCarrier(event.target.value)} value={carrier} /></label>
                  <label><span>Tracking code</span><input onChange={(event) => setTrackingCode(event.target.value)} placeholder="AB123456789CD" value={trackingCode} /></label>
                  <button className="button primary full-button" disabled={!carrier.trim() || !trackingCode.trim() || pending === "shipped"} type="submit">
                    <Icon name="truck" /> {pending === "shipped" ? "Sharing…" : "Share tracking & mark shipped"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {fulfillment.trackingEvent ? (
            <div className="tracking-summary"><Icon name="truck" /><span><small>{fulfillment.trackingEvent.carrier}</small><strong>{fulfillment.trackingEvent.trackingCode}</strong></span></div>
          ) : null}

          {correctionEvent ? (
            <div className="correction-summary">
              <div className="correction-heading">
                <Icon name="info" />
                <span><small>Post-shipment correction · v{correctionEvent.correctionVersion}</small><strong>{correctionRevealed ? correctionEvent.address.recipientName : "Correction details hidden"}</strong></span>
              </div>
              {correctionRevealed ? <pre className="revealed-address">{addressToMultiline(correctionEvent.address)}</pre> : null}
              <button className="button subtle" onClick={() => setRevealedCorrectionVersion(correctionRevealed ? null : correctionEvent.correctionVersion)} type="button">
                <Icon name="eye" /> {correctionRevealed ? "Hide correction" : "Reveal correction"}
              </button>
              <p>This correction is visible to the project team, but it cannot reopen or reroute the shipped order.</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProgressStep({ done, label }: { done: boolean; label: string }) {
  return <span className={done ? "done" : ""}><b>{done ? <Icon name="check" size={11} /> : null}</b><small>{label}</small></span>;
}

function ParticipantsCard({ customer, mode, staff, viewer }: { customer: Participant; mode: "demo" | "shared"; staff: Participant[]; viewer: ViewerRole }) {
  const participants = viewer === "customer" ? staff : [customer, ...staff];
  return (
    <section className="context-card participants-card">
      <div className="card-title-row"><h2>{mode === "shared" ? "Test-session recipients" : "Who can read this"}</h2><span>{participants.length} people</span></div>
      {participants.map((participant) => (
        <div className="participant" key={participant.id}>
          <span className={`avatar small-avatar ${participant.role === "customer" ? "customer-avatar" : ""}`}>{participant.initial}</span>
          <span><strong>{participant.name}{participant.role === "customer" && viewer === "project" ? " · customer" : ""}</strong><small>{participant.detail}</small></span>
          <span className="device-dot" title={mode === "shared" ? "Joined test role" : "Demo device active"} />
        </div>
      ))}
      <p className="participant-note"><Icon name="info" size={14} /> {mode === "shared" ? "These are simulated HTTP session roles, not verified production devices." : "Production will list device and roster changes before sensitive details are shared."}</p>
    </section>
  );
}

function PrivacyCard({ mode }: { mode: "demo" | "shared" }) {
  return (
    <section className="privacy-card">
      <span><Icon name={mode === "shared" ? "info" : "shield"} /></span>
      {mode === "shared" ? (
        <div><strong>Development transport only</strong><p>Messages are simulated payloads stored by the service, not end-to-end encrypted ciphertext.</p></div>
      ) : (
        <div><strong>Designed for client-held keys</strong><p>The future service will route ciphertext. This prototype intentionally does not claim that protection yet.</p></div>
      )}
    </section>
  );
}

function formatEventTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function sharedConnectionLabel(
  connection: NonNullable<MessagingExperienceProps["sharedConnection"]>,
): string {
  switch (connection) {
    case "syncing":
      return "Syncing shared test";
    case "live":
      return "Development service live";
    case "reconnecting":
      return "Reconnecting to development service";
    case "offline":
      return "Development service offline";
  }
}
