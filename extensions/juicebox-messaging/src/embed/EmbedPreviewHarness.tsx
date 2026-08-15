"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemePresetId, ThemeSelectionV1 } from "@/theme/theme";
import {
  EMBED_PROTOCOL,
  type EmbedLayout,
  type EmbedTopLevelReason,
  type FrameBootstrapMessage,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from "./protocol";
import { pairedLoopbackOrigin } from "./previewEnvironment";
import {
  createFrameBootstrapGate,
  createFrameToHostGate,
  exactOrigin,
  postExactBridgeMessage,
  randomBase64Url,
  type EmbedFrameBootstrapGate,
  type EmbedInboundGate,
  type ExactOrigin,
} from "./runtime";
import styles from "./EmbedPreview.module.css";

const THEME_LABELS: Readonly<Record<ThemePresetId, string>> = {
  neutral: "Neutral",
  juicebox: "Juicebox",
  revnet: "Revnet",
};

const CUSTOM_PREVIEW_THEME = {
  version: 1,
  preset: "juicebox",
  colors: { canvas: "#ffffff" },
  cornerStyle: "square",
  density: "compact",
  typography: "system-mono",
} as const satisfies ThemeSelectionV1;

// This remains protocol-shaped semantic data: materialization must reject its
// deliberately unreadable foreground instead of accepting caller-authored CSS.
const UNSAFE_PREVIEW_THEME = {
  version: 1,
  preset: "neutral",
  colors: { text: "#ffffff" },
} as const satisfies ThemeSelectionV1;

type PreviewThemeId = ThemePresetId | "custom";

const STATUS_LABELS = {
  checking: "Checking the local cross-origin pair",
  loading: "Waiting for the frame handshake",
  ready: "Authenticated preview channel established",
  closed: "Preview channel closed",
  failed: "Preview channel rejected",
  blocked: "Local preview unavailable",
} as const;

type HarnessStatus = keyof typeof STATUS_LABELS;

interface HostChannel {
  target: WindowProxy;
  targetOrigin: ExactOrigin;
  channelId: string;
  parentNonce: string;
  frameNonce: string | null;
  nextOutboundSequence: number;
  inbound: EmbedInboundGate<FrameToHostMessage>;
  timeoutId: number;
}

interface HostBootstrap {
  target: WindowProxy;
  targetOrigin: ExactOrigin;
  generation: number;
  inbound: EmbedFrameBootstrapGate;
  timeoutId: number;
}

interface SafeLedgerEntry {
  id: number;
  type:
    | FrameBootstrapMessage["type"]
    | HostToFrameMessage["type"]
    | FrameToHostMessage["type"];
}

export function EmbedPreviewHarness() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameOriginRef = useRef<ExactOrigin | null>(null);
  const fixedFrameSrcRef = useRef<string | null>(null);
  const bootstrapRef = useRef<HostBootstrap | null>(null);
  const channelRef = useRef<HostChannel | null>(null);
  const expectedFrameGenerationRef = useRef(0);
  const observedLoadGenerationRef = useRef<number | null>(null);
  const frameAcceptingMessagesRef = useRef(false);
  const selectedThemeRef = useRef<ThemeSelectionV1>({
    version: 1,
    preset: "neutral",
  });
  const ledgerIdRef = useRef(0);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [frameInstance, setFrameInstance] = useState(0);
  const [messagingEscapeHref, setMessagingEscapeHref] = useState<string | null>(
    null,
  );
  const [frameVisible, setFrameVisible] = useState(false);
  const [status, setStatus] = useState<HarnessStatus>("checking");
  const [statusDetail, setStatusDetail] = useState(
    "This lab runs only on localhost and 127.0.0.1.",
  );
  const [selectedTheme, setSelectedTheme] =
    useState<PreviewThemeId>("neutral");
  const [layout, setLayout] = useState<EmbedLayout>("regular");
  const [hasUnread, setHasUnread] = useState(false);
  const [topLevelIntent, setTopLevelIntent] =
    useState<EmbedTopLevelReason | null>(null);
  const [ledger, setLedger] = useState<SafeLedgerEntry[]>([]);

  const appendLedger = useCallback((type: SafeLedgerEntry["type"]) => {
    const id = ledgerIdRef.current + 1;
    ledgerIdRef.current = id;
    setLedger((current) =>
      [...current, { id, type }].slice(-8),
    );
  }, []);

  const resetHostPresentation = useCallback(() => {
    setFrameVisible(false);
    setLayout("regular");
    setHasUnread(false);
    setTopLevelIntent(null);
  }, []);

  const destroyProtocolState = useCallback(() => {
    const bootstrap = bootstrapRef.current;
    if (bootstrap) {
      window.clearTimeout(bootstrap.timeoutId);
      bootstrap.inbound.destroy();
      bootstrapRef.current = null;
    }
    const channel = channelRef.current;
    if (channel) {
      window.clearTimeout(channel.timeoutId);
      channel.inbound.destroy();
      channelRef.current = null;
    }
  }, []);

  const removeFrame = useCallback(
    (nextStatus: HarnessStatus, detail: string) => {
      frameAcceptingMessagesRef.current = false;
      destroyProtocolState();
      resetHostPresentation();
      observedLoadGenerationRef.current = null;
      expectedFrameGenerationRef.current += 1;
      setFrameSrc(null);
      setStatus(nextStatus);
      setStatusDetail(detail);
    },
    [destroyProtocolState, resetHostPresentation],
  );

  const replaceWithFixedFrame = useCallback(
    (detail: string) => {
      const fixedSource = fixedFrameSrcRef.current;
      frameAcceptingMessagesRef.current = false;
      destroyProtocolState();
      resetHostPresentation();
      observedLoadGenerationRef.current = null;

      if (!fixedSource) {
        setFrameSrc(null);
        setStatus("blocked");
        setStatusDetail("The fixed messaging frame route is unavailable.");
        return;
      }

      const nextGeneration = expectedFrameGenerationRef.current + 1;
      expectedFrameGenerationRef.current = nextGeneration;
      setFrameInstance(nextGeneration);
      setFrameSrc(fixedSource);
      setStatus("loading");
      setStatusDetail(detail);
    },
    [destroyProtocolState, resetHostPresentation],
  );

  const setIframeNode = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      if (!node) {
        frameAcceptingMessagesRef.current = false;
        return;
      }

      const target = node.contentWindow;
      const targetOrigin = frameOriginRef.current;
      const generation = expectedFrameGenerationRef.current;
      if (!target || !targetOrigin || !fixedFrameSrcRef.current) {
        queueMicrotask(() => {
          removeFrame(
            "failed",
            "The browser could not create the fixed preview frame.",
          );
        });
        return;
      }

      const previousBootstrap = bootstrapRef.current;
      if (previousBootstrap) {
        window.clearTimeout(previousBootstrap.timeoutId);
        previousBootstrap.inbound.destroy();
      }
      const bootstrap: HostBootstrap = {
        target,
        targetOrigin,
        generation,
        inbound: createFrameBootstrapGate({
          expectedFrameWindow: target,
          expectedFrameOrigin: targetOrigin,
        }),
        timeoutId: 0,
      };
      bootstrap.timeoutId = window.setTimeout(() => {
        if (bootstrapRef.current !== bootstrap) return;
        removeFrame(
          "failed",
          "The handshake timed out. The stale frame was removed; restart creates a fresh fixed frame.",
        );
      }, 10_000);
      bootstrapRef.current = bootstrap;
      frameAcceptingMessagesRef.current = true;
    },
    [removeFrame],
  );

  useEffect(() => {
    let cancelled = false;
    const commitState = (
      nextStatus: HarnessStatus,
      detail: string,
      source?: string,
      escapeHref?: string,
    ) => {
      queueMicrotask(() => {
        if (cancelled) return;
        if (source) setFrameSrc(source);
        if (escapeHref) setMessagingEscapeHref(escapeHref);
        setStatus(nextStatus);
        setStatusDetail(detail);
      });
    };

    if (!window.isSecureContext) {
      commitState(
        "blocked",
        "The browser did not grant this page a secure context.",
      );
      return () => {
        cancelled = true;
      };
    }

    const pairedOrigin = pairedLoopbackOrigin(window.location.origin);
    if (!pairedOrigin) {
      commitState(
        "blocked",
        "Open this route on http://localhost or http://127.0.0.1. LAN and public origins fail closed.",
      );
      return () => {
        cancelled = true;
      };
    }

    let frameOrigin: ExactOrigin;
    try {
      frameOrigin = exactOrigin(pairedOrigin, { allowLoopbackHttp: true });
    } catch {
      commitState("blocked", "The paired preview origin was not canonical.");
      return () => {
        cancelled = true;
      };
    }
    if (frameOrigin === window.location.origin) {
      commitState("blocked", "The lab refuses a same-origin frame.");
      return () => {
        cancelled = true;
      };
    }

    frameOriginRef.current = frameOrigin;
    const fixedFrameSource = frameOrigin + "/embed-preview/frame";
    fixedFrameSrcRef.current = fixedFrameSource;

    const receiveFrameMessage = (event: MessageEvent<unknown>) => {
      if (!frameAcceptingMessagesRef.current) return;
      const expectedWindow = iframeRef.current?.contentWindow;
      const expectedOrigin = frameOriginRef.current;
      if (!expectedWindow || !expectedOrigin || event.source !== expectedWindow) {
        return;
      }
      if (event.origin !== expectedOrigin) {
        replaceWithFixedFrame(
          "The frame Window changed origin. Its document was replaced with the fixed preview route.",
        );
        return;
      }

      const channel = channelRef.current;
      if (!channel) {
        const bootstrap = bootstrapRef.current;
        if (
          !bootstrap ||
          bootstrap.target !== expectedWindow ||
          bootstrap.targetOrigin !== expectedOrigin ||
          bootstrap.generation !== expectedFrameGenerationRef.current
        ) {
          replaceWithFixedFrame(
            "A trusted frame sent input before its bounded readiness gate. The frame was replaced.",
          );
          return;
        }

        const bootstrapResult = bootstrap.inbound.accept(event);
        if (!bootstrapResult.accepted) {
          replaceWithFixedFrame(
            "A trusted frame sent malformed pre-channel input. The frame was replaced.",
          );
          return;
        }

        try {
          const channelId = randomBase64Url(24);
          const parentNonce = randomBase64Url(32);
          const initializationRequestId = randomBase64Url(18);
          const inbound = createFrameToHostGate({
            expectedFrameWindow: expectedWindow,
            expectedFrameOrigin: expectedOrigin,
            channelId,
            parentNonce,
          });
          const nextChannel: HostChannel = {
            target: expectedWindow,
            targetOrigin: expectedOrigin,
            channelId,
            parentNonce,
            frameNonce: null,
            nextOutboundSequence: 1,
            inbound,
            timeoutId: bootstrap.timeoutId,
          };
          channelRef.current = nextChannel;
          bootstrap.inbound.destroy();
          bootstrapRef.current = null;

          const initialization: HostToFrameMessage = {
            protocol: EMBED_PROTOCOL,
            version: 1,
            channelId,
            sequence: 0,
            requestId: initializationRequestId,
            type: "host.init",
            payload: {
              bootstrapNonce: bootstrapResult.message.bootstrapNonce,
              parentNonce,
              contextHandle: randomBase64Url(32),
              locale: "en",
              theme: selectedThemeRef.current,
            },
          };

          postExactBridgeMessage(expectedWindow, expectedOrigin, initialization);
          appendLedger("frame.bootstrap_ready");
          appendLedger("host.init");
          setStatus("loading");
          setStatusDetail(
            "Readiness was nonce-bound; waiting for the authenticated ready message.",
          );
          resetHostPresentation();
        } catch {
          removeFrame(
            "failed",
            "The browser could not create a fresh preview channel.",
          );
        }
        return;
      }

      const result = channel.inbound.accept(event);
      if (!result.accepted) {
        replaceWithFixedFrame(
          "A trusted frame sent input outside the bounded channel. Its document was replaced.",
        );
        return;
      }

      const message = result.message;
      appendLedger(message.type);
      switch (message.type) {
        case "frame.ready":
          if (channel.frameNonce !== null) return;
          channel.frameNonce = message.payload.frameNonce;
          window.clearTimeout(channel.timeoutId);
          setStatus("ready");
          setFrameVisible(true);
          setStatusDetail(
            "Source, exact origin, channel, sequence, and nonce checks passed.",
          );
          break;
        case "frame.layout":
          setLayout(message.payload.layout);
          break;
        case "frame.unread":
          setHasUnread(message.payload.hasUnread);
          break;
        case "frame.open_top_level":
          setTopLevelIntent(message.payload.reason);
          break;
        case "frame.auth_required":
          setTopLevelIntent(
            message.payload.reason === "device-enrollment"
              ? "user-request"
              : message.payload.reason,
          );
          break;
        case "frame.closed":
          removeFrame(
            "closed",
            "The frame ended its bounded preview channel. Restart creates a new frame.",
          );
          break;
        case "frame.error":
          removeFrame(
            "failed",
            message.payload.retryable
              ? "The frame reported " +
                  message.payload.code +
                  "; a fresh restart is allowed."
              : "The frame reported " +
                  message.payload.code +
                  "; this context cannot continue.",
          );
          break;
      }
    };

    window.addEventListener("message", receiveFrameMessage);
    commitState(
      "loading",
      "Loading the frame from the paired loopback origin.",
      fixedFrameSource,
      frameOrigin + "/",
    );

    return () => {
      cancelled = true;
      frameAcceptingMessagesRef.current = false;
      window.removeEventListener("message", receiveFrameMessage);
      destroyProtocolState();
      frameOriginRef.current = null;
      fixedFrameSrcRef.current = null;
      observedLoadGenerationRef.current = null;
    };
  }, [
    appendLedger,
    destroyProtocolState,
    removeFrame,
    replaceWithFixedFrame,
    resetHostPresentation,
  ]);

  const observeFrameLoad = useCallback(
    (generation: number) => {
      if (
        generation !== expectedFrameGenerationRef.current ||
        !frameAcceptingMessagesRef.current
      ) {
        return;
      }
      if (observedLoadGenerationRef.current === generation) {
        replaceWithFixedFrame(
          "Frame navigation destroyed the channel. A new document is loading from the fixed preview route.",
        );
        return;
      }
      observedLoadGenerationRef.current = generation;
    },
    [replaceWithFixedFrame],
  );

  const postTheme = useCallback(
    (theme: ThemeSelectionV1) => {
      const channel = channelRef.current;
      if (!channel || channel.frameNonce === null) return false;
      const message: HostToFrameMessage = {
        protocol: EMBED_PROTOCOL,
        version: 1,
        channelId: channel.channelId,
        sequence: channel.nextOutboundSequence,
        peerNonce: channel.frameNonce,
        type: "host.set_theme",
        payload: { theme },
      };
      channel.nextOutboundSequence += 1;
      postExactBridgeMessage(channel.target, channel.targetOrigin, message);
      appendLedger("host.set_theme");
      return true;
    },
    [appendLedger],
  );

  const sendTheme = useCallback(
    (id: PreviewThemeId, theme: ThemeSelectionV1) => {
      selectedThemeRef.current = theme;
      setSelectedTheme(id);
      postTheme(theme);
    },
    [postTheme],
  );

  const exerciseUnsafeThemeRejection = useCallback(() => {
    if (postTheme(UNSAFE_PREVIEW_THEME)) {
      setStatusDetail(
        "Sent bounded semantic colors with deliberately invalid contrast; the frame must reject them.",
      );
    }
  }, [postTheme]);

  const restartFrame = useCallback(() => {
    const channel = channelRef.current;
    if (channel) {
      if (channel.frameNonce !== null) {
        const destroyMessage: HostToFrameMessage = {
          protocol: EMBED_PROTOCOL,
          version: 1,
          channelId: channel.channelId,
          sequence: channel.nextOutboundSequence,
          peerNonce: channel.frameNonce,
          type: "host.destroy",
          payload: {},
        };
        postExactBridgeMessage(
          channel.target,
          channel.targetOrigin,
          destroyMessage,
        );
      }
    }
    frameAcceptingMessagesRef.current = false;
    destroyProtocolState();
    resetHostPresentation();
    setLedger([]);
    const fixedSource = fixedFrameSrcRef.current;
    if (!fixedSource) {
      setFrameSrc(null);
      setStatus("blocked");
      setStatusDetail("The fixed messaging frame route is unavailable.");
      return;
    }
    const nextGeneration = expectedFrameGenerationRef.current + 1;
    expectedFrameGenerationRef.current = nextGeneration;
    observedLoadGenerationRef.current = null;
    setFrameInstance(nextGeneration);
    setFrameSrc(fixedSource);
    setStatus("loading");
    setStatusDetail("Starting a new frame and one-shot channel.");
  }, [destroyProtocolState, resetHostPresentation]);

  const frameClassName =
    layout === "compact"
      ? styles.previewFrameCompact
      : layout === "expanded"
        ? styles.previewFrameExpanded
        : styles.previewFrameRegular;

  return (
    <main className={styles.harnessRoot}>
      <header className={styles.harnessHeader}>
        <nav className={styles.breadcrumbs} aria-label="Preview navigation">
          <Link href="/">Messaging demo</Link>
          <span aria-hidden="true">/</span>
          <Link href="/projects">Project preview</Link>
        </nav>
        <div className={styles.labBadge}>Local protocol lab</div>
        <h1>Cross-origin embed &amp; theme harness</h1>
        <p className={styles.intro}>
          Exercise the bounded parent–frame protocol, three compiled visual
          presets, and one nonce-bound custom semantic theme. This is a
          development harness, not a production messaging client or proof of
          deployment isolation.
        </p>
      </header>

      <div className={styles.warningBanner} role="note">
        <strong>Not production.</strong> No wallet, project, purchase, message,
        shipping detail, key, or authorization is accepted here. The context
        capability is random and intentionally not redeemed.
      </div>

      <div className={styles.harnessGrid}>
        <section className={styles.controlPanel} aria-labelledby="lab-controls">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Host controls</p>
              <h2 id="lab-controls">Semantic appearance</h2>
            </div>
            <span
              className={
                styles.statusPill + " " + styles["status_" + status]
              }
            >
              {status === "ready" && hasUnread ? "Ready · unread" : status}
            </span>
          </div>

          <div
            className={styles.themePicker}
            role="group"
            aria-label="Frame theme"
          >
            {(Object.keys(THEME_LABELS) as ThemePresetId[]).map((preset) => (
              <button
                className={styles.themeChoice}
                type="button"
                aria-pressed={selectedTheme === preset}
                disabled={status !== "ready"}
                key={preset}
                onClick={() =>
                  sendTheme(preset, { version: 1, preset })
                }
              >
                <span
                  className={styles["swatch_" + preset]}
                  aria-hidden="true"
                />
                <span>{THEME_LABELS[preset]}</span>
              </button>
            ))}
            <button
              className={styles.themeChoice}
              type="button"
              aria-pressed={selectedTheme === "custom"}
              disabled={status !== "ready"}
              onClick={() => sendTheme("custom", CUSTOM_PREVIEW_THEME)}
            >
              <span className={styles.swatch_custom} aria-hidden="true" />
              <span>Custom semantic</span>
            </button>
          </div>

          <div className={styles.statusRegion} role="status" aria-live="polite">
            <span className={styles.statusDot} aria-hidden="true" />
            <div>
              <strong>{STATUS_LABELS[status]}</strong>
              <p>{statusDetail}</p>
            </div>
          </div>

          <button
            className={styles.rejectionButton}
            type="button"
            onClick={exerciseUnsafeThemeRejection}
            disabled={status !== "ready"}
          >
            Exercise unsafe-theme rejection
          </button>
          <p className={styles.rejectionHint}>
            Sends only bounded semantic hex tokens with deliberately unreadable
            contrast; no CSS text crosses the bridge.
          </p>

          {messagingEscapeHref ? (
            <div className={styles.intentNotice}>
              <p>
                {topLevelIntent ? (
                  <>
                    The frame requested the fixed messaging destination for{" "}
                    <strong>{topLevelIntent}</strong>. It did not provide a URL.
                  </>
                ) : (
                  "For origin-visible access, leave the embed through this fixed messaging destination."
                )}
              </p>
              <a
                href={messagingEscapeHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open standalone messaging
              </a>
            </div>
          ) : null}

          <button
            className={styles.restartButton}
            type="button"
            onClick={restartFrame}
            disabled={!messagingEscapeHref || status === "checking" || status === "blocked"}
          >
            Restart with a fresh channel
          </button>
        </section>

        <section className={styles.framePanel} aria-labelledby="frame-preview-title">
          <div className={styles.framePanelHeader}>
            <div>
              <p className={styles.eyebrow}>Paired loopback origin</p>
              <h2 id="frame-preview-title">Isolated frame preview</h2>
            </div>
            <span className={styles.originChip}>cross-origin</span>
          </div>

          {frameSrc ? (
            <div className={styles.frameStage}>
              {!frameVisible ? (
                <div className={styles.frameWaiting} role="status">
                  <span aria-hidden="true" />
                  <strong>{STATUS_LABELS[status]}</strong>
                  <p>The frame stays hidden until a valid ready message.</p>
                </div>
              ) : null}
              <iframe
                key={frameInstance}
                ref={setIframeNode}
                className={
                  styles.previewFrame +
                  " " +
                  frameClassName +
                  (!frameVisible ? " " + styles.previewFrameHidden : "")
                }
                src={frameSrc}
                title="Local cross-origin secure messaging preview"
                sandbox="allow-scripts allow-same-origin"
                allow=""
                referrerPolicy="no-referrer"
                aria-hidden={!frameVisible}
                tabIndex={frameVisible ? undefined : -1}
                onLoad={() => observeFrameLoad(frameInstance)}
              />
            </div>
          ) : (
            <div className={styles.frameUnavailable}>
              The frame remains unloaded until the local-origin checks pass.
            </div>
          )}
        </section>

        <aside className={styles.ledgerPanel} aria-labelledby="event-ledger-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Metadata only</p>
              <h2 id="event-ledger-title">Safe event ledger</h2>
            </div>
            <span className={styles.counter}>{ledger.length}/8</span>
          </div>
          <p className={styles.ledgerIntro}>
            The host can see approved event types. Payload content, identifiers,
            nonces, and the opaque context handle are never rendered or logged.
          </p>
          {ledger.length > 0 ? (
            <ol className={styles.ledgerList}>
              {ledger.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden="true" />
                  <code>{entry.type}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyLedger}>No accepted protocol events yet.</p>
          )}
        </aside>
      </div>

      <section className={styles.boundaryPanel} aria-labelledby="boundary-title">
        <div>
          <p className={styles.eyebrow}>What this demonstrates</p>
          <h2 id="boundary-title">A narrow integration boundary</h2>
        </div>
        <ul>
          <li>Exact source and exact origin checks on every event</li>
          <li>Fresh channel and per-peer nonces with strict sequence numbers</li>
          <li>Compiled presets plus nonce-bound, allowlisted semantic tokens</li>
          <li>No plaintext, PII, keys, wallet claims, or caller-provided URLs</li>
        </ul>
      </section>
    </main>
  );
}
