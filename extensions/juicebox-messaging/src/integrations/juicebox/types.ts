export const JUICEBOX_V6_PROTOCOL = "juicebox-v6" as const;
export const JUICEBOX_V6_VERSION = 6 as const;

export type JuiceboxV6ChainId =
  | 1
  | 10
  | 8453
  | 42161
  | 11155111
  | 11155420
  | 84532
  | 421614;

export type JuiceboxNetwork = "mainnet" | "testnet";

export interface JuiceboxV6ProjectRef {
  protocol: typeof JUICEBOX_V6_PROTOCOL;
  chainId: JuiceboxV6ChainId;
  projectId: number;
  version: typeof JUICEBOX_V6_VERSION;
}

/**
 * Untrusted, indexer-sourced project metadata for choosing a project in UI.
 * Nothing in this object is evidence of ownership, eligibility, a purchase, or
 * transaction finality.
 */
export interface CandidateProjectPreview {
  kind: "candidate-display-only";
  source: "bendystraw-v6-indexer";
  sourceNetwork: JuiceboxNetwork;
  ref: JuiceboxV6ProjectRef;
  name: string | null;
  /** Never render directly. Resolve through an approved media proxy/sanitizer. */
  untrustedLogoUri: string | null;
  projectTagline: string | null;
  suckerGroupId: string | null;
  /**
   * The latest terminal accounting context present in the Bendystraw project
   * row. This is not the project's issued token identity, and projects with
   * multiple accounting contexts may not be fully represented here.
   */
  accountingContext: {
    kind: "latest-indexed-terminal-accounting-context";
    tokenAddress: string;
    tokenSymbol: string | null;
    decimals: number;
    currency: string;
    projectTokenIdentity: "not-evaluated";
  } | null;
  isRevnet: boolean | null;
  /** Never fetch or navigate directly. Resolve through an allowlisted gateway. */
  untrustedMetadataUri: string | null;
  claims: {
    authorization: "not-evaluated";
    eligibility: "not-evaluated";
    purchase: "not-evaluated";
    finality: "not-evaluated";
  };
}

export interface JuiceboxProjectPreviewPort {
  resolveProjectPreview(
    ref: JuiceboxV6ProjectRef,
  ): Promise<CandidateProjectPreview | null>;
}

export interface FinalizedReceiptClaim {
  ref: JuiceboxV6ProjectRef;
  txHash: `0x${string}`;
  logIndex?: number;
}

export type FinalizedReceiptDecision =
  | {
      status: "verified";
      chainId: JuiceboxV6ChainId;
      blockNumber: string;
      blockHash: `0x${string}`;
    }
  | {
      status: "rejected" | "pending-finality" | "unavailable";
      reasonCode: string;
    };

/**
 * Deliberately not implemented by the indexer preview adapter. A later RPC
 * adapter must satisfy this port before any preview can influence chat access.
 */
export interface JuiceboxFinalizedReceiptProofPort {
  verifyFinalizedReceipt(
    claim: FinalizedReceiptClaim,
  ): Promise<FinalizedReceiptDecision>;
}

export interface VerifiedJuiceboxV6Adapter
  extends JuiceboxProjectPreviewPort,
    JuiceboxFinalizedReceiptProofPort {}
