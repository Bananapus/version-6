import { describe, expect, it } from "vitest";
import { deriveFulfillment, rosterBindingFromSnapshot } from "@/domain/fulfillment";
import type { RecipientRosterBinding, ShippingAddress } from "@/domain/model";
import { DemoSupportClient } from "./DemoSupportClient";

const ADDRESS: ShippingAddress = {
  recipientName: "Avery Example",
  line1: "123 Demo Street",
  line2: "Apartment 4B",
  city: "São Paulo",
  region: "SP",
  postalCode: "01000-000",
  country: "Brazil",
  deliveryNote: "Leave with the front desk.",
};

function approvedRoster(client: DemoSupportClient): RecipientRosterBinding {
  return rosterBindingFromSnapshot(client.getSnapshot().roster);
}

async function shipOrder(client: DemoSupportClient): Promise<void> {
  await client.shareAddress(ADDRESS, approvedRoster(client));
  await client.acknowledgeAddress();
  await client.markPreparing();
  await client.markShipped("Correios", "AB123456789CD");
}

describe("DemoSupportClient", () => {
  it("runs the purchase fulfillment happy path and binds shipping to the current address", async () => {
    const client = new DemoSupportClient();

    await client.shareAddress(ADDRESS, approvedRoster(client));
    expect(deriveFulfillment(client.getSnapshot().events).stage).toBe("ready-to-fulfill");

    await client.acknowledgeAddress();
    expect(deriveFulfillment(client.getSnapshot().events).acknowledged).toBe(true);

    await client.markPreparing();
    expect(deriveFulfillment(client.getSnapshot().events).stage).toBe("preparing");

    await client.markShipped("Correios", "AB123456789CD");
    const result = deriveFulfillment(client.getSnapshot().events);
    expect(result.stage).toBe("shipped");
    expect(result.trackingEvent?.trackingCode).toBe("AB123456789CD");
    expect(result.trackingEvent?.addressId).toBe(result.addressEvent?.addressId);
    expect(result.trackingEvent?.addressVersion).toBe(1);
  });

  it("aborts sensitive sharing when the approved roster context has drifted", async () => {
    const client = new DemoSupportClient();
    const staleApproval = {
      ...approvedRoster(client),
      mlsEpoch: client.getSnapshot().roster.mlsEpoch - 1,
    };

    await expect(client.shareAddress(ADDRESS, staleApproval)).rejects.toThrow(
      "The recipient roster changed",
    );
    expect(deriveFulfillment(client.getSnapshot().events).stage).toBe("address-needed");
  });

  it("emits a distinct correction after shipping without enabling another shipment", async () => {
    const client = new DemoSupportClient();
    await shipOrder(client);

    const correctedAddress = { ...ADDRESS, line1: "456 Corrected Street" };
    await client.shareAddress(correctedAddress, approvedRoster(client));

    const snapshot = client.getSnapshot();
    const fulfillment = deriveFulfillment(snapshot.events);
    expect(fulfillment.stage).toBe("shipped");
    expect(fulfillment.addressEvent?.address.line1).toBe(ADDRESS.line1);
    expect(fulfillment.addressCorrectionEvent?.address.line1).toBe(
      correctedAddress.line1,
    );
    expect(
      snapshot.events.filter((entry) => entry.event.kind === "shipping_address.v1"),
    ).toHaveLength(1);
    expect(
      snapshot.events.filter(
        (entry) => entry.event.kind === "shipping_address_correction.v1",
      ),
    ).toHaveLength(1);

    await expect(client.markPreparing()).rejects.toThrow();
    await expect(client.markShipped("Correios", "SECOND-SHIPMENT")).rejects.toThrow();
  });

  it("keeps all demo state in memory and can reset it", async () => {
    const client = new DemoSupportClient();
    const initialCount = client.getSnapshot().events.length;

    await client.sendText("Can you ship this week?");
    expect(client.getSnapshot().events).toHaveLength(initialCount + 1);
    expect(client.getSnapshot().events.at(-1)?.authenticated.roleCredential.role).toBe(
      "customer",
    );
    expect(client.getSnapshot().events.at(-1)?.event).not.toHaveProperty("sender");

    await client.reset();
    expect(client.getSnapshot().events).toHaveLength(initialCount);
  });
});
