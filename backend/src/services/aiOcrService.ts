import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

// ─── Platform-specific return types ─────────────────────────────────────────

export interface KeetaOcrResult {
  platform: "KEETA";
  date: string | null;
  deliveryCount: number | null;
  distanceKm: number | null;
  orderIds: string[];
  shiftValid: boolean | null;
  plannedHours: number | null;
  actualHours: number | null;
}

export interface TalabatOcrResult {
  platform: "TALABAT";
  date: string | null;
  deliveries: number | null;
  distanceKm: number | null;
  tipsKD: number | null;
  cashCollectedKD: number | null;
  sessionDetails: Record<string, unknown> | null;
}

export interface DeliverooOcrResult {
  platform: "DELIVEROO";
  date: string | null;
  cashKD: number | null;
  tipsKD: number | null;
  deliveryCount: number | null;
  unassignedCount: number | null;
  orders: Array<{
    restaurant: string;
    orderNum: string;
    assignedTime: string;
    deliveredTime: string;
  }>;
}

export interface AmericanaOcrResult {
  platform: "AMERICANA";
  totalOrders: number | null;
  totalAmountKD: number | null;
  paymentBreakdown: {
    COD: number | null;
    CCOD: number | null;
    PAID: number | null;
  };
  orders: Array<{
    orderId: string; // KUW_ format
    amount: number;
    posNumber: string;
  }>;
}

export type OcrResult =
  | KeetaOcrResult
  | TalabatOcrResult
  | DeliverooOcrResult
  | AmericanaOcrResult;

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a precise OCR extraction assistant specializing in delivery app screenshots from Kuwait.

Context:
- Currency: Kuwaiti Dinar (KD), always 3 decimal places (e.g., 1.500 KD)
- Apps may show text in Arabic, English, or bilingual
- Extract all visible numeric and text data accurately
- If a value is not visible or unclear, return null for that field
- Return ONLY valid JSON, no markdown, no explanation

Platform-specific extraction rules:

KEETA:
{
  "platform": "KEETA",
  "date": "YYYY-MM-DD or null",
  "deliveryCount": number or null,
  "distanceKm": number or null,
  "orderIds": ["array of order IDs visible"],
  "shiftValid": true/false/null,
  "plannedHours": number (decimal hours) or null,
  "actualHours": number (decimal hours) or null
}

TALABAT:
{
  "platform": "TALABAT",
  "date": "YYYY-MM-DD or null",
  "deliveries": number or null,
  "distanceKm": number or null,
  "tipsKD": number (3 decimal places) or null,
  "cashCollectedKD": number (3 decimal places) or null,
  "sessionDetails": object with any extra session data visible, or null
}

DELIVEROO:
{
  "platform": "DELIVEROO",
  "date": "YYYY-MM-DD or null",
  "cashKD": number (3 decimal places) or null,
  "tipsKD": number (3 decimal places) or null,
  "deliveryCount": number or null,
  "unassignedCount": number or null,
  "orders": [
    {
      "restaurant": "name",
      "orderNum": "order number",
      "assignedTime": "HH:MM",
      "deliveredTime": "HH:MM"
    }
  ]
}

AMERICANA:
{
  "platform": "AMERICANA",
  "totalOrders": number or null,
  "totalAmountKD": number (3 decimal places) or null,
  "paymentBreakdown": {
    "COD": number or null,
    "CCOD": number or null,
    "PAID": number or null
  },
  "orders": [
    {
      "orderId": "KUW_XXXXXXXX",
      "amount": number (3 decimal places),
      "posNumber": "POS number string"
    }
  ]
}

Return only the JSON object matching the detected platform.`;

// ─── Service ─────────────────────────────────────────────────────────────────

export class AiOcrService {
  /**
   * Process a delivery-app screenshot and extract structured data using
   * Claude Vision (claude-sonnet-4-6).
   *
   * @param imageBuffer - Raw image bytes (PNG / JPEG)
   * @param platform    - One of KEETA | TALABAT | DELIVEROO | AMERICANA
   * @returns Structured OCR result or null on failure
   */
  static async processScreenshot(
    imageBuffer: Buffer,
    platform: string
  ): Promise<OcrResult | null> {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn("[AiOcrService] ANTHROPIC_API_KEY is not set - skipping OCR");
      return null;
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    // Detect MIME type from magic bytes
    const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/jpeg";
    const base64Image = imageBuffer.toString("base64");

    const userPrompt = `Extract all delivery data from this ${platform} screenshot. Return the JSON object for the ${platform} platform format only.`;

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Strip any accidental markdown fences
      const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();

      const parsed = JSON.parse(cleaned) as OcrResult;
      return parsed;
    } catch (err) {
      console.error("[AiOcrService] Error processing screenshot:", err);
      return null;
    }
  }

  /**
   * Extract Deliveroo "My deliveries" daily totals (cash, tips, deliveries,
   * unassigned, hourly buckets) from a rider's screenshot. Returns null on
   * failure. Uses src/services/ocrPrompts/deliveroo.md.
   */
  static async extractDeliverooMetrics(
    imageBuffer: Buffer
  ): Promise<DeliverooMetricsOcrResult | null> {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn(
        "[AiOcrService] ANTHROPIC_API_KEY not set - skipping Deliveroo metrics OCR"
      );
      return null;
    }

    const promptPath = path.join(__dirname, "ocrPrompts", "deliveroo.md");
    const systemPrompt = fs.readFileSync(promptPath, "utf8");

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/jpeg";
    const base64Image = imageBuffer.toString("base64");

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: base64Image },
              },
              {
                type: "text",
                text: "Extract Deliveroo daily totals from this screenshot and return JSON only.",
              },
            ],
          },
        ],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();
      const parsed = JSON.parse(cleaned) as DeliverooMetricsOcrResult;
      return parsed;
    } catch (err) {
      console.error("[AiOcrService] extractDeliverooMetrics failed:", err);
      return null;
    }
  }

  /**
   * Extract Talabat end-of-shift metrics (utr / ordersCompleted / onlineHours /
   * earnings) from a rider's in-app stats screenshot. Returns null on failure.
   *
   * Uses the dedicated prompt at src/services/ocrPrompts/talabat.md.
   */
  static async extractTalabatMetrics(
    imageBuffer: Buffer
  ): Promise<TalabatMetricsOcrResult | null> {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn(
        "[AiOcrService] ANTHROPIC_API_KEY not set - skipping Talabat metrics OCR"
      );
      return null;
    }

    const promptPath = path.join(__dirname, "ocrPrompts", "talabat.md");
    const systemPrompt = fs.readFileSync(promptPath, "utf8");

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/jpeg";
    const base64Image = imageBuffer.toString("base64");

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: base64Image },
              },
              {
                type: "text",
                text: "Extract Talabat end-of-shift metrics from this screenshot and return JSON only.",
              },
            ],
          },
        ],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();
      const parsed = JSON.parse(cleaned) as TalabatMetricsOcrResult;
      return parsed;
    } catch (err) {
      console.error("[AiOcrService] extractTalabatMetrics failed:", err);
      return null;
    }
  }
}

export interface TalabatMetricsOcrResult {
  shiftDate: string | null;
  utr: number | null;
  ordersCompleted: number | null;
  onlineHours: number | null;
  earnings: number | null;
  confidence: number;
}

export interface DeliverooMetricsOcrResult {
  shiftDate: string | null;
  codCollectedKwd: number | null;
  tipsKwd: number | null;
  deliveriesCount: number | null;
  unassignedCount: number | null;
  hourlyBuckets: number[] | null;
  sectionLabel: string | null;
  confidence: number;
}
