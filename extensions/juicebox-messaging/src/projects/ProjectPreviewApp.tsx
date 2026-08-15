"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./ProjectPreviewApp.module.css";

const CHAINS = [
  { id: 1, name: "Ethereum", network: "mainnet" },
  { id: 10, name: "Optimism", network: "mainnet" },
  { id: 8453, name: "Base", network: "mainnet" },
  { id: 42161, name: "Arbitrum One", network: "mainnet" },
  { id: 11155111, name: "Sepolia", network: "testnet" },
  { id: 11155420, name: "Optimism Sepolia", network: "testnet" },
  { id: 84532, name: "Base Sepolia", network: "testnet" },
  { id: 421614, name: "Arbitrum Sepolia", network: "testnet" },
] as const;

const DEFAULT_CHAIN_ID = 84532;
const DEFAULT_PROJECT_ID = "11";
const MAX_RESPONSE_CHARACTERS = 128 * 1024;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CANONICAL_DECIMAL = /^(0|[1-9]\d*)$/;

type Chain = (typeof CHAINS)[number];
type ChainId = Chain["id"];
type Network = Chain["network"];

interface CandidateProjectPreview {
  kind: "candidate-display-only";
  source: "bendystraw-v6-indexer";
  sourceNetwork: Network;
  ref: {
    protocol: "juicebox-v6";
    chainId: ChainId;
    projectId: number;
    version: 6;
  };
  name: string | null;
  untrustedLogoUri: string | null;
  projectTagline: string | null;
  suckerGroupId: string | null;
  accountingContext: {
    kind: "latest-indexed-terminal-accounting-context";
    tokenAddress: string;
    tokenSymbol: string | null;
    decimals: number;
    currency: string;
    projectTokenIdentity: "not-evaluated";
  } | null;
  isRevnet: boolean | null;
  untrustedMetadataUri: string | null;
  claims: {
    authorization: "not-evaluated";
    eligibility: "not-evaluated";
    purchase: "not-evaluated";
    finality: "not-evaluated";
  };
}

type LookupState =
  | { status: "idle" }
  | { status: "loading"; lookupRef: LookupRef }
  | { status: "success"; project: CandidateProjectPreview }
  | {
      status: "error";
      code: string;
      message: string;
      lookupRef: LookupRef | null;
    };

interface LookupRef {
  chainId: ChainId;
  projectId: number;
}

class LookupError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LookupError";
    this.code = code;
  }
}

const CLAIMS = [
  {
    label: "Wallet authority",
    detail: "No owner or operator signature was checked.",
  },
  {
    label: "Chat eligibility",
    detail: "No token balance or membership condition was checked.",
  },
  {
    label: "Purchase proof",
    detail: "No payment or shop receipt was verified.",
  },
  {
    label: "Chain finality",
    detail: "No finalized block or canonical log was verified.",
  },
] as const;

