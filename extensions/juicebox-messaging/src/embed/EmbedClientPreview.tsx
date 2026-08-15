"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemePresetId, ThemeSelectionV1 } from "@/theme/theme";
import {
  OWNED_THEME_ATTRIBUTE_VALUE,
  materializeOwnedTheme,
  type OwnedThemeMaterialization,
} from "@/theme/ownedStylesheet";
import {
  EMBED_CAPABILITIES,
  EMBED_PROTOCOL,
  type FrameBootstrapMessage,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from "./protocol";
import { pairedLoopbackOrigin } from "./previewEnvironment";
import {
  createEstablishedHostToFrameGate,
  createHostInitializationGate,
  exactOrigin,
  postExactBridgeMessage,
  randomBase64Url,
  type EmbedHostInitializationGate,
  type EmbedInboundGate,
  type ExactOrigin,
} from "./runtime";
import styles from "./EmbedPreview.module.css";

type FramePhase = "checking" | "waiting" | "ready" | "closed" | "failed" | "blocked";
type OperationalFrameType = Exclude<
  FrameToHostMessage["type"],
  "frame.ready"
>;
type FrameOperationDraft = {
  [Type in OperationalFrameType]: {
    type: Type;
    payload: Extract<FrameToHostMessage, { type: Type }>["payload"];
  };
}[OperationalFrameType];

interface FrameChannel {
  target: WindowProxy;
  targetOrigin: ExactOrigin;
  channelId: string;
  parentNonce: string;
  frameNonce: string;
  nextOutboundSequence: number;
  inbound: EmbedInboundGate<HostToFrameMessage>;
}

const THEME_LABELS: Readonly<Record<ThemePresetId, string>> = {
  neutral: "Neutral",
  juicebox: "Juicebox",
  revnet: "Revnet",
};

function hasThemeOverrides(theme: ThemeSelectionV1): boolean {
  return (
    theme.colors !== undefined ||
    theme.cornerStyle !== undefined ||
    theme.density !== undefined ||
    theme.typography !== undefined
  );
}

export function EmbedClientPreview({
  stylesheetNonce,
}: {
  stylesheetNonce?: string;
}) {
  const initializationGateRef = useRef<EmbedHostInitializationGate | null>(null);
  const channelRef = useRef<FrameChannel | null>(null);
  const [phase, setPhase] = useState<FramePhase>("checking");
  const [phaseDetail, setPhaseDetail] = useState(
    "Verifying the fixed local parent origin.",
  );
  const [themePreset, setThemePreset] = useState<ThemePresetId>("neutral");
  const [customTheme, setCustomTheme] =
    useState<OwnedThemeMaterialization | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  const resetChannelPresentation = useCallback(() => {
    setCustomTheme(null);
    setThemePreset("neutral");
    setHasUnread(false);
  }, []);

  const applyTheme = useCallback(
    (theme: ThemeSelectionV1) => {
      if (hasThemeOverrides(theme)) {
        try {
          setCustomTheme(materializeOwnedTheme(theme, stylesheetNonce));
        } catch {
          return false;
        }
      } else {
        setCustomTheme(null);
      }
      setThemePreset(theme.preset);
      return true;
    },
    [stylesheetNonce],
  );

  const postOperation = useCallback((draft: FrameOperationDraft) => {
    const channel = channelRef.current;
    if (!channel) return false;
    const message = {
      protocol: EMBED_PROTOCOL,
      version: 1,
      channelId: channel.channelId,
      sequence: channel.nextOutboundSequence,
      peerNonce: channel.parentNonce,
      type: draft.type,
      payload: draft.payload,
    } as FrameToHostMessage;
    channel.nextOutboundSequence += 1;
    postExactBridgeMessage(channel.target, channel.targetOrigin, message);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const commitPhase = (nextPhase: FramePhase, detail: string) => {
      queueMicrotask(() => {
        if (cancelled) return;
        setPhase(nextPhase);
        setPhaseDetail(detail);
      });
    };

    if (!window.isSecureContext) {
      commitPhase(
        "blocked",
        "This frame refuses to run outside a secure context.",
      );
      return () => {
        cancelled = true;
      };
    }
    if (window.parent === window) {
      commitPhase(
        "blocked",
        "This frame-only route must be opened by the local host harness.",
      );
      return () => {
        cancelled = true;
      };
    }

    const pairedOrigin = pairedLoopbackOrigin(window.location.origin);
    if (!pairedOrigin) {
      commitPhase(
        "blocked",
        "The local frame accepts only its fixed paired loopback host.",
      );
      return () => {
        cancelled = true;
      };
    }

    let parentOrigin: ExactOrigin;
    try {
      parentOrigin = exactOrigin(pairedOrigin, { allowLoopbackHttp: true });
    } catch {
      commitPhase(
        "blocked",
        "The configured local parent origin was not canonical.",
      );
      return () => {
        cancelled = true;
      };
    }
    if (parentOrigin === window.location.origin) {
      commitPhase("blocked", "The frame refuses a same-origin parent.");
      return () => {
        cancelled = true;
      };
    }

    const bootstrapNonce = randomBase64Url(32);
    const initializationGate = createHostInitializationGate({
      expectedParentWindow: window.parent,
      expectedParentOrigin: parentOrigin,
      expectedBootstrapNonce: bootstrapNonce,
    });
    initializationGateRef.current = initializationGate;
    commitPhase(
      "waiting",
      "Waiting for a one-shot initialization from the fixed parent.",
    );
    const initializationTimeoutId = window.setTimeout(() => {
      if (channelRef.current !== null) return;
      initializationGate.destroy();
      resetChannelPresentation();
      setPhase("failed");
      setPhaseDetail(
        "Initialization timed out. A fresh frame and context are required.",
      );
    }, 10_000);

    const receiveHostMessage = (event: MessageEvent<unknown>) => {
      const activeChannel = channelRef.current;
      if (event.source === window.parent && event.origin !== parentOrigin) {
        initializationGate.destroy();
        activeChannel?.inbound.destroy();
        channelRef.current = null;
        window.clearTimeout(initializationTimeoutId);
        resetChannelPresentation();
        setPhase("failed");
        setPhaseDetail("The fixed parent origin changed; this frame is no longer usable.");
        return;
      }
      if (!activeChannel) {
        const result = initializationGate.accept(event);
        if (!result.accepted) {
          if (result.reason === "untrusted-peer" || result.reason === "closed") {
            return;
          }
          initializationGate.destroy();
          window.clearTimeout(initializationTimeoutId);
          resetChannelPresentation();
          setPhase("failed");
          setPhaseDetail("Initialization did not match the bounded protocol.");
          return;
        }

        try {
          window.clearTimeout(initializationTimeoutId);
          const initialization = result.message;
          const frameNonce = randomBase64Url(32);
          const channel: FrameChannel = {
            target: window.parent,
            targetOrigin: parentOrigin,
            channelId: initialization.channelId,
            parentNonce: initialization.payload.parentNonce,
            frameNonce,
            nextOutboundSequence: 1,
            inbound: createEstablishedHostToFrameGate({
              expectedParentWindow: window.parent,
              expectedParentOrigin: parentOrigin,
              channelId: initialization.channelId,
              frameNonce,
              initializationRequestId: initialization.requestId,
            }),
          };
          channelRef.current = channel;
          if (!applyTheme(initialization.payload.theme)) {
            throw new Error("Theme could not be safely materialized.");
          }
          setPhase("ready");
          setPhaseDetail("The local channel is established. No context was redeemed.");

          const ready: FrameToHostMessage = {
            protocol: EMBED_PROTOCOL,
            version: 1,
            channelId: channel.channelId,
            sequence: 0,
            peerNonce: channel.parentNonce,
            type: "frame.ready",
            payload: {
              frameNonce,
              acceptedVersion: 1,
              capabilities: EMBED_CAPABILITIES,
            },
          };
          postExactBridgeMessage(channel.target, channel.targetOrigin, ready);

          const previewLayout =
            window.innerWidth < 440 ? "compact" : "regular";
          const layout: FrameToHostMessage = {
            protocol: EMBED_PROTOCOL,
            version: 1,
            channelId: channel.channelId,
            sequence: channel.nextOutboundSequence,
            peerNonce: channel.parentNonce,
            type: "frame.layout",
            payload: { layout: previewLayout },
          };
          channel.nextOutboundSequence += 1;
          postExactBridgeMessage(channel.target, channel.targetOrigin, layout);
        } catch {
          channelRef.current?.inbound.destroy();
          channelRef.current = null;
          resetChannelPresentation();
          setPhase("failed");
          setPhaseDetail("The browser could not establish a fresh frame channel.");
        }
        return;
      }

      const result = activeChannel.inbound.accept(event);
      if (!result.accepted) {
        if (result.reason === "untrusted-peer" || result.reason === "closed") {
          return;
        }
        postOperation({
          type: "frame.error",
          payload: { code: "channel-invalid", retryable: false },
        });
        activeChannel.inbound.destroy();
        channelRef.current = null;
        resetChannelPresentation();
        setPhase("failed");
        setPhaseDetail("A host operation failed source, origin, or protocol checks.");
        return;
      }

      switch (result.message.type) {
        case "host.set_theme":
          if (!applyTheme(result.message.payload.theme)) {
            postOperation({
              type: "frame.error",
              payload: { code: "channel-invalid", retryable: false },
            });
            activeChannel.inbound.destroy();
            channelRef.current = null;
            resetChannelPresentation();
            setPhase("failed");
            setPhaseDetail("The custom theme could not be safely materialized.");
          }
          break;
        case "host.set_locale":
          break;
        case "host.destroy":
          postOperation({ type: "frame.closed", payload: {} });
          activeChannel.inbound.destroy();
          channelRef.current = null;
          resetChannelPresentation();
          setPhase("closed");
          setPhaseDetail("The host destroyed this one-use preview channel.");
          break;
        case "host.init":
          activeChannel.inbound.destroy();
          channelRef.current = null;
          resetChannelPresentation();
          setPhase("failed");
          setPhaseDetail("Repeated initialization was rejected.");
          break;
      }
    };

    window.addEventListener("message", receiveHostMessage);

    const bootstrap: FrameBootstrapMessage = {
      protocol: EMBED_PROTOCOL,
      version: 1,
      type: "frame.bootstrap_ready",
      bootstrapNonce,
    };
    queueMicrotask(() => {
      if (cancelled || initializationGateRef.current !== initializationGate) {
        return;
      }
      postExactBridgeMessage(window.parent, parentOrigin, bootstrap);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(initializationTimeoutId);
      window.removeEventListener("message", receiveHostMessage);
      initializationGate.destroy();
      initializationGateRef.current = null;
      channelRef.current?.inbound.destroy();
      channelRef.current = null;
    };
  }, [applyTheme, postOperation, resetChannelPresentation]);

  const toggleUnread = useCallback(() => {
    const nextUnread = !hasUnread;
    if (
      postOperation({
        type: "frame.unread",
        payload: { hasUnread: nextUnread },
      })
    ) {
      setHasUnread(nextUnread);
    }
  }, [hasUnread, postOperation]);

  const requestTopLevel = useCallback(() => {
    postOperation({
      type: "frame.open_top_level",
      payload: { reason: "user-request" },
    });
  }, [postOperation]);

  const closePreview = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    postOperation({ type: "frame.closed", payload: {} });
    channel.inbound.destroy();
    channelRef.current = null;
    resetChannelPresentation();
    setPhase("closed");
    setPhaseDetail("This preview channel is closed.");
  }, [postOperation, resetChannelPresentation]);

  const themeClass =
    themePreset === "juicebox"
      ? styles.themeJuicebox
      : themePreset === "revnet"
        ? styles.themeRevnet
        : styles.themeNeutral;

  if (phase === "blocked" || phase === "failed") {
    return (
      <main className={styles.frameDocument}>
        <div className={styles.securityBar}>
          <span>Local frame · non-production</span>
          <strong>{phase}</strong>
        </div>
        <section className={styles.frameFailure} aria-labelledby="frame-state-title">
          <p className={styles.frameEyebrow}>Fail closed</p>
          <h1 id="frame-state-title">
            {phase === "blocked" ? "Frame unavailable" : "Channel rejected"}
          </h1>
          <p>{phaseDetail}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.frameDocument}>
      {customTheme ? (
        <style nonce={customTheme.nonce}>{customTheme.stylesheet}</style>
      ) : null}
      <div className={styles.securityBar}>
        <span>Local frame · non-production</span>
        <strong>{phase === "ready" ? "cross-origin channel" : phase}</strong>
      </div>

      <div
        className={
          styles.frameTheme +
          " " +
          themeClass +
          (customTheme ? " " + styles.customThemeScope : "")
        }
        data-embed-custom-theme={
          customTheme ? OWNED_THEME_ATTRIBUTE_VALUE : undefined
        }
      >
        <header className={styles.clientHeader}>
          <div className={styles.clientIdentity}>
            <span className={styles.clientMark} aria-hidden="true">
              SP
            </span>
            <div>
              <p className={styles.frameEyebrow}>Static purchase-support preview</p>
              <h1>Sample Project</h1>
            </div>
          </div>
          <span className={styles.themeName}>{THEME_LABELS[themePreset]}</span>
        </header>

        <div className={styles.frameNotice} role="note">
          <strong>No production context.</strong> This visual sample has no wallet,
          purchase authorization, chat connection, or encryption session.
        </div>

        {customTheme ? (
          <div className={styles.customThemeNotice} role="note">
            Custom semantic tokens are active through a validated, nonce-bearing
            owned stylesheet. No raw CSS or style attribute crossed the bridge.
          </div>
        ) : null}

        <section className={styles.threadCard} aria-labelledby="sample-thread-title">
          <div className={styles.threadHeader}>
            <div>
              <p className={styles.frameEyebrow}>Purchase support</p>
              <h2 id="sample-thread-title">Sample fulfillment thread</h2>
            </div>
            <span className={styles.privateChip}>1-to-1</span>
          </div>

          <div className={styles.orderRow}>
            <span className={styles.orderGlyph} aria-hidden="true">
              P
            </span>
            <div>
              <strong>Limited print</strong>
              <span>Fictional item · preview only</span>
            </div>
          </div>

          <div className={styles.messageList} aria-label="Static sample messages">
            <article className={styles.incomingMessage}>
              <span>Project fulfillment</span>
              <p>
                In the real client, personal shipping details stay inside the
                private conversation and never cross the host bridge.
              </p>
            </article>
            <article className={styles.outgoingMessage}>
              <span>Sample customer</span>
              <p>I’ll continue in the first-party client.</p>
            </article>
          </div>

          <div className={styles.composerPreview}>
            <label htmlFor="preview-composer">Message</label>
            <div>
              <input
                id="preview-composer"
                type="text"
                placeholder="Composer unavailable in protocol lab"
                disabled
              />
              <button type="button" disabled>
                Send
              </button>
            </div>
          </div>
        </section>

        <div
          className={styles.frameActions}
          role="group"
          aria-label="Safe frame events"
        >
          <button type="button" onClick={toggleUnread} disabled={phase !== "ready"}>
            {hasUnread ? "Clear unread signal" : "Send unread signal"}
          </button>
          <button
            type="button"
            onClick={requestTopLevel}
            disabled={phase !== "ready"}
          >
            Request full client
          </button>
          <button type="button" onClick={closePreview} disabled={phase !== "ready"}>
            Close channel
          </button>
        </div>

        <p className={styles.frameState} role="status" aria-live="polite">
          <span aria-hidden="true" />
          {phaseDetail}
        </p>
      </div>
    </main>
  );
}
