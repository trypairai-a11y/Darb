import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SlaCountdown from "@/components/darb/SlaCountdown";

// useI18n falls back to the real English message table when no provider is
// mounted, so these assert the strings a supervisor actually sees.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A deadline `ms` in the future (negative = that far in the past). */
function deadlineIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe("SlaCountdown", () => {
  it("renders an em-dash when there is no deadline", () => {
    render(<SlaCountdown deadline={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders an em-dash when the deadline is unparseable", () => {
    render(<SlaCountdown deadline="not-a-date" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("counts down in mm:ss while the order is still savable", () => {
    render(<SlaCountdown deadline={deadlineIn(25 * MINUTE)} />);
    expect(screen.getByText(/^2[45]:\d{2}$/)).toBeInTheDocument();
  });

  it("keeps mm:ss for the first hour past the deadline", () => {
    render(<SlaCountdown deadline={deadlineIn(-20 * MINUTE)} />);
    expect(screen.getByText(/^-(19|20):\d{2}$/)).toBeInTheDocument();
  });

  it("switches to whole hours once an hour overdue", () => {
    render(<SlaCountdown deadline={deadlineIn(-2 * HOUR - 5 * MINUTE)} />);
    expect(screen.getByText("2h late")).toBeInTheDocument();
  });

  it("switches to whole days once a day overdue", () => {
    render(<SlaCountdown deadline={deadlineIn(-6 * DAY - HOUR)} />);
    expect(screen.getByText("6d late")).toBeInTheDocument();
  });

  // The regression this format exists for: a stalled order left over a long
  // weekend rendered "-8459:30" and became the loudest number on the ops
  // screen while carrying no information at all.
  it("never renders an unbounded minute count for a long-stalled order", () => {
    const { container } = render(<SlaCountdown deadline={deadlineIn(-6 * DAY - HOUR)} />);
    expect(container.textContent).not.toMatch(/-\d{3,}:/);
  });

  it("tones a breached deadline red and a healthy one green", () => {
    const { container: late } = render(<SlaCountdown deadline={deadlineIn(-2 * HOUR)} />);
    expect((late.firstChild as HTMLElement).className).toContain("text-red-600");

    const { container: healthy } = render(<SlaCountdown deadline={deadlineIn(25 * MINUTE)} />);
    expect((healthy.firstChild as HTMLElement).className).toContain("text-green-700");
  });
});
