/**
 * refresh-darb2-demo.ts — CLI wrapper over demoRefreshService.
 *
 * Everything a stale demo needs before a client review: sweep yesterday's
 * abandoned in-flight orders, bring the courier roster back on shift with
 * fresh GPS, open a few incidents, and put a few orders genuinely at risk so
 * the SOS and Jeopardy tabs are worked examples rather than empty states.
 *
 * The logic lives in src/services/demoRefreshService.ts so it ships with the
 * serverless bundle and the daily cron can run the same thing.
 *
 * Run: cd backend && DEMO_REFRESH_ENABLED=true npx tsx prisma/refresh-darb2-demo.ts
 */
import { refreshDemoData, isDemoRefreshEnabled } from "../src/services/demoRefreshService";

async function main() {
  if (!isDemoRefreshEnabled()) {
    console.log("DEMO_REFRESH_ENABLED is not 'true' — refusing to write demo data.");
    process.exitCode = 1;
    return;
  }
  const result = await refreshDemoData();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors?.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  // Importing the service pulls in the Redis event bus and the BullMQ dispatch
  // queue, whose open connections keep the event loop alive forever. Nothing
  // here needs them, so exit explicitly rather than hanging after the work is
  // done. (Under the serverless cron the same import is already warm and the
  // request simply returns.)
  .finally(() => process.exit(process.exitCode ?? 0));
