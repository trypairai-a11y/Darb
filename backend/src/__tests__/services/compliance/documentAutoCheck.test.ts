/**
 * Revision 20 — the compliance desk's automatic first pass.
 *
 * The point of these tests is the posture, not the arithmetic: the checker
 * SORTS a queue, it never decides. Every case below asserts that a problem
 * produces a FLAG and a coded reason, and none of them assert a rejection,
 * because the service has no way to reject and must not grow one.
 */
import {
  runAutoCheck,
  type AutoCheckInput,
} from "../../../services/compliance/documentAutoCheck";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const IN_A_YEAR = new Date("2027-09-15T12:00:00.000Z");

function input(overrides: Partial<AutoCheckInput> = {}): AutoCheckInput {
  return {
    type: "CIVIL_ID",
    hasFile: true,
    mimeType: "image/jpeg",
    sizeBytes: 250_000,
    expiryDate: IN_A_YEAR,
    scope: "DRIVER",
    ...overrides,
  };
}

const codes = (r: ReturnType<typeof runAutoCheck>) => r.notes.map((n) => n.code);

describe("runAutoCheck", () => {
  it("passes a clean driver document with nothing to say", () => {
    const result = runAutoCheck(input(), NOW);
    expect(result.verdict).toBe("PASS");
    expect(result.notes).toHaveLength(0);
    expect(result.health).toBe("VALID");
  });

  it("flags a document with no file, without refusing it", () => {
    // The fleet portal deliberately allows an expiry with no file while R2 is
    // unconfigured, so this has to be a flag rather than a hard failure.
    const result = runAutoCheck(input({ hasFile: false }), NOW);
    expect(result.verdict).toBe("FLAG");
    expect(codes(result)).toContain("NO_FILE");
  });

  it("flags a missing expiry date", () => {
    const result = runAutoCheck(input({ expiryDate: null }), NOW);
    expect(codes(result)).toContain("NO_EXPIRY");
  });

  it("does NOT ask the selfie for an expiry it does not have", () => {
    // DRIVER_SELFIE carries a column pair so it is counted and shown, but it
    // has no natural expiry. Flagging it every time would train the desk to
    // ignore the flag.
    const result = runAutoCheck(
      input({ type: "DRIVER_SELFIE", expiryDate: null }),
      NOW,
    );
    expect(codes(result)).not.toContain("NO_EXPIRY");
    expect(result.verdict).toBe("PASS");
    expect(result.health).toBe("VALID");
  });

  it("flags a document that has already expired, and says so in the health", () => {
    const result = runAutoCheck(
      input({ expiryDate: new Date("2026-01-01T00:00:00.000Z") }),
      NOW,
    );
    expect(codes(result)).toContain("ALREADY_EXPIRED");
    expect(result.health).toBe("EXPIRED");
  });

  it("flags one expiring inside the warning window", () => {
    const result = runAutoCheck(
      input({ expiryDate: new Date("2026-10-01T00:00:00.000Z") }),
      NOW,
    );
    expect(codes(result)).toContain("EXPIRES_SOON");
    expect(result.health).toBe("EXPIRING");
  });

  it("flags an expiry far enough out to be a typo", () => {
    // 2226 for 2026 is the mistake this catches; a thirty-year permit is not.
    const result = runAutoCheck(
      input({ expiryDate: new Date("2226-09-15T00:00:00.000Z") }),
      NOW,
    );
    expect(codes(result)).toContain("EXPIRY_IMPLAUSIBLE");
  });

  it("flags a file too small to be a readable scan", () => {
    const result = runAutoCheck(input({ sizeBytes: 900 }), NOW);
    expect(codes(result)).toContain("FILE_TOO_SMALL");
  });

  it("flags a file over the inline-bytes ceiling", () => {
    const result = runAutoCheck(input({ sizeBytes: 5 * 1024 * 1024 }), NOW);
    expect(codes(result)).toContain("FILE_TOO_LARGE");
  });

  it("flags something that is not a document scan format", () => {
    const result = runAutoCheck(input({ mimeType: "video/mp4" }), NOW);
    expect(codes(result)).toContain("UNSUPPORTED_FORMAT");
  });

  it("accepts the scan formats a phone actually produces", () => {
    for (const mimeType of ["application/pdf", "image/png", "image/heic", "image/webp"]) {
      expect(runAutoCheck(input({ mimeType }), NOW).verdict).toBe("PASS");
    }
  });

  it("flags a driver document submitted against a company", () => {
    const result = runAutoCheck(input({ type: "CIVIL_ID", scope: "COMPANY" }), NOW);
    expect(codes(result)).toContain("TYPE_MISMATCH");
  });

  it("flags a type nothing in the catalogue recognises", () => {
    const result = runAutoCheck(input({ type: "MOON_LICENCE" }), NOW);
    expect(codes(result)).toContain("UNKNOWN_TYPE");
  });

  it("flags a second document of the same type already waiting", () => {
    const result = runAutoCheck(input({ duplicatePending: true }), NOW);
    expect(codes(result)).toContain("DUPLICATE_PENDING");
  });

  it("collects every reason rather than stopping at the first", () => {
    // The desk opens the worst rows first, so it needs the whole list.
    const result = runAutoCheck(
      input({ hasFile: false, expiryDate: null, duplicatePending: true }),
      NOW,
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining(["NO_FILE", "NO_EXPIRY", "DUPLICATE_PENDING"]),
    );
  });

  it("only ever answers PASS or FLAG", () => {
    // The guard that matters: there is no third verdict, so nothing downstream
    // can be tempted to treat the machine's opinion as a decision.
    const cases: Partial<AutoCheckInput>[] = [
      {},
      { hasFile: false },
      { expiryDate: null },
      { sizeBytes: 1 },
      { type: "NONSENSE" },
    ];
    for (const c of cases) {
      expect(["PASS", "FLAG"]).toContain(runAutoCheck(input(c), NOW).verdict);
    }
  });
});
