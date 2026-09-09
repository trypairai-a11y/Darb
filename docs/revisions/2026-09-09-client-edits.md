# Client revision 19

Source: Client-Requirements-and-Revision-Notes-Darb.docx, ten edits.

1. Company roster has independent activation and account-freeze controls. Mutations require OPS_MANAGER or ADMIN, check tenant and company, and write an audit record. Freeze rejects existing device tokens; both freeze and deactivation close online sessions. Manual dispatch excludes frozen/inactive drivers.
2. Warned/throttled companies can return to normal from their profile. The existing audited discipline override clears driver throttling.
3. Emergency cards show current active orders and offline state. Going offline closes all duplicate sessions and expires outstanding offers. GPS updates no longer create online sessions. Pre-pickup reassignment selects a current order rather than a stale report link.
4. Every fleet approval request requires attached supporting files. Onboarding requires the eight existing required document types. Expiry-only submissions fail server validation. Inline uploads are staged one file per request, then claimed by the submitting company; staged files are hidden from document lists and cannot reuse already-submitted files.
5. Confirming a failed order's physical return records the final timeline event “Order returned to vendor.” Existing failed-order state guards prevent duplicate returns.
6. Requests and Support are configurable notification categories. Saved disabled rules override defaults. Support covers fleet tickets, merchant tickets and payout disputes; account managers remain scoped to their companies.
7. Scorecard is removed from the fleet navigation, role defaults and permission picker. Its old URL redirects; staff company scorecards remain available.
8. Delivery issues filter by All, New (including escalations), Acknowledged and Resolved before pagination.
9. Driver profiles show submitted requests, status, dates, reason and review notes.
10. Driver profiles show issued inventory, return dates, condition and assigned devices, with explicit empty states.

## Validation

Backend and frontend TypeScript checks passed. The frontend production build passed using a clean package containing tracked sources and only this revision's new files. Regression coverage includes account/tenant boundaries, GPS after forced offline, offer expiry, required documents and upload ownership, issue status filtering, return events, role defaults and notification delivery.

The deployment uses the existing pair-darb and pair-darb-api Vercel projects. The additive migration adds Driver.isFrozen and FleetDocument.isStaged, both defaulting to false. Migration application is verified through Vercel build logs; no production secret export is required.

## Production release

Deployed 9 September 2026 to https://darbkw.vercel.app and https://pair-darb-api.vercel.app.

- API deployment: pair-darb-n3ukdwl13-trypairai-6527s-projects.vercel.app (READY).
- Web deployment: pair-darb-70pwy579v-trypairai-6527s-projects.vercel.app (READY).
- Migration log: 20260909120000_driver_account_freeze applied successfully; subsequent build reports no pending migrations.
- Live API /api/health returned status ok.
- Regression coverage: 316 distinct passing tests across the affected suites, including two added staging tests. Backend and frontend TypeScript checks and clean production build passed.

Live checks confirmed the roster account controls, return-to-normal action, emergency offline indicators and current-order context, notification categories, issue filters, and profile request/equipment data. Profile requests and equipment appear directly below the driver header. Company-preview navigation retains the selected company. Live checks used reads and navigation; account and order mutations are covered by regression tests.
