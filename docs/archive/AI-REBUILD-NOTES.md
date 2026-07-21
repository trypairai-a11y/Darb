# Darb AI-Everywhere Rebuild — Foundation Drop

This drop lays the first load-bearing pieces of the rebuild. It's additive — nothing was removed or refactored yet — so you can ship it incrementally while we expand.

## What was decided (from your answers)

- **Money:** stays SaaS per-courier/month. No add-on tiers (kept simple).
- **Productivity targets:** couriers and fleet owners.
- **Priority platform:** Keeta first.
- **AI strategy:** Hybrid — Claude Sonnet 4.6 for reasoning, Haiku 4.5 for cheap copy-writing, agentic tool-use loop. (Recommended.)
- **Surfaces:** Owner page-level copilot + predictive insights everywhere; courier suggestions pushed inside the existing Expo app.
- **Constraint:** GCC data residency (Anthropic via region-routed proxy; no third-party LLMs).
- **Scope:** Refactor in place — don't rebuild the chassis, replace the brain.

## Files added

| Path | Purpose |
|---|---|
| `backend/src/services/aiChiefOfStaffService.ts` | Owner AI Chief of Staff: briefing, ask-anything, decide, forecast. Tenant-scoped tool-use loop on Sonnet 4.6. |
| `backend/src/routes/aiChiefOfStaff.ts` | `POST /api/ai/cos` and `GET /api/ai/cos/briefing`. |
| `backend/src/services/courierSuggestionEngine.ts` | Generates ranked, bilingual EN/AR suggestion cards for each courier. Cheap (Haiku) for copy, deterministic for ranking. |
| `backend/src/routes/courierSuggestions.ts` | `GET /api/courier/:driverId/suggestions`. |
| `frontend/src/app/(dashboard)/keeta/copilot/page.tsx` | Owner copilot page: morning briefing + decision buttons + ask-anything chat (bilingual). |
| `mobile/src/components/AiSuggestionFeed.tsx` | Horizontal swipeable AI suggestion cards for the courier app home screen. |

## Wire-up needed (under 10 minutes)

### 1. Register the new routes
In `backend/src/index.ts` (or wherever routes are mounted), add:
```ts
import aiChiefOfStaffRouter from "./routes/aiChiefOfStaff";
import courierSuggestionsRouter from "./routes/courierSuggestions";

app.use("/api/ai/cos", aiChiefOfStaffRouter);
app.use("/api/courier", courierSuggestionsRouter);
```

### 2. Mobile: drop the suggestion feed onto the home screen
```tsx
import AiSuggestionFeed from "../components/AiSuggestionFeed";
// inside the home screen, above the shift list:
<AiSuggestionFeed driverId={user.driverId} language={lang} />
```

### 3. Sidebar entry for the copilot
Add to the Keeta sidebar nav: `Copilot → /keeta/copilot` (Sparkles icon).

### 4. Env
`ANTHROPIC_API_KEY` already used by existing services — no new env vars.

## What this unlocks (commercial framing)

| Capability | Owner pain it removes | $ lever |
|---|---|---|
| Morning briefing | "I open 5 dashboards each morning to know what happened." | Retention; daily habit; expansion seats. |
| Ask-anything | "I ask my analyst, wait a day for a CSV." | Replaces analyst hours; justifies higher per-courier price. |
| Decide-for-me | "I don't know which lever to pull tonight." | Direct revenue lift via incentive/area decisions. |
| Forecast 24h | "I find out about supply gaps after they hurt me." | Fewer missed orders → higher GMV → defensible per-courier pricing. |
| Courier suggestions | Couriers idle in wrong areas, miss bonuses, don't appeal. | More orders/courier (top-line) + fewer churn losses. |

## Next-best moves (when you want me to keep going)

1. **Forecast service** — replace the SQL baseline in `aiChiefOfStaffService.execTool('areaDemandForecast')` with a real model (Prophet or a small XGBoost on `Order` history). 1 day.
2. **Auto-appeals agent** — Claude Agent SDK loop that drafts and files violation appeals using the existing `Appeal` model. Targets 30–50% overturn rate baseline.
3. **Scraper hardening** — Playwright cluster with Claude-vision fallback when DOM selectors break. Most fragile failure mode in the system today.
4. **Per-page copilot** — extend `AskDarbPalette` to be page-context-aware (driver detail, violation detail, etc.), powered by `/api/ai/cos`.
5. **Notification rewrite** — pipe `CourierSuggestionEngine` output into the existing Notification model so suggestions also fire as push.
6. **Pricing instrumentation** — emit a `usage` event per AI call (model, tokens, tenant, surface) so you can charge correctly later if you ever change your mind on add-ons.

## Risks I want you to know

- **Tool SQL is raw** — I used `$queryRawUnsafe` for speed in three places (`revenueByDay`, `courierLeaderboard`, etc.). Wrap with a query helper that whitelists table/column names before production. This is a known SQL-injection surface even though `tenantId` is parameterized.
- **Briefing isn't cached yet** — every page load runs an LLM call. Add Redis cache keyed on `tenant + date` with a 1h TTL before exposing to many tenants.
- **Courier suggestion fallback** is hand-written copy if the LLM is unreachable. Localize the strings further once you have a translator review.
