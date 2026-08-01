# Fleet cash deposits (revision 14)

Date: 2026-08-01
Status: approved, in implementation

## The problem

A driver collects COD all day. That cash sits on `DRIVER_CASH` (`DRIVER:{id}`)
until the driver personally walks it to Darb's cash desk, where a staff member
records a `Remittance` and `recordRemittance` clears the balance.

In practice the driver does not walk it to Darb. The driver hands it to their
own supervisor at the delivery company, and the company settles with Darb in
one lump. Nothing in the platform models that, so every driver's cash-on-hand
reads as outstanding indefinitely and the only way to clear it is for Darb to
record hand-ins that never physically happened.

## The shape

**Not** a per-deposit allocation, where a company submits an envelope with a
per-driver split and Darb's confirmation clears those drivers. That was the
first design and it was rejected for a good reason: it makes every driver's
balance wait on Darb's back office. A driver who paid on Monday is still shown
as owing on Wednesday because an accountant has not counted an envelope.

Instead: **a prepaid fleet cash account.**

1. The company deposits money with Darb. Darb's accountant confirms receipt.
   Only then is the company's account credited.
2. With a confirmed balance in hand, the company clears its own drivers
   whenever it likes, instantly, with no Darb involvement. The money is already
   Darb's, so there is nothing left to verify.

This is the vendor wallet relationship inverted, and it borrows the same two
disciplines: confirm-before-credit on the way in (`topUpService.confirmTopUp`),
and a guarded balance claim on the way out (`remittanceService.recordRemittance`).

## Ledger model

New `WalletOwnerType.FLEET_CASH`, ownerKey `FLEET:{fleetPartnerId}`.

**Liability-like**, so it is NOT added to `ASSET_LIKE` and CREDIT raises the
balance, exactly as `VENDOR_PAYABLE` does. The balance means: money Darb holds
for this company, not yet spent clearing its drivers.

**Per company, not per owner group.** Drivers, payout statements and the
`User.fleetPartnerIds` scoping are all per-company. A group-wide balance would
let a login fenced to Marina spend Sidra's money, which is precisely what
`fleetContext` intersects to prevent.

### Movement 1 — deposit (confirm before credit)

`FleetCashDeposit`, shaped on `VendorTopUp`:

| column | note |
|---|---|
| `fleetPartnerId` | the company the money belongs to |
| `requestedById` | which of the company's own logins submitted it |
| `amountKwd` | Decimal(10,3) |
| `method` | existing `DepositMethod`: CASH / BANK_TRANSFER / AL_MUZAINI |
| `reference` | human-quotable, `DEP-4F2A19` |
| `note`, `receiptUrl` | optional |
| `status` | `PENDING / CONFIRMED / REJECTED / CANCELLED` |
| `confirmedById`, `confirmedAt`, `rejectReason` | the staff decision |

Two deliberate divergences from `VendorTopUp`: **no payment gateway and no
public token.** A merchant top-up needs a link a stranger can open on a phone.
A fleet deposit is an envelope or a bank transfer between two companies that
both already have logins, so `/pay/{token}` has no analogue here and inventing
one would be a public surface with nothing to do.

`confirmFleetDeposit` is ONE interactive transaction:

- status-guarded `updateMany` on PENDING (count 0 = someone else claimed it)
- `postLedgerTransaction` type `FLEET_DEPOSIT`, key `fleet-deposit:{id}`
- legs: **FLEET_CASH CREDIT amount / PLATFORM_CLEARING DEBIT amount**

Claim and credit are in the same transaction, and the same repair branch
`confirmTopUp` grew the hard way applies: if the row already reads CONFIRMED
but nothing is posted under the key, post it rather than shrug. A confirmation
that dies between the flip and the posting is a company that paid and a ledger
that never heard of it.

Reject is status-guarded to PENDING too, requires a reason, and posts nothing.
Cancel is the company withdrawing its own pending deposit.

### Movement 2 — settlement (instant draw-down)

The company clears its own drivers against the confirmed balance:

- legs: **DRIVER_CASH CREDIT amount / FLEET_CASH DEBIT amount**

The driver's cash-on-hand falls and the company's deposit balance falls. Darb's
position does not move, because Darb already took the money at confirmation.

Each line writes a **`Remittance` row**, not a new table. `DepositMethod` gains
`FLEET_ACCOUNT` and `Remittance` gains a nullable `fleetPartnerId`. That keeps
`/cash-desk/history`, `GET /api/wallets/remittances`, the driver's own history
and the nightly reconciliation working untouched, and a driver's cash-clearing
history stays ONE list whether they walked to the desk or their company covered
it. The idempotency key stays `remit:{remittanceId}`.

`Remittance.receivedById` holds the fleet portal user who settled — they are a
`User` row like any other, so nothing about that column changes.

