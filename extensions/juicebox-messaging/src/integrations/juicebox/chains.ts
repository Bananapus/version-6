import type { JuiceboxNetwork, JuiceboxV6ChainId } from "./types";

export interface JuiceboxV6Chain {
  id: JuiceboxV6ChainId;
  name: string;
  network: JuiceboxNetwork;
}

export const JUICEBOX_V6_CHAINS = [
  { id: 1, name: "Ethereum", network: "mainnet" },
  { id: 10, name: "Optimism", network: "mainnet" },
  { id: 8453, name: "Base", network: "mainnet" },
  { id: 42161, name: "Arbitrum One", network: "mainnet" },
  { id: 11155111, name: "Sepolia", network: "testnet" },
  { id: 11155420, name: "Optimism Sepolia", network: "testnet" },
  { id: 84532, name: "Base Sepolia", network: "testnet" },
  { id: 421614, name: "Arbitrum Sepolia", network: "testnet" },
] as const satisfies readonly JuiceboxV6Chain[];

const CHAINS_BY_ID = new Map<number, JuiceboxV6Chain>(
  JUICEBOX_V6_CHAINS.map((chain) => [chain.id, chain]),
);

export function isJuiceboxV6ChainId(value: number): value is JuiceboxV6ChainId {
  return CHAINS_BY_ID.has(value);
}

export function getJuiceboxV6Chain(chainId: number): JuiceboxV6Chain | undefined {
  return CHAINS_BY_ID.get(chainId);
}
