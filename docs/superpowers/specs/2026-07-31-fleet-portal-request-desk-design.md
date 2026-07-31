# Fleet portal: documents, driver onboarding, issues and support

Date: 2026-07-31
Status: approved, building

## Problem

`/fleet-portal` is three read-only screens (roster, scorecard, payouts). A
delivery company cannot hand Darb a trade licence, cannot put a new driver
forward, cannot tell Darb a driver has resigned, cannot see how much work a
driver actually did, and has no channel to Darb at all. Everything above is
done today by WhatsApp and a phone call.

## The rule that shapes everything

**The fleet portal never writes a live record.** Every change the delivery
company wants is a *request*; Darb approves or rejects it, and the approval is
what mutates anything real. Darb governs fulfilment, and a subcontractor
putting an undocumented driver on the road without Darb seeing the documents is
the failure this design exists to prevent.

One exception, decided by the client: **the driver's phone number writes
through directly.** Drivers change SIMs constantly and a review queue between a
driver and their own phone number strands them. Note the cost: phone is the
driver app's sign-in identity, so this can log a driver out.

## Rail

Five entries, up from three: **Roster, Documents, Issues, Payouts, Support**
(scorecard stays, reachable from the roster header). Ordered by how often a
supervisor opens them, not by importance.

## Models

### FleetDocument

One table for both company and driver documents. `driverId` null means it
belongs to the company.

```
fleetPartnerId, driverId String?
type            // company: TRADE_LICENSE, COMMERCIAL_REG, CIVIL_INSURANCE, VAT_CERT
                // driver:  CIVIL_ID, DRIVING_LICENSE, VEHICLE_REG, VEHICLE_INSURANCE,
                //          HEALTH_CERT, WORK_PERMIT, FOOD_HANDLING
fileKey, fileName, mimeType, sizeBytes   // fileKey = private R2 object key
expiryDate, status                       // PENDING_REVIEW | VALID | REJECTED | EXPIRED | SUPERSEDED
rejectionReason, uploadedById, reviewedById, reviewedAt, supersededById
```

Nothing is ever deleted. Replacing a document supersedes it, so the history of
what a fleet showed Darb and when survives.

### FleetChangeRequest

The reviewable unit, and the reason this is a table rather than a pending flag
on each record: "Anil resigned" has no record of its own to carry a flag.

```
fleetPartnerId, type    // DRIVER_ONBOARD | DRIVER_STATUS | DRIVER_PROFILE
                        // | DRIVER_DOCUMENT | COMPANY_DOCUMENT
driverId String?, payload Json, documentIds String[]
status                  // PENDING | APPROVED | REJECTED | WITHDRAWN
requestedById, reviewedById, reviewedAt, reviewNote
```

**A pending driver has no `Driver` row.** Approval creates it. A rejected
submission therefore cannot leave a half-driver in the dispatch candidate pool,
and `Driver.status` keeps meaning exactly what it means today. The fleet still
sees the pending driver on its own roster, drawn from the request, greyed, with
"Pending Darb review". Their documents carry `driverId = null` until approval
links them.

### FleetIssue

Darb's system opens these; the delivery company closes them. The opposite
direction of travel from Support, which is why it is a separate tab and not a
ticket type.

```
fleetPartnerId, driverId?
type      // LATE_LOGIN | NO_ORDERS | RATING_DROP | DOC_EXPIRING | ACCEPTANCE_LOW
severity  // LOW | MEDIUM | HIGH
title, detail, data Json
status    // OPEN -> ACKNOWLEDGED -> RESOLVED, or ESCALATED
dedupeKey @@unique([tenantId, dedupeKey])
openedAt, acknowledgedAt/ById, resolvedAt/ById, resolutionNote
```

