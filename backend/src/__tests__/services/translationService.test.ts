/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when
 * `backend/src/services/translationService.ts` exports translateToArabic with
 * the documented Anthropic-call shape + Khaleeji register + UTF-8 override strip.
 *
 * Contract (from 09-00-PLAN.md):
 *   type TranslationContext { audience; register: 'khaleeji'|'msa';
 *     preserveLatinTokens?: string[] }
 *   translateToArabic(en: string, ctx: TranslationContext): Promise<string>
 *
 * Anthropic SDK is mocked so no live API call fires.
 */

// Mock the Anthropic SDK BEFORE require'ing the service.
jest.mock("@anthropic-ai/sdk", () => {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: "text", text: "مرحبا محمد" }],
  });
  const ctor = jest.fn().mockImplementation(() => ({
    messages: { create },
  }));
  return { __esModule: true, default: ctor, _create: create };
});

function loadService() {
  return require("../../services/translationService");
}

describe("translateToArabic — Wave 0 RED", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "anth-test-key";
    jest.clearAllMocks();
  });

  test("returns a non-empty string when Anthropic returns a content block", async () => {
    const { translateToArabic } = loadService();
    const result = await translateToArabic("Hi Mohamed, please clock in on time.", {
      audience: "kuwait-courier",
      register: "khaleeji",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("strips U+202D (LEFT-TO-RIGHT OVERRIDE) and U+202E (RIGHT-TO-LEFT OVERRIDE) from output (security)", async () => {
    // Inject the override chars into the mocked response.
    const sdk = require("@anthropic-ai/sdk");
    (sdk._create as jest.Mock).mockResolvedValueOnce({
      content: [{ type: "text", text: "‮محمد‭ dangerous" }],
    });
    const { translateToArabic } = loadService();
    const result = await translateToArabic("Hi", {
      audience: "kuwait-courier",
      register: "khaleeji",
    });
    expect(result).not.toMatch(/‭/);
    expect(result).not.toMatch(/‮/);
  });

  test("preserves Latin tokens listed in ctx.preserveLatinTokens", async () => {
    const sdk = require("@anthropic-ai/sdk");
    (sdk._create as jest.Mock).mockResolvedValueOnce({
      content: [{ type: "text", text: "مرحبا Mohamed، أهلا بك في Darb" }],
    });
    const { translateToArabic } = loadService();
    const result = await translateToArabic("Hi Mohamed, welcome to Darb", {
      audience: "kuwait-courier",
      register: "khaleeji",
      preserveLatinTokens: ["Mohamed", "Darb"],
    });
    expect(result).toContain("Mohamed");
    expect(result).toContain("Darb");
  });

  test("passes register='khaleeji' into the Anthropic system prompt", async () => {
    const { translateToArabic } = loadService();
    await translateToArabic("Hi Mohamed", {
      audience: "kuwait-courier",
      register: "khaleeji",
    });
    const sdk = require("@anthropic-ai/sdk");
    const lastCall = (sdk._create as jest.Mock).mock.calls[0]?.[0] ?? {};
    const promptStr = JSON.stringify(lastCall);
    expect(promptStr.toLowerCase()).toMatch(/khaleeji|كويتي|kuwaiti/i);
  });

  test("throws clear error when ANTHROPIC_API_KEY missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { translateToArabic } = loadService();
    await expect(
      translateToArabic("Hi", { audience: "kuwait-courier", register: "khaleeji" }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  test("respects ctx.register='msa' (passes msa label, not khaleeji)", async () => {
    const { translateToArabic } = loadService();
    await translateToArabic("Hi Mohamed", {
      audience: "generic",
      register: "msa",
    });
    const sdk = require("@anthropic-ai/sdk");
    const lastCall = (sdk._create as jest.Mock).mock.calls[0]?.[0] ?? {};
    const promptStr = JSON.stringify(lastCall);
    // The MSA call should NOT instruct Khaleeji-specific phrasing.
    expect(promptStr.toLowerCase()).toMatch(/msa|standard|فصحى|modern/i);
  });
});
