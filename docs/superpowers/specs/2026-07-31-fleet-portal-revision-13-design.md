# Fleet portal revision 13: counts, dates, a team, and a payout the company signs

Date: 2026-07-31
Status: approved, building
Source: `DARB Requirements.docx` (client revision log, 8 edits, all Fleet Portal)

## Problem

Revision 12 turned the fleet portal from a noticeboard into a request desk. The
client reviewed it and came back with eight things. Six are gaps in screens
that already exist (an empty page, a missing button, missing counts, missing
dates, a wrong word). Two are new: the delivery company needs its own team of
logins, and it needs to agree with a payout before Darb pays it.

Nothing here changes the rule the portal is built on. The fleet portal still
never writes a live record; the two new write paths (confirming a payout,
minting a login inside your own company) are the company's own business, not
Darb's roster.

## Edit 1 — Delivery issues has no sample data

`/fleet-portal/issues` renders "Nothing outstanding. Good." because the nightly
sweep found nothing on demo data, which is the correct behaviour and a useless
review.

`prisma/seed-fleet-issues.ts` writes representative issues against the drivers
that already exist. **Idempotent on the same `dedupeKey` shape the sweep uses**
(`{type}:{driverId}:{YYYY-MM-DD}`), so seeding twice changes nothing and the
sweep will never raise a duplicate of a seeded row. A seeded issue is a real
row: acknowledging and resolving it goes through the same endpoints and the
same required resolution note.

Coverage, chosen so every state on the page has something in it:

| Issue | Status | What it proves on screen |
|---|---|---|
| Did not come online | OPEN, HIGH | the ordinary case |
| No orders in 3 days | OPEN, MEDIUM | severity variety |
| Rating below 4.0 | OPEN, HIGH | the data block renders |
| Accepted 40% of offers | ACKNOWLEDGED | the acknowledged state |
| Civil ID expires in 9 days | OPEN, MEDIUM | document issues link to a driver |
| Driving licence expired | ESCALATED, HIGH | the 48h escalation styling |
| Health certificate renewed | RESOLVED + note | **Show closed** reveals something |

Run against production after deploy. Local runs are the same command with a
different `DATABASE_URL`.

## Edit 2 — Add document has no import button

The file picker exists but is rendered only `{storageConfigured && ...}` on the
driver profile, and R2 is not configured on `pair-darb-api`. So in production
the panel is a document type and an expiry date, which is exactly what the
client reported. The roster's Add driver panel shows its picker unconditionally,
so the two screens already disagreed with each other.

One shared `components/fleet/DocumentFileField.tsx` used by Add document, Add
driver and the company Documents page. **Always rendered.** When storage is
off it is disabled and carries the reason underneath rather than vanishing:

> Uploads switch on when Darb enables document storage. Record the expiry date
> now and Darb will ask for the file.

Nothing is faked. With storage off the submission still records type and
expiry, and the documents table keeps saying "No file" for that row, because
that is the truth. The day `R2_ENDPOINT` and friends are set on the backend the
field goes live with no code change, since `storageConfigured` already comes
from the server on every payload.

## Edit 3 — Roster counts and the Darb ID

Four tiles above the table: **total drivers**, **Car**, **Bike**, **pending
approval**. Computed on the client from the rows the endpoint already returns
in full (the roster is not paginated), so a tile can never disagree with the
table beneath it. Pending drivers are counted in their own tile and excluded
from the total, because a driver Darb has not approved is not on the road.

New **Darb ID** column showing `Driver.driverCode` (`DRB-0001`). The roster
endpoint has to start selecting it. A pending driver reads `n/a`: the code is
issued by `nextDriverCode` at approval, and inventing one earlier would put a
number on a driver who may be rejected.

## Edits 4 and 5 — Leave and resignation dates

Both panels are a reason box today, so "Amit is on leave" reaches Darb with no
idea when he goes or comes back, which is the phone call this feature exists to
remove.

- **Request leave**: leave start date and return date, both required, return
  not before start.
- **Report resignation**: last working date, required.
- **Back to active**: unchanged, no dates.

Validated on `POST /api/fleet/drivers/:id/requests` as well as in the form, and
carried in the request payload (`leaveStartDate`, `returnDate`,
`lastWorkingDate`). Darb's review card renders them, since a date the reviewer
cannot see is a date that was not collected.

Approval still applies the status immediately. Deferring a status change until
a future date would need a scheduler, a reversal path and a story for what
happens when the driver comes back early; the dates are the information the
client asked for, and Darb approves when it is effective.

## Edit 6 — Fleet Team