**All-or-nothing, guarded on both sides.** One interactive transaction:

1. guarded `updateMany` on the fleet account for the batch total
   (`balanceKwd >= total`) — count 0 means the deposit balance is short
2. every driver in the batch must belong to this `fleetPartnerId`
3. per line, the `balanceKwd >= amount` claim `remittanceService.ts:88` already
   uses on `DRIVER_CASH` — count 0 means that driver does not owe that much
4. any failure creates nothing

A half-applied settlement is the one outcome neither side can reconcile, the
same rule the vendor bulk import follows. Capped at 100 lines a call so it fits
inside a 60s serverless function.

**No overdraft.** The fleet account cannot go negative, unlike a vendor wallet
with its credit line. Letting a company clear drivers on money Darb has not
received is exactly what the confirmation gate exists to stop.

**Reversals are compensating transactions, never edits**, and are ACCOUNTANT-only
from the staff side. The company cannot un-settle a driver it settled by
mistake — that is a conversation with Darb, not a button.

## Surfaces

### Fleet portal — new CASH tab

`FLEET_TABS` gains `CASH`. Role defaults: **OWNER and FINANCE**. It is money, so
OPERATIONS does not get it by default; an owner can still hand it to a
supervisor through the existing per-user `User.fleetTabs` override. Both
`services/fleet/fleetTabService.ts` and `frontend/src/lib/fleetTabs.ts` change,
and `ROUTE_TABS` gains the `/fleet-portal/cash` prefix.

Every rule the fleet portal already settled applies unchanged: identity from the
User row via `loadFleetIdentity`, a refused tab answers `TAB_NOT_GRANTED` and
draws a padlock rather than a 403 screen, and no second role gate sits on the
tab in `navConfig`.

`/fleet-portal/cash` carries:

- **Balance card** — deposit balance held, and total cash-on-hand across the
  company's drivers, which is what it still has to cover.
- **Deposit form** — amount, method, reference, note. Creates a PENDING row and
  says plainly that it credits nothing until Darb confirms.
- **Settle screen** — the company's drivers with cash-on-hand above zero, an
  amount field per row, settle-in-full per row and for all, a running total
  checked against the available balance before the button enables.
- **History** — deposits with their status, and settlements.

`GET /api/fleet/drivers` gains `cashOnHandKwd`, read as one grouped query over
`WalletAccount` for the whole roster in the manner of `rosterActivity`, never a
query per driver. This is data the fleet has not seen before; it is their own
drivers' collected COD, so it is theirs.

### Staff — cash desk queue

`/cash-desk` gains a pending fleet deposits queue above the driver hand-in form,
on the same reasoning the pending change requests sit above the scorecard: some
one on the other end is waiting on it. CASH_COLLECTOR can see the queue;
Confirm and Reject are ACCOUNTANT+ via `rbac`. Confirmed deposits appear in
`/cash-desk/history`.

## Endpoints

Fleet portal, all `requireFleetTab("CASH")`:

- `GET /api/fleet/cash` — balance, drivers with cash-on-hand, recent deposits
  and settlements
- `POST /api/fleet/cash/deposits`
- `POST /api/fleet/cash/deposits/:id/cancel`
- `POST /api/fleet/cash/settle`

Staff, on `/api/wallets`:

- `GET /api/wallets/fleet-deposits?status=` — REMITTANCE_READ
- `POST /api/wallets/fleet-deposits/:id/confirm` — ACCOUNTANT, ADMIN
- `POST /api/wallets/fleet-deposits/:id/reject` — ACCOUNTANT, ADMIN

## Migrations

Two, in order, per the repo's rule that Postgres cannot use a new enum value in
the transaction that adds it:

1. `ALTER TYPE` adding `FLEET_CASH` to `WalletOwnerType`, `FLEET_DEPOSIT` to
   `WalletTxType`, `FLEET_ACCOUNT` to `DepositMethod`.
2. `FleetCashDepositStatus` (a new type, so it may be created and used in one
   transaction), the `FleetCashDeposit` table, and `Remittance.fleetPartnerId`.

Generated with `prisma migrate diff` and read by hand before applying — every
diff against prod proposes dropping `ChatMessage.contentTsv`, which must be
deleted from the script.

## Testing

House pattern: `getMockPrisma()`, delegates per suite, `jest.mock` at module
boundaries, supertest for the route auth boundaries. What has to be covered:

- confirm credits once, and a replay credits nothing
- confirm repairs a CONFIRMED row with no posting behind it
- reject posts nothing
- settle refuses when the batch total exceeds the deposit balance
- settle refuses a line above that driver's cash-on-hand, and creates NOTHING
  for the other lines in the same batch
- settle refuses a driver belonging to another company
- the CASH tab gate: a FINANCE login opens it, an OPERATIONS login gets
  `TAB_NOT_GRANTED`
