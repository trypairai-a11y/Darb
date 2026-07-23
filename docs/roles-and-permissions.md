# Darb roles and permissions

Answer to client revision **#18** ("Settings → Users: who is the ADMIN role given to?").

Every role below is **platform-wide for the Darb tenant**, not scoped per company or per
fleet. There is exactly one Darb organisation; a role decides what somebody can do across
the whole network, not which delivery company they belong to. The two exceptions are the
portal roles at the bottom, which are fenced to a single merchant or fleet.

Sources of truth: `frontend/src/hooks/useRole.ts` (hierarchy),
`backend/src/middleware/rbac.ts` (enforcement), `frontend/src/components/layout/navConfig.ts`
(which surfaces each role sees).

## Internal Darb staff

These five sit in a strict hierarchy: each one can do everything the roles below it can.

| Role | Who it is for | What it adds over the role below |
|---|---|---|
| **Admin** | Darb founders and the platform owner. Give this to as few people as possible. | Founder cockpit (revenue, margin, cash position), creating and deleting companies and vendors, wallet adjustments, creating portal users for merchants and fleets, changing anyone's role. |
| **Ops manager** | The person running the delivery network day to day. | Network configuration: zones, pricing and surcharges, vendor and fleet records, platform settings, the Settings screens. Can delete records. |
| **Supervisor** | Rider support and dispatch staff on shift. | The live control room: ops map, SOS, Jeopardy, Alerts, Zone load, and acting on orders (reassign, redispatch, cancel, edit dropoff). |
| **Accountant** | Finance. | Finance surfaces: wallet balances, remittances, reports and exports, vendor statements, fleet payouts. Read-only everywhere else. |
| **Viewer** | Observers who need visibility with no ability to change anything. | Read-only. This is the default for a newly invited user. |

Practical guidance for the client:

- **Admin** is an owner-level role. It can see the full money position and can change
  anyone else's access, so it belongs to the founders and nobody else.
- Day-to-day network changes do not need Admin. **Ops manager** covers zones, pricing,
  vendors and fleets.
- Rider support staff need **Supervisor**, not Ops manager. Supervisor deliberately cannot
  change pricing or delete records.
- **Accountant** cannot dispatch or edit orders, by design.

## Portal roles (fenced, outside the staff hierarchy)

These are not "less privileged staff". They are logins issued to people outside Darb, and
they are contained to their own data. `hasRole()` always returns false for them, so no
staff surface is ever reachable, and middleware fences the API routes they may call.

| Role | Issued to | Reaches |
|---|---|---|
| **Vendor** | A merchant (restaurant, pharmacy, retailer). | `/api/auth`, `/api/vendor`, `/api/foodics`, `/api/events` only, and only that vendor's own data. |
| **Fleet** | A delivery/courier company Darb subcontracts to. | `/api/auth`, `/api/fleet`, `/api/events` only, and only that fleet's own roster, scorecard and payouts. |

### Vendor portal sub-roles (added in this revision, #9)

A merchant's portal users are created per branch with one of three roles:

| Sub-role | Branch scope | Sees |
|---|---|---|
| **Owner** | All branches | Everything the merchant portal offers. |
| **Finance** | All branches | Wallet, statements and money only. No order creation, no pausing. |
| **Order tracking** | One branch | Orders for that branch only. No wallet, no statements, no pausing. |

Existing merchant logins were left as **Owner**, vendor-wide, so nothing changed for anyone
already using the portal.

### Fleet logins across commonly-owned companies (#15/#27)

Where one owner runs several delivery companies (Sidra, Marina and Nakheel are the client's
own example), a single Fleet login is attached to an **owner group** and switches between
those companies from the header instead of logging out and back in. The server validates
every switch against the group, so a login can only ever reach companies that same owner
already controls.

## Open question back to the client

The **Job Grade** column (Team Leader / Supervisor / Senior Supervisor / Area Manager) was
removed from Settings → Users in this revision (#19). It was a label only and never
affected permissions. If grades should actually change what someone can do, that is a
different piece of work and we need the rules per grade.