A new rail entry `/fleet-portal/team`, the mirror of the merchant portal's Team
page, with the vendor's **branch** scoping replaced by **company** scoping:
Sidra, Marina and Nakheel already share an owner group (`OwnerGroup`,
`FleetPartner.ownerGroupId`, revision 1 #15/#27), and a team login is assigned
the companies within that group it may act for.

### Roles

| Role | Opens | Notes |
|---|---|---|
| OWNER | everything | the only one who can mint or edit a login |
| OPERATIONS | Roster, Issues, Documents, Support | the supervisor who calls drivers |
| FINANCE | Payouts, Scorecard, Support | sees what the company is paid |

Plus a per-user tab list (`User.fleetTabs`) that **replaces** the role default
and may widen it as well as narrow it, exactly like `vendorTabs`. `null` means
inherit, so every existing fleet login keeps working with no backfill.

Tabs: `ROSTER | ISSUES | DOCUMENTS | SCORECARD | PAYOUTS | SUPPORT | TEAM`.

### The rules carried over from the merchant portal

These were each learned the hard way on the vendor side and are not re-litigated
here:

1. **Identity comes from the User row, never the JWT.** `loadFleetIdentity`
   resolves `fleetRole`, `fleetTabs` and `fleetPartnerIds` once per request and
   caches them on the request. A token minted before an owner narrowed somebody
   must not keep opening the old screens.
2. **A refused tab is locked, not a 403 screen.** `requireFleetTab` answers
   `{ error, code: "TAB_NOT_GRANTED", tab }`; the rail draws that entry greyed
   with a padlock and the layout shows AccessRestricted.
3. **A granted tab must be able to appear.** No second role gate sitting on top
   of a tab in `navConfig`. What stays OWNER-only is the dangerous work
   (creating a login, changing what someone opens), enforced on the endpoint and
   by hiding the control, so nobody is shown a button that answers 403.
4. **Scope is a fence, not a preference.** `fleetContext` already validates the
   requested `fleetPartnerId` against the owner group; it now also intersects
   with `fleetPartnerIds` when that list is set. A login scoped to Marina cannot
   read Sidra by editing a query string.

### Schema

Three nullable columns on `User`:

```
fleetRole       String?   // OWNER | OPERATIONS | FINANCE, null = OWNER
fleetTabs       Json?     // string[], null = inherit the role default
fleetPartnerIds Json?     // string[] of FleetPartner ids, null = the whole group
```

Nullable throughout, so this ships with no backfill and every existing fleet
login is an owner of everything it could already reach.

## Edit 7 — Wallet becomes Payout

Label only, on the fleet side. `SupportTicketType.WALLET` stays as it is: one
`SupportTicket` table is what lets Darb triage merchants and delivery companies
in one inbox, and migrating an enum to fix a word on one dropdown would put that
at risk for nothing. The fleet portal renders `WALLET` as "Payout"; the
merchant portal keeps rendering it as "Wallet".

## Edit 8 — The company confirms its payout

`FleetPayoutStatement.status` widens from `FINAL | PAID` to
`FINAL | CONFIRMED | DISPUTED | PAID`. It is already a plain `String` column, so
no enum migration.

```
FINAL ──confirm──> CONFIRMED ──Darb pays──> PAID
  │                    │
  └─────dispute────────┴──> DISPUTED ──confirm──> CONFIRMED
```

- `POST /api/fleet/statements/:id/confirm` — status-guarded `updateMany` from
  `FINAL | DISPUTED`, count 0 is a 409. Stamps `confirmedAt`, `confirmedById`.
- `POST /api/fleet/statements/:id/dispute` — reason required (10 characters,
  the same bar as an issue resolution note). Stamps `disputedAt`,
  `disputeReason`, and **opens a support ticket** of type `WALLET` carrying the
  period, the order count and the total, linked back through `disputeTicketId`.
  A disagreement then lives in the inbox Darb already triages instead of in a
  WhatsApp thread.
- `postFleetPayout` refuses anything that is not `CONFIRMED` with a
  `WalletError`. This is the gate, and it sits in the service rather than the
  route so the cron, a script and the staff button are all bound by it.

**Zero-total statements still flip to PAID unconfirmed.** There is nothing to
disagree with about KD 0.000, and holding a payroll run open waiting for a
company to acknowledge a month it did no work in would be theatre.

Staff side: `/fleets` shows the confirmation state on each statement and the Pay
button is disabled until the company confirms, with the reason on the button
rather than in a 400 after the click.

## Migration

One migration, every column nullable, no destructive step:

```
ALTER TABLE "User" ADD COLUMN "fleetRole" TEXT,
                   ADD COLUMN "fleetTabs" JSONB,
                   ADD COLUMN "fleetPartnerIds" JSONB;
ALTER TABLE "FleetPayoutStatement"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "disputedAt" TIMESTAMP(3),
  ADD COLUMN "disputeReason" TEXT,
  ADD COLUMN "disputeTicketId" TEXT;
```

Generated with `prisma migrate diff` against prod and hand-read before applying:
every diff against that database proposes dropping `ChatMessage.contentTsv` and
its index, and those two lines are deleted by hand every time.

## Testing

New and extended Jest suites, house pattern (`getMockPrisma`, supertest for
route boundaries):

- `fleetTeam.test.ts` — role defaults, a tab list widening and narrowing, the
  `TAB_NOT_GRANTED` code, OWNER-only creation, the company-subset fence.
- `fleetPayoutConfirm.test.ts` — confirm from FINAL, 409 on a second confirm,
  dispute opens a ticket, `postFleetPayout` refuses an unconfirmed statement,
  zero-total still pays.
- `fleetPortalRequests.test.ts` — extended for the leave and resignation date
  validation.

Gate is "no NEW failing suites", per the house rule about the legacy red suites.

## Out of scope

- Switching R2 on. No credentials; the field explains itself until there are.
- Deferring a leave status change to its start date.
- Renaming the `WALLET` ticket enum.
- Per-company payout statements for a group. A statement belongs to one
  `FleetPartner` and always did; the team feature scopes who can see it.
