import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";

const CONTRACT_PROMPT = `You are extracting the per-order rate table from a signed
Americana franchise delivery contract. The contract lists rates per chain
(KFC, Pizza Hut, Hardee's, Krispy Kreme, TGI Fridays, Peet's, Wimpy, Costa,
Cinnabon, etc.) and per vehicle type (CAR or BIKE). Currency is Kuwaiti Dinar
(KWD), always 3 decimal places.

Return ONLY a valid JSON object of the form:
{
  "confidence": 0.85,
  "rates": [
    { "chainName": "KFC", "vehicleType": "CAR", "ratePerOrder": 0.650 },
    { "chainName": "KFC", "vehicleType": "BIKE", "ratePerOrder": 0.550 }
  ]
}

Rules:
- confidence is 0..1 on how certain you are about the whole extraction
- If a row lists only one vehicle type, return only that row
- Normalize chain names to their English canonical form (e.g. "كيه إف سي" → "KFC")
- Skip rows that do not have a clear numeric rate
- Do not output any prose, markdown, or explanation
`;

export interface ExtractedRate {
  chainName: string;
  vehicleType: string;
  ratePerOrder: number;
}

export async function extractContractRates(pdfPath: string): Promise<{ confidence: number | null; rates: ExtractedRate[] } | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const absolute = path.isAbsolute(pdfPath)
    ? pdfPath
    : path.join(__dirname, "..", "..", pdfPath.replace(/^\/?/, ""));
  if (!fs.existsSync(absolute)) {
    logger.warn({ absolute }, "[americanaContractOcr] pdf not found");
    return null;
  }
  const buffer = fs.readFileSync(absolute);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: CONTRACT_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
          } as any,
          { type: "text", text: "Extract the rate table as JSON." },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return null;
  const match = content.text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return {
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: pull the contract PDF, extract rates with Claude vision,
 * store them as a draft on the AmericanaContract row. No AmericanaChainRate
 * rows are created — that happens when the human clicks Save on the review UI.
 */
export async function enqueueContractOcr(contractId: string): Promise<void> {
  const contract = await prisma.americanaContract.findUnique({ where: { id: contractId } });
  if (!contract) return;
  if (!env.ANTHROPIC_API_KEY) {
    await prisma.americanaContract.update({
      where: { id: contractId },
      data: { ocrStatus: "FAILED" },
    }).catch(() => {});
    return;
  }

  await prisma.americanaContract.update({
    where: { id: contractId },
    data: { ocrStatus: "PROCESSING" },
  });

  try {
    const result = await extractContractRates(contract.originalFileUrl);
    if (!result) {
      await prisma.americanaContract.update({
        where: { id: contractId },
        data: { ocrStatus: "FAILED" },
      });
      return;
    }
    await prisma.americanaContract.update({
      where: { id: contractId },
      data: {
        ocrStatus: "DONE",
        ocrExtractedAt: new Date(),
        ocrConfidence: result.confidence,
        ocrDraftRates: result.rates as any,
      },
    });
  } catch (err: any) {
    logger.error({ err, contractId }, "[americanaContractOcr] extraction failed");
    await prisma.americanaContract.update({
      where: { id: contractId },
      data: { ocrStatus: "FAILED" },
    }).catch(() => {});
  }
}