export function ProjectPreviewApp() {
  const [chainId, setChainId] = useState<ChainId>(DEFAULT_CHAIN_ID);
  const [projectIdInput, setProjectIdInput] = useState(DEFAULT_PROJECT_ID);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  async function runLookup(ref: LookupRef): Promise<void> {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = ++requestSequence.current;
    setLookup({ status: "loading", lookupRef: ref });

    try {
      const query = new URLSearchParams({
        chainId: String(ref.chainId),
        projectId: String(ref.projectId),
        version: "6",
      });
      const response = await fetch(`/api/juicebox/projects/resolve?${query}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw parseErrorEnvelope(payload);
      const project = parseSuccessEnvelope(payload, ref);
      if (sequence === requestSequence.current) {
        setLookup({ status: "success", project });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure =
        error instanceof LookupError
          ? error
          : new LookupError(
              "lookup_failed",
              "The project preview could not be loaded. Check your connection and try again.",
            );
      if (sequence === requestSequence.current) {
        setLookup({
          status: "error",
          code: failure.code,
          message: failure.message,
          lookupRef: ref,
        });
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const projectId = parseProjectId(projectIdInput);
    if (projectId === null) {
      setLookup({
        status: "error",
        code: "invalid_project_id",
        message:
          "Enter a whole-number project ID greater than zero, with no signs, spaces, decimals, or leading zeros.",
        lookupRef: null,
      });
      return;
    }
    void runLookup({ chainId, projectId });
  }

  const selectedChain = chainFor(chainId);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#project-lookup">
        Skip to project lookup
      </a>

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Project preview navigation">
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} aria-hidden="true">
              J
            </span>
            <span>
              <strong>Juicebox Messaging</strong>
              <small>Project inspector</small>
            </span>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/">Local prototype</Link>
            <Link className={styles.sharedLink} href="/shared">
              Separate LAN demo
              <ArrowIcon />
            </Link>
          </div>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="preview-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Juicebox v6 · read-only preview</p>
            <h1 id="preview-title">Find the project. Keep trust separate.</h1>
            <p className={styles.lede}>
              Inspect public, indexer-sourced project details before the wallet and
              onchain verification layers are connected.
            </p>
          </div>

          <aside className={styles.boundaryCard} aria-label="Preview trust boundary">
            <div className={styles.boundaryHeading}>
              <ShieldIcon />
              <div>
                <strong>Candidate display only</strong>
                <span>Not an access decision</span>
              </div>
            </div>
            <p>
              This screen cannot authorize an owner, prove a purchase, establish
              eligibility, or grant access to any chat.
            </p>
          </aside>
        </section>

        <section className={styles.workspace}>
          <div className={styles.lookupPanel} id="project-lookup">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.step}>01 · Select a reference</p>
                <h2>Look up an indexed project</h2>
              </div>
              <span className={styles.readOnlyBadge}>Read only</span>
            </div>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <label className={styles.field}>
                <span>Network</span>
                <span className={styles.controlShell}>
                  <NetworkDot network={selectedChain.network} />
                  <select
                    value={chainId}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (isChainId(value)) setChainId(value);
                    }}
                    aria-describedby="network-note"
                  >
                    <optgroup label="Production networks">
                      {CHAINS.filter((chain) => chain.network === "mainnet").map(
                        (chain) => (
                          <option key={chain.id} value={chain.id}>
                            {chain.name} · {chain.id}
                          </option>
                        ),
                      )}
                    </optgroup>
                    <optgroup label="Test networks">
                      {CHAINS.filter((chain) => chain.network === "testnet").map(
                        (chain) => (
                          <option key={chain.id} value={chain.id}>
                            {chain.name} · {chain.id}
                          </option>
                        ),
                      )}
                    </optgroup>
                  </select>
                </span>
              </label>

              <label className={styles.field}>
                <span>Project ID</span>
                <span className={styles.controlShell}>
                  <span className={styles.hash} aria-hidden="true">
                    #
                  </span>
                  <input
                    type="text"
                    value={projectIdInput}
                    onChange={(event) => setProjectIdInput(event.target.value)}
                    inputMode="numeric"
                    pattern="[1-9][0-9]*"
                    maxLength={16}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="project-id-note"
                  />
                </span>
              </label>

              <div className={styles.versionField} aria-label="Protocol version 6">
                <span>Protocol</span>
                <strong>Juicebox v6</strong>
              </div>

              <button
                className={styles.submitButton}
                type="submit"
                disabled={lookup.status === "loading"}
              >
                {lookup.status === "loading" ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Looking up…
                  </>
                ) : (
                  <>
                    Load indexed preview
                    <ArrowIcon />
                  </>
                )}
              </button>
            </form>

            <div className={styles.formNotes}>
              <p id="network-note">
                <NetworkDot network={selectedChain.network} />
                {selectedChain.network === "testnet" ? "Testnet" : "Production"}
                <span>·</span>
                {selectedChain.name}
              </p>
              <p id="project-id-note">Exact positive integer · version fixed to 6</p>
            </div>

            <div className={styles.sourceNote}>
              <DatabaseIcon />
              <p>
                Preview data comes from the Bendystraw v6 indexer and may lag the
                chain. External logo and metadata URIs are never rendered here.
              </p>
            </div>
          </div>

          <div className={styles.resultPanel} aria-live="polite" aria-busy={lookup.status === "loading"}>
            {lookup.status === "idle" && <IdleState />}
            {lookup.status === "loading" && (
              <LoadingState lookupRef={lookup.lookupRef} />
            )}
            {lookup.status === "error" && (
              <ErrorState
                code={lookup.code}
                message={lookup.message}
                canRetry={lookup.lookupRef !== null}
                onRetry={() => {
                  if (lookup.lookupRef) void runLookup(lookup.lookupRef);
                }}
              />
            )}
            {lookup.status === "success" && (
              <ProjectResult project={lookup.project} />
            )}
          </div>
        </section>

        <section className={styles.claimsSection} aria-labelledby="claims-title">
          <div className={styles.claimsHeading}>
            <p className={styles.step}>02 · Understand the boundary</p>
            <h2 id="claims-title">Four checks still stand between preview and access</h2>
            <p>
              Every value below remains deliberately unevaluated in this milestone.
            </p>
          </div>
          <div className={styles.claimGrid}>
            {CLAIMS.map((claim, index) => (
              <article className={styles.claimCard} key={claim.label}>
                <div className={styles.claimTopline}>
                  <span className={styles.claimNumber}>0{index + 1}</span>
                  <span className={styles.notEvaluated}>Not evaluated</span>
                </div>
                <h3>{claim.label}</h3>
                <p>{claim.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <strong>No wallet is connected on this page.</strong>
            <span>No lookup can unlock or create a conversation.</span>
          </div>
          <Link href="/shared">Open the separate fictional-data LAN demo</Link>
        </footer>
      </main>
    </div>
  );
}

function IdleState() {
  return (
    <div className={styles.idleState}>
      <div className={styles.projectPlaceholder} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className={styles.step}>Project preview</p>
      <h2>Base Sepolia project #11 is ready to inspect.</h2>
      <p>
        Run the lookup to view its latest indexed public fields. Nothing will ask
        for a wallet signature or change chat access.
      </p>
      <div className={styles.idleRule}>
        <span>Indexer read</span>
        <ArrowIcon />
        <span>Candidate details</span>
        <span className={styles.stopMarker}>Stop</span>
        <span>No authorization</span>
      </div>
    </div>
  );
}

function LoadingState({ lookupRef }: { lookupRef: LookupRef }) {
  const chain = chainFor(lookupRef.chainId);
  return (
    <div className={styles.loadingState}>
      <div className={styles.loadingHeader}>
        <span className={styles.loadingAvatar} />
        <div>
          <span className={styles.skeletonWide} />
          <span className={styles.skeletonShort} />
        </div>
      </div>
      <div className={styles.loadingRows} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>
        Looking up {chain.name} project #{lookupRef.projectId}…
      </p>
    </div>
  );
}

function ErrorState({
  code,
  message,
  canRetry,
  onRetry,
}: {
  code: string;
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorState} role="alert">
      <span className={styles.errorIcon} aria-hidden="true">
        !
      </span>
      <p className={styles.step}>Lookup not completed</p>
      <h2>We could not show that preview.</h2>
      <p>{message}</p>
      <code>{code}</code>
      {canRetry && (
        <button type="button" onClick={onRetry}>
          Try this lookup again
          <ArrowIcon />
        </button>
      )}
    </div>
  );
}

function ProjectResult({ project }: { project: CandidateProjectPreview }) {
  const chain = chainFor(project.ref.chainId);
  const projectName = project.name?.trim() || `Project #${project.ref.projectId}`;
  const tagline = project.projectTagline?.trim();
  const mediaWasWithheld =
    project.untrustedLogoUri !== null || project.untrustedMetadataUri !== null;

  return (
    <article className={styles.projectResult}>
      <div className={styles.projectHeader}>
        <div className={styles.generatedAvatar} aria-hidden="true">
          {projectInitial(projectName)}
        </div>
        <div className={styles.projectTitle}>
          <div className={styles.resultBadges}>
            <span>Candidate display only</span>
            <span className={styles.networkBadge}>
              <NetworkDot network={chain.network} />
              {chain.network === "testnet" ? "Testnet" : "Production"}
            </span>
          </div>
          <h2 dir="auto">{projectName}</h2>
          <p dir="auto">{tagline || "No project tagline is currently indexed."}</p>
        </div>
      </div>

      <dl className={styles.projectFacts}>
        <div>
          <dt>Project</dt>
          <dd>#{project.ref.projectId}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{chain.name}</dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd>Juicebox v{project.ref.version}</dd>
        </div>
        <div>
          <dt>Project type</dt>
          <dd>{project.isRevnet === null ? "Not indexed" : project.isRevnet ? "Revnet" : "Standard"}</dd>
        </div>
      </dl>

      <div className={styles.accessBoundary}>
        <ShieldIcon />
        <div>
          <strong>This lookup does not grant chat access.</strong>
          <p>
            Indexed metadata is useful for selection, but it is not proof of
            ownership, purchase, eligibility, or finality.
          </p>
        </div>
      </div>

      <div className={styles.contextBlock}>
        <div className={styles.contextHeading}>
          <div>
            <span>Latest indexed terminal</span>
            <h3>Accounting context</h3>
          </div>
          <span className={styles.contextCaveat}>Not project-token identity</span>
        </div>
        {project.accountingContext ? (
          <dl className={styles.contextFacts}>
            <div>
              <dt>Token symbol</dt>
              <dd dir="auto">
                {project.accountingContext.tokenSymbol ?? "Not indexed"}
              </dd>
            </div>
            <div>
              <dt>Decimals</dt>
              <dd>{project.accountingContext.decimals}</dd>
            </div>
            <div>
              <dt>Currency ID</dt>
              <dd>{project.accountingContext.currency}</dd>
            </div>
            <div className={styles.addressFact}>
              <dt>Token address</dt>
              <dd>{project.accountingContext.tokenAddress}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.noContext}>
            No complete terminal accounting context is currently indexed.
          </p>
        )}
      </div>

      <div className={styles.indexerFooter}>
        <DatabaseIcon />
        <div>
          <strong>Bendystraw v6 indexer</strong>
          <span>
            {mediaWasWithheld
              ? "External media references were returned and safely withheld."
              : "No external media references were returned."}
          </span>
        </div>
        <span className={styles.sourcePill}>Unverified source</span>
      </div>
    </article>
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new LookupError(
      "invalid_response",
      "The preview service returned an unexpected response.",
    );
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARACTERS) {
    throw new LookupError(
      "invalid_response",
      "The preview service returned an oversized response.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LookupError(
      "invalid_response",
      "The preview service returned malformed data.",
    );
  }
}

function parseSuccessEnvelope(value: unknown, expected: LookupRef): CandidateProjectPreview {
  const envelope = exactRecord(value, ["data"]);
  const project = parseProject(envelope.data);
  if (
    project.ref.chainId !== expected.chainId ||
    project.ref.projectId !== expected.projectId
  ) {
    throw invalidResponse();
  }
  return project;
}

function parseErrorEnvelope(value: unknown): LookupError {
  try {
    const envelope = exactRecord(value, ["error"]);
    const error = exactRecord(envelope.error, ["code", "message"]);
    const code = requiredString(error.code, 64);
    const message = requiredString(error.message, 512);
    return new LookupError(code, message);
  } catch {
    return invalidResponse();
  }
}

function parseProject(value: unknown): CandidateProjectPreview {
  const project = exactRecord(value, [
    "kind",
    "source",
    "sourceNetwork",
    "ref",
    "name",
    "untrustedLogoUri",
    "projectTagline",
    "suckerGroupId",
    "accountingContext",
    "isRevnet",
    "untrustedMetadataUri",
    "claims",
  ]);
  if (
    project.kind !== "candidate-display-only" ||
    project.source !== "bendystraw-v6-indexer" ||
    (project.sourceNetwork !== "mainnet" && project.sourceNetwork !== "testnet")
  ) {
    throw invalidResponse();
  }

  const ref = exactRecord(project.ref, ["protocol", "chainId", "projectId", "version"]);
  if (
    ref.protocol !== "juicebox-v6" ||
    !isChainId(ref.chainId) ||
    !isPositiveSafeInteger(ref.projectId) ||
    ref.version !== 6
  ) {
    throw invalidResponse();
  }
  const chain = chainFor(ref.chainId);
  if (chain.network !== project.sourceNetwork) throw invalidResponse();

  const claims = exactRecord(project.claims, [
    "authorization",
    "eligibility",
    "purchase",
    "finality",
  ]);
  if (
    claims.authorization !== "not-evaluated" ||
    claims.eligibility !== "not-evaluated" ||
    claims.purchase !== "not-evaluated" ||
    claims.finality !== "not-evaluated"
  ) {
    throw invalidResponse();
  }

  let accountingContext: CandidateProjectPreview["accountingContext"] = null;
  if (project.accountingContext !== null) {
    const context = exactRecord(project.accountingContext, [
      "kind",
      "tokenAddress",
      "tokenSymbol",
      "decimals",
      "currency",
      "projectTokenIdentity",
    ]);
    if (
      context.kind !== "latest-indexed-terminal-accounting-context" ||
      typeof context.tokenAddress !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(context.tokenAddress) ||
      (context.tokenSymbol !== null && !isBoundedString(context.tokenSymbol, 64)) ||
      typeof context.decimals !== "number" ||
      !Number.isInteger(context.decimals) ||
      context.decimals < 0 ||
      context.decimals > 255 ||
      typeof context.currency !== "string" ||
      context.currency.length > 10 ||
      !CANONICAL_DECIMAL.test(context.currency) ||
      BigInt(context.currency) > 4_294_967_295n ||
      context.projectTokenIdentity !== "not-evaluated"
    ) {
      throw invalidResponse();
    }
    accountingContext = {
      kind: context.kind,
      tokenAddress: context.tokenAddress,
      tokenSymbol: context.tokenSymbol,
      decimals: context.decimals,
      currency: context.currency,
      projectTokenIdentity: context.projectTokenIdentity,
    };
  }

  if (project.isRevnet !== null && typeof project.isRevnet !== "boolean") {
    throw invalidResponse();
  }

  return {
    kind: project.kind,
    source: project.source,
    sourceNetwork: project.sourceNetwork,
    ref: {
      protocol: ref.protocol,
      chainId: ref.chainId,
      projectId: ref.projectId,
      version: ref.version,
    },
    name: nullableString(project.name, 256),
    untrustedLogoUri: nullableString(project.untrustedLogoUri, 4_096),
    projectTagline: nullableString(project.projectTagline, 1_024),
    suckerGroupId: nullableString(project.suckerGroupId, 256),
    accountingContext,
    isRevnet: project.isRevnet,
    untrustedMetadataUri: nullableString(project.untrustedMetadataUri, 4_096),
    claims: {
      authorization: claims.authorization,
      eligibility: claims.eligibility,
      purchase: claims.purchase,
      finality: claims.finality,
    },
  };
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    throw invalidResponse();
  }
  return record;
}

function requiredString(value: unknown, maxLength: number): string {
  if (!isBoundedString(value, maxLength) || value.length === 0) {
    throw invalidResponse();
  }
  return value;
}

function nullableString(value: unknown, maxLength: number): string | null {
  if (value === null) return null;
  if (!isBoundedString(value, maxLength)) throw invalidResponse();
  return value;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function parseProjectId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return isPositiveSafeInteger(parsed) ? parsed : null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isChainId(value: unknown): value is ChainId {
  return typeof value === "number" && CHAINS.some((chain) => chain.id === value);
}

function chainFor(chainId: ChainId): Chain {
  const chain = CHAINS.find((candidate) => candidate.id === chainId);
  if (!chain) throw new Error("Unsupported chain ID.");
  return chain;
}

function invalidResponse(): LookupError {
  return new LookupError(
    "invalid_response",
    "The preview service returned data that did not match the expected contract.",
  );
}

function projectInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "J";
}

function NetworkDot({ network }: { network: Network }) {
  return (
    <span
      className={network === "testnet" ? styles.testnetDot : styles.mainnetDot}
      aria-hidden="true"
    />
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
      <path d="M12 3 19 6v5.4c0 4.1-2.8 7.8-7 9.6-4.2-1.8-7-5.5-7-9.6V6l7-3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9 12h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
      <ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
