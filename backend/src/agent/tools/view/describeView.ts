import { z } from "zod";
import { defineTool, toolRegistry } from "../../registry";

/**
 * Phase 4 Wave 1 — `describeView` agent tool.
 *
 * The ONLY way the chat agent emits a structured UI description. The frontend
 * (Wave 3 ChatViewRenderer) renders the returned `view` inline alongside the
 * assistant's text answer; the user can pin it to Home via the PinnedViewsRail
 * (Wave 4). Pure transform — no DB writes, no approval gate, side-effect: "read".
 *
 * Schema shape: `{ viewType: <discriminant>, spec: <variant payload> }`. The
 * envelope keeps the Zod discriminated union tractable (each branch validates
 * its own `spec`) and aligns 1:1 with the GeneratedView TypeScript type in
 * frontend/src/types/chat.ts so end-to-end shape parity is enforced by the
 * compiler on both sides.
 *
 * Nine variants:
 *   kpi_strip        — 1-6 tiles with delta + tone
 *   table            — sortable/exportable rows
 *   time_series      — line / area chart
 *   bar_chart        — grouped / stacked bars
 *   mini_map         — Leaflet markers + cluster
 *   comparison_cards — side-by-side metric cards
 *   callout          — info/warning/danger/success banner
 *   action_card      — ≤3 buttons (each may carry a nextPrompt or toolName)
 *   draft_message    — bilingual courier message draft (Phase 4 ships En slot only)
 *
 * REQ-chat-generated-dashboards + REQ-chat-global-access.
 */

// ─── Per-variant spec schemas ────────────────────────────────────────────────

const KpiStripSpec = z.object({
  title: z.string().optional(),
  tiles: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z
          .object({ pct: z.number(), direction: z.enum(["up", "down"]) })
          .nullable()
          .optional(),
        tone: z
          .enum([
            "positive",
            "negative",
            "neutral",
            "success",
            "warning",
            "danger",
          ])
          .optional(),
      }),
    )
    .min(1)
    .max(6),
});

const TableSpec = z.object({
  title: z.string().optional(),
  columns: z.array(z.union([z.string(), z.object({
    key: z.string(),
    label: z.string(),
    align: z.enum(["left", "right"]).optional(),
    format: z
      .enum(["number", "currency_kd", "percent", "date", "text"])
      .optional(),
  })])).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  sortable: z.boolean().optional(),
  exportable: z.boolean().optional(),
});

const TimeSeriesSpec = z.object({
  title: z.string().optional(),
  // Allow either flat-data form (xKey + yKeys + data) or series[] form
  // (each series carries its own points). The Wave-0 RED fixture uses series[].
  series: z
    .array(
      z.object({
        name: z.string(),
        points: z.array(
          z.object({
            x: z.union([z.string(), z.number()]),
            y: z.number(),
          }),
        ),
      }),
    )
    .optional(),
  xKey: z.string().optional(),
  yKeys: z.array(z.string()).optional(),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
  unit: z.string().optional(),
  chartType: z.enum(["line", "area"]).optional(),
});

const BarChartSpec = z.object({
  title: z.string().optional(),
  // Wave-0 fixture uses bars[]; plan also supports xKey/yKeys form.
  bars: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
      }),
    )
    .optional(),
  xKey: z.string().optional(),
  yKeys: z.array(z.string()).optional(),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
  unit: z.string().optional(),
  groupMode: z.enum(["grouped", "stacked"]).optional(),
});

const MiniMapSpec = z.object({
  title: z.string().optional(),
  center: z.tuple([z.number(), z.number()]).optional(),
  zoom: z.number().min(8).max(18).optional(),
  markers: z
    .array(
      z.object({
        id: z.string().optional(),
        lat: z.number(),
        lng: z.number(),
        color: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .min(1),
  showCluster: z.boolean().optional(),
});

const ComparisonCardsSpec = z.object({
  title: z.string().optional(),
  // Wave-0 fixture uses cards[]; plan also supports items[].
  cards: z
    .array(
      z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        value: z.string().optional(),
        metrics: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional(),
        tone: z.enum(["success", "neutral", "warning", "danger"]).optional(),
      }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        metrics: z.array(
          z.object({ label: z.string(), value: z.string() }),
        ),
        tone: z.enum(["success", "neutral", "warning", "danger"]).optional(),
      }),
    )
    .optional(),
});