Flow: the nightly sweep opens an issue. The supervisor acknowledges it ("I have
this"), calls the driver, then marks it resolved **with a note saying what they
did**. The note is required: an acknowledge button with no account of the fix
is a button that gets clicked to clear a badge. An issue open more than 48h
auto-escalates and shows on Darb's side against that fleet.

`dedupeKey` is what stops the sweep raising the same issue nightly. Format
`{type}:{driverId}:{YYYY-MM-DD}` or `{type}:{driverId}` for the standing ones.

Detection rules, v1, all computable from data that already exists:

| Type | Opens when |
|---|---|
| `NO_ORDERS` | ACTIVE driver, zero delivered orders for 3 consecutive days |
| `RATING_DROP` | 7-day average below 4.0 over at least 5 ratings |
| `DOC_EXPIRING` | any document expiring within 14 days, or already expired |
| `LATE_LOGIN` | ACTIVE driver with no online session by 11:00 Kuwait time |
| `ACCEPTANCE_LOW` | 7-day offer acceptance below 60% over at least 10 offers |

### SupportTicket

`vendorId` drops NOT NULL and gains `fleetPartnerId String?`, exactly one set.
One staff inbox rather than a duplicate ticket table. Staff read fleet tickets
at `/api/fleets/:id/support`, mirroring `/api/vendors/:id/support`.

## Keeping existing surfaces working

Approving a document also writes the matching `Driver.<doc>Expiry` and
`<doc>Status` pair. `FleetDocument` is the file and the audit trail; the
`Driver` columns stay the read model. `docsSummary` on the roster, the staff
driver profile and the expiry alerts all keep working with no change.

## Orders per day

`GET /api/fleet/drivers` gains `ordersToday` and `ordersLast7d` from a single
`groupBy` on `driverId`, not a query per driver. The profile's month view is a
second `groupBy` bucketed by day.

Kuwait is UTC+3 with no DST, so day boundaries are computed on a fixed +03:00
offset. Bucket on UTC and a driver's evening orders land on tomorrow.

## Routes

Fleet (`/api/fleet`, the first writes this router has had):

| Route | Does |
|---|---|
| `GET /documents` | company documents |
| `POST /documents/upload-url` | presigned R2 PUT, 5 min |
| `POST /documents` | record after upload, opens a request |
| `GET /drivers/:id` | profile: details, documents, activity, open requests |
| `GET /drivers/:id/activity?month=` | day by day delivered counts |
| `POST /drivers` | onboard request |
| `POST /drivers/:id/requests` | leave, resign, or a details change |
| `PATCH /drivers/:id/phone` | the one direct write |
| `GET /requests` | own submissions and outcomes |
| `POST /requests/:id/withdraw` | withdraw before review |
| `GET /issues` | open and recent issues |
| `POST /issues/:id/acknowledge` | supervisor takes it |
| `POST /issues/:id/resolve` | note required |
| `GET|POST /support`, `/support/:id/reply`, `/support/:id/cancel` | mirror of vendor support |

Staff (`/api/fleets`, OPS_MANAGER+): `GET /:id/requests`,
`POST /:id/requests/:reqId/approve`, `.../reject` (reason required),
`GET /:id/documents`, `GET /documents/:docId/url` (signed GET, 1 hour),
`GET /:id/support` + reply, `GET /requests/pending-count` for the badge.

## R2 is not switched on

`pair-darb-api` production has none of `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. `POST /documents/upload-url` answers 503
`{ code: "STORAGE_NOT_CONFIGURED" }` and the UI says so plainly instead of
showing a picker that dies. Expiry dates alone still submit and still get
reviewed. Same posture as WhatsApp and MyFatoorah in this repo.

Switching it on needs the bucket, those four variables, **and a CORS rule
allowing PUT from `darbkw.vercel.app`**. The mobile app never hit that, because
React Native does not enforce CORS. A browser does.

## Making sure requests do not rot

Every new request writes a Notification for OPS_MANAGER+, and the `/fleets`
list gains a pending count column. A review queue nobody looks at is worse than
no queue.

## Tests

Auth boundaries first, house pattern with `getMockPrisma()`: a FLEET token
cannot read another partner's requests, cannot approve its own, cannot set
`fleetPartnerId` from the body, and cannot acknowledge another fleet's issue.
Then the approval transaction: approving `DRIVER_ONBOARD` creates the driver
and links the documents; rejecting leaves no `Driver` row behind.
