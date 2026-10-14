/**
 * Revision 24 (#5): a working driver can be offered, accept and finish a
 * second order. The app works one order at a time; the rest wait in
 * `otherOrders` and come forward as each one ends.
 */

import { useDriverStore } from "../src/store/driverStore";

const NOW_ISO = () => new Date().toISOString();

const IN_HAND = { id: "ord-a", orderNumber: "DRB-A-1", status: "PICKED_UP", stage: "PICKED_UP" } as any;
const SECOND = { id: "ord-b", orderNumber: "DRB-B-1", status: "ASSIGNED" } as any;
const OFFER = {
  id: "off-1",
  restaurantName: "Al Seef Pharmacy",
  feeKwd: 1.25,
  expiresAt: new Date(Date.now() + 15_000).toISOString(),
} as any;

beforeEach(() => {
  useDriverStore.getState().reset();
});

describe("multiple live orders", () => {
  test("an offer is shown while an order is in hand", () => {
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: IN_HAND,
      activeOrders: [IN_HAND],
      activeOffer: OFFER,
      serverTime: NOW_ISO(),
    });

    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-a");
    expect(s.activeOffer?.id).toBe("off-1");
  });

  test("offerReceived is not dropped because the driver is busy", () => {
    useDriverStore.setState({ activeOrder: { ...IN_HAND } });
    useDriverStore.getState().offerReceived(OFFER);
    expect(useDriverStore.getState().activeOffer?.id).toBe("off-1");
  });

  test("accepting while busy keeps the order in hand on screen and queues the new one", () => {
    useDriverStore.setState({ activeOrder: { ...IN_HAND }, activeOffer: OFFER });

    useDriverStore.getState().adoptOrder(SECOND);

    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-a");
    expect(s.otherOrders.map((o) => o.id)).toEqual(["ord-b"]);
    expect(s.activeOffer).toBeNull();
    expect(s.availability).toBe("BUSY");
  });

  test("hydrate lists both orders and keeps the one the driver is working on", () => {
    useDriverStore.setState({ activeOrder: { ...SECOND, stage: "HEADING_TO_PICKUP" } });

    useDriverStore.getState().hydrate({
      availability: "BUSY",
      // The server would rather the driver worked on ord-a (in hand) first...
      activeOrder: IN_HAND,
      activeOrders: [IN_HAND, SECOND],
      serverTime: NOW_ISO(),
    });

    // ...but the driver chose ord-b, and it is still live, so it stays.
    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-b");
    expect(s.otherOrders.map((o) => o.id)).toEqual(["ord-a"]);
  });

  test("finishing one brings the next forward, still BUSY; finishing the last goes ONLINE", () => {
    useDriverStore.setState({
      availability: "BUSY",
      activeOrder: { ...IN_HAND },
      otherOrders: [{ ...SECOND, stage: "HEADING_TO_PICKUP" }],
    });

    useDriverStore.getState().completeOrder("ord-a");
    let s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-b");
    expect(s.otherOrders).toEqual([]);
    expect(s.availability).toBe("BUSY");
    expect(s.persistedActiveOrderId).toBe("ord-b");

    useDriverStore.getState().completeOrder("ord-b");
    s = useDriverStore.getState();
    expect(s.activeOrder).toBeNull();
    expect(s.availability).toBe("ONLINE");
  });

  test("completing an order that is not on screen only drops it from the list", () => {
    useDriverStore.setState({
      activeOrder: { ...IN_HAND },
      otherOrders: [{ ...SECOND, stage: "HEADING_TO_PICKUP" }],
    });

    useDriverStore.getState().completeOrder("ord-b");

    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-a");
    expect(s.otherOrders).toEqual([]);
  });

  test("focusOrder switches the order on screen and keeps the other in the list", () => {
    useDriverStore.setState({
      activeOrder: { ...IN_HAND },
      otherOrders: [{ ...SECOND, stage: "HEADING_TO_PICKUP" }],
    });

    useDriverStore.getState().focusOrder("ord-b");

    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-b");
    expect(s.otherOrders.map((o) => o.id)).toEqual(["ord-a"]);
  });

  test("an older backend that sends only activeOrder still works as a list of one", () => {
    useDriverStore.getState().hydrate({
      availability: "BUSY",
      activeOrder: IN_HAND,
      serverTime: NOW_ISO(),
    });

    const s = useDriverStore.getState();
    expect(s.activeOrder?.id).toBe("ord-a");
    expect(s.otherOrders).toEqual([]);
  });
});