const CalloutSpec = z.object({
  // Wave-0 fixture uses `severity`; plan uses `tone`. Accept both.
  severity: z.enum(["info", "warning", "danger", "success"]).optional(),
  tone: z.enum(["info", "warning", "danger", "success"]).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

const ActionCardSpec = z.object({
  title: z.string().optional(),
  ctaLabel: z.string().optional(),
  pendingActionId: z.string().optional(),
  buttons: z
    .array(
      z.object({
        label: z.string(),
        intent: z.enum(["primary", "secondary", "destructive"]),
        nextPrompt: z.string().optional(),
        toolName: z.string().optional(),
        toolArgs: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(3)
    .optional(),
});

const DraftMessageSpec = z.object({
  // Wave-0 fixture uses string `recipient` + `body`. Plan adds richer
  // recipient object + bodyEn/bodyAr. Accept both forms.
  recipient: z.union([
    z.string(),
    z.object({
      driverId: z.string(),
      driverName: z.string(),
      phone: z.string().optional(),
    }),
  ]),
  channel: z.enum(["whatsapp", "sms", "inbox", "WHATSAPP", "SMS", "IN_APP"]).optional(),
  body: z.string().optional(),
  bodyEn: z.string().optional(),
  bodyAr: z.string().optional(),
  intent: z.string().optional(),
});

// ─── Top-level envelope: { viewType, spec } discriminated union ──────────────

export const describeViewInputSchema = z.discriminatedUnion("viewType", [
  z.object({ viewType: z.literal("kpi_strip"), spec: KpiStripSpec }),
  z.object({ viewType: z.literal("table"), spec: TableSpec }),
  z.object({ viewType: z.literal("time_series"), spec: TimeSeriesSpec }),
  z.object({ viewType: z.literal("bar_chart"), spec: BarChartSpec }),
  z.object({ viewType: z.literal("mini_map"), spec: MiniMapSpec }),
  z.object({ viewType: z.literal("comparison_cards"), spec: ComparisonCardsSpec }),
  z.object({ viewType: z.literal("callout"), spec: CalloutSpec }),
  z.object({ viewType: z.literal("action_card"), spec: ActionCardSpec }),
  z.object({ viewType: z.literal("draft_message"), spec: DraftMessageSpec }),
]);

export type DescribeViewInput = z.infer<typeof describeViewInputSchema>;

// JSON Schema mirror for Anthropic strict mode — uses oneOf branches with
// `additionalProperties: false` on every object. Anthropic accepts oneOf with
// a discriminator field; tools/registry sets `strict: true` when
// inputSchema.additionalProperties is false.
const jsonSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["viewType", "spec"],
  properties: {
    viewType: {
      type: "string",
      enum: [
        "kpi_strip",
        "table",
        "time_series",
        "bar_chart",
        "mini_map",
        "comparison_cards",
        "callout",
        "action_card",
        "draft_message",
      ],
      description: "Which view variant to render.",
    },
    spec: {
      type: "object",
      description:
        "Spec for the chosen viewType. See tool description for required fields per variant.",
    },
  },
};

export const describeViewTool = defineTool({
  name: "describeView",
  description:
    "Describe a UI view (kpi_strip / table / time_series / bar_chart / mini_map / comparison_cards / callout / action_card / draft_message) to render alongside your text answer. Call AFTER you've gathered real numbers via read tools. The frontend renders this view inline; the user can pin it to Home. Pure transform — no side effects. Envelope: { viewType, spec }. Each viewType has its own spec shape — kpi_strip.tiles[], table.columns+rows, time_series.series[] or xKey/yKeys+data, bar_chart.bars[], mini_map.markers[], comparison_cards.cards[], callout.severity+message, action_card.title+ctaLabel, draft_message.recipient+body.",
  inputSchema: jsonSchema,
  inputValidator: describeViewInputSchema,
  strict: true,
  sideEffect: "read",
  requiredRole: ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "VIEWER"],
  requiresApproval: false,
  // Temporarily kept registered but not exposed to Claude. Newer Anthropic
  // schema validation rejects this broad visualization envelope; chat should
  // still work with text + read/action tools while the view schema is tightened.
  allowedAgents: [],
  async execute(_ctx, input) {
    // Pure passthrough — the runtime captures `output.view` and pushes it
    // down the SSE stream as a view_block event, and also returns the
    // collected views on RunAgentResult.views.
    return { ok: true as const, view: input };
  },
});

export function registerDescribeViewTool() {
  toolRegistry.register(describeViewTool);
}

registerDescribeViewTool();
