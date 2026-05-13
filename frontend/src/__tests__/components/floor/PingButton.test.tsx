/**
 * Phase 7 Wave 0 RED test — <PingButton/>.
 *
 * Click flow (resolution #3):
 *   1. POST /api/floor/ping/:driverId with {intent, bodyEnglish}.
 *   2. On {pendingActionId, requiresApproval:true} response, render
 *      <ChatActionCard proposal={...} ctaLabel="Send via Darb"/>.
 *   3. ChatActionCard's existing approval path (Phase 2 propose-and-
 *      confirm) takes over. Real WhatsApp/SMS send wires up in Phase 9.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

// Mock api FIRST so the component picks up the mock.
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(async (url: string) => {
      if (url.includes("/api/floor/ping")) {
        return { data: { pendingActionId: "pa-123", requiresApproval: true } };
      }
      return { data: {} };
    }),
    get: vi.fn(),
  },
  getAccessToken: () => "test-token",
}));

vi.mock("@/components/chat/ChatActionCard", () => ({
  ChatActionCard: ({ proposal }: any) => (
    <div
      data-testid="chat-action-card"
      data-pid={proposal?.pendingActionId}
      data-cta={proposal?.ctaLabel}
    >
      {proposal?.ctaLabel ?? "Approve & send"}
    </div>
  ),
  default: ({ proposal }: any) => (
    <div
      data-testid="chat-action-card"
      data-pid={proposal?.pendingActionId}
      data-cta={proposal?.ctaLabel}
    >
      {proposal?.ctaLabel ?? "Approve & send"}
    </div>
  ),
}));

// RED: import fails today — Wave 3 ships the component.
import PingButton from "@/components/floor/PingButton";

describe("Phase 7 / <PingButton/> propose-and-confirm reuse (RED — flips GREEN in Wave 3)", () => {
  it("component is exported from @/components/floor/PingButton", () => {
    expect(PingButton).toBeDefined();
  });

  it("renders a read-only preview of the agent's English draft before click", () => {
    const draft =
      "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen the Darb agent.";
    const { container } = render(
      <PingButton
        driverId="drv-stale-1"
        intent="WARN_GPS_STALE"
        draftBodyEnglish={draft}
      />,
    );
    expect(container.textContent).toContain(draft);
  });

  it("clicking the button POSTs /api/floor/ping/:driverId with {intent, bodyEnglish}", async () => {
    const api = await import("@/lib/api");
    const draft =
      "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen the Darb agent.";
    const { getByRole } = render(
      <PingButton
        driverId="drv-stale-1"
        intent="WARN_GPS_STALE"
        draftBodyEnglish={draft}
      />,
    );
    fireEvent.click(getByRole("button", { name: /ping|send/i }));
    await waitFor(() => {
      expect(api.default.post).toHaveBeenCalledWith(
        "/api/floor/ping/drv-stale-1",
        expect.objectContaining({
          intent: "WARN_GPS_STALE",
          bodyEnglish: draft,
        }),
      );
    });
  });

  it("on success, renders <ChatActionCard proposal={{pendingActionId, ctaLabel:'Send via Darb'}}/>", async () => {
    const draft =
      "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen the Darb agent.";
    const { getByRole, findByTestId } = render(
      <PingButton
        driverId="drv-stale-1"
        intent="WARN_GPS_STALE"
        draftBodyEnglish={draft}
      />,
    );
    fireEvent.click(getByRole("button", { name: /ping|send/i }));
    const card = await findByTestId("chat-action-card");
    expect(card.getAttribute("data-pid")).toBe("pa-123");
    expect(card.getAttribute("data-cta")).toBe("Send via Darb");
  });

  it("POST 500 surfaces an inline error and re-enables the button", async () => {
    const api = await import("@/lib/api");
    (api.default.post as any).mockRejectedValueOnce(new Error("boom"));
    const { getByRole, container } = render(
      <PingButton
        driverId="drv-stale-1"
        intent="WARN_GPS_STALE"
        draftBodyEnglish="Hi Abdullah, your GPS hasn't updated in 15 minutes."
      />,
    );
    const btn = getByRole("button", { name: /ping|send/i }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent ?? "").toMatch(/error|failed/i);
    });
    expect(btn.disabled).toBe(false);
  });

  it("DEFERRAL: the component does NOT call WhatsApp/SMS APIs directly (Phase 9 wires real send)", async () => {
    const api = await import("@/lib/api");
    const draft =
      "Hi Abdullah, your GPS hasn't updated in 15 minutes. Please reopen Darb.";
    const { getByRole } = render(
      <PingButton
        driverId="drv-stale-1"
        intent="WARN_GPS_STALE"
        draftBodyEnglish={draft}
      />,
    );
    fireEvent.click(getByRole("button", { name: /ping|send/i }));
    await waitFor(() => {
      expect(api.default.post).toHaveBeenCalledWith(
        "/api/floor/ping/drv-stale-1",
        expect.any(Object),
      );
    });
    // No direct POST to a WhatsApp / SMS provider — only the
    // tenant-scoped /api/floor/ping endpoint.
    const calls = (api.default.post as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    for (const url of calls) {
      expect(String(url)).not.toMatch(/whatsapp|twilio|sms\.gateway|messagebird/i);
    }
  });
});

// RED — turned GREEN by Wave 3
