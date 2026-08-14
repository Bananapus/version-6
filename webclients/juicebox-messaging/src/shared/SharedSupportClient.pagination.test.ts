import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const protocolDoubles = vi.hoisted(() => ({
  getSharedConversation: vi.fn(),
  syncSharedEnvelopes: vi.fn(),
}));

vi.mock("./protocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./protocol")>();
  return { ...actual, ...protocolDoubles };
});

import {
  MAX_SHARED_SYNC_PAGES,
  SharedSupportClient,
} from "./SharedSupportClient";
import type { SharedActor, SharedConversation } from "./protocol";

const ACTOR: SharedActor = {
  participantId: "customer_test",
  role: "customer",
  expiresAt: 1_787_086_400_000,
};

const CONVERSATION: SharedConversation = {
  conversationId: "conversation_test",
  projectRef: "demo:banny-studio",
  rosterVersion: "2",
  epoch: 2,
  createdAt: 1_787_000_000_000,
  roster: [
    { participantId: "customer_test", role: "customer", joinedAt: 1_787_000_000_001 },
    { participantId: "staff_test", role: "project-staff", joinedAt: 1_787_000_000_002 },
  ],
};

describe("SharedSupportClient pagination budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    protocolDoubles.getSharedConversation.mockReset();
    protocolDoubles.syncSharedEnvelopes.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("stops a malicious or broken service from creating an unbounded sync loop", async () => {
    protocolDoubles.getSharedConversation.mockResolvedValue(CONVERSATION);
    protocolDoubles.syncSharedEnvelopes.mockImplementation(
      async (_conversationId: string, after: number) => ({
        envelopes: [],
        nextCursor: after + 1,
        hasMore: true,
      }),
    );
    const client = new SharedSupportClient({
      actor: ACTOR,
      conversation: CONVERSATION,
      csrfToken: "csrf_test",
    });

    await expect(client.syncNow()).rejects.toThrow("pagination limit");
    expect(protocolDoubles.syncSharedEnvelopes).toHaveBeenCalledTimes(
      MAX_SHARED_SYNC_PAGES,
    );
    client.dispose();
  });
});
