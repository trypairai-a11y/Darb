# Phase 8 — Deferred Items

## DI-08-01: lint:tenant ESLint rule definition missing for Phase 9 test files

**Discovered:** Phase 8 Wave 0 (2026-05-13)

**Origin:** Commit `75b4abc` (parallel Phase 9 orchestrator session) added these
files to the `lint:tenant` glob:

- `src/__tests__/agent/tools/draftCourierMessage.bilingual.test.ts`
- `src/__tests__/services/outboundResolver.test.ts`

These files contain `eslint-disable @typescript-eslint/no-var-requires` comments
referencing a rule the `lint:tenant` minimal ESLint config does not load
(`--no-eslintrc` + only `no-prisma-without-tenant` rule). The result: `lint:tenant`
exits 1 with 4 errors of the form:

```
Definition for rule '@typescript-eslint/no-var-requires' was not found
```

**Impact:** Phase 8 Wave 0 verification criterion #7 (`lint:tenant` exits 0) is
violated. Phase 8's own globs (`src/services/finance/`, `src/routes/finance*.ts`)
match no source files yet (`--no-error-on-unmatched-pattern`) and contribute zero
errors.

**Resolution path (Phase 9 owner):**

Option A — Remove the `eslint-disable @typescript-eslint/...` directives from the
two Phase 9 test files. The rule isn't loaded so the disable is meaningless.

Option B — Add `--rule "{\"@typescript-eslint/no-var-requires\":\"off\"}"` to the
`lint:tenant` script so the disable directives become no-ops.

**Owner:** Phase 9 (REQ-bilingual-courier-comms) — this is Phase 9's lint scope.

**Tracking:** Add to `.planning/STATE.md` Deferred Items table under DI-08-01.

---

## DI-08-02: routes/cash.ts has 11 pre-existing tenant-scope violations

**Discovered:** Phase 8 Wave 0 (2026-05-13)

**Origin:** Phase 8 Wave 0 Plan Task 4 attempted to add `src/routes/cash.ts` to
the `lint:tenant` glob. The plan's premise was "already has tenant filters from
Phase 1; the lint gate just locks them in." This turned out to be false —
`routes/cash.ts` has 11 pre-existing `no-prisma-without-tenant` violations
(prisma.cashRecord.findMany/count/findUnique, prisma.pendingDuesLedger.findMany/
count, prisma.cashTransaction.findMany/count) that would fail the lint:tenant
gate.

**Wave 0 decision (Rule 3 — auto-fix blocking):** Removed `src/routes/cash.ts`
from the Phase 8 lint:tenant glob extension. The 5 new finance globs
(`src/services/finance/` + 4 `finance*.ts` routes) are still in scope and clean.

**Impact:** Wave 3's GET /api/cash/reconciliation route will live in routes/cash.ts
or in a new file. If routes/cash.ts is the host, the 11 pre-existing violations
must be cleaned BEFORE adding cash.ts to lint:tenant. If a new file
(e.g. `src/routes/financeCash.ts`) is created, it can be added to the glob without
inheriting the legacy debt.

**Resolution path (Phase 8 Wave 3 owner):**

Option A — Clean the 11 violations in routes/cash.ts (add `tenantId: req.user.tenantId`
to each prisma where clause), then add `src/routes/cash.ts` to lint:tenant glob.

Option B — Host /reconciliation in a new `src/routes/financeCash.ts` file under
the existing `src/services/finance/` lint scope. Skip touching legacy cash.ts.

**Owner:** Phase 8 Wave 3.

**Relation to deferred-items DI-01-01:** This is a subset of the 184 pre-existing
tenant-scope violations across 35 legacy files identified in Phase 1 Wave 4.
