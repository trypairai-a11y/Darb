# Loose notes, kept

These four files sat in the repository root untracked for months. They are
working notes rather than specification, so they live here rather than beside
`CLAUDE.md`, where a reader would take them for current truth.

| File | What it is | Still true? |
|---|---|---|
| `AI-REBUILD-NOTES.md` | Notes from the 2026-07 PRD rebuild | historical |
| `DECISIONS.md` | Decisions taken during that rebuild | historical, superseded by CLAUDE.md's invariants |
| `PRD_Darb_v2.md` | An earlier PRD draft | superseded by `docs/Darb2_PRD.docx` |
| `KEETA-PARITY-SPEC.md` | Parity spec for the deleted aggregator platform | dead, kept for the audit trail |
| `TESTING.md` | Testing notes | folded into CLAUDE.md's testing conventions |

**The authority is `CLAUDE.md` and `docs/superpowers/specs/`.** If one of these
disagrees with either, it is these that are out of date.

## The orphaned legacy code

`backend/src/routes/keeta*.ts`, `americana*.ts`, `talabat.ts`, `deliveroo.ts`
and their queues and services are untracked copies left on disk after commit
`640bcbe` deleted the legacy platform. Nothing imports them and no route
registers them, but `tsc` was still compiling them, which is why one of them
(`keetaAvailableShifts.ts`) produced a type error on every clean checkout.
They are excluded in `backend/tsconfig.json` now.

They can be removed from the working tree whenever anyone wants to. Everything
is recoverable from history:

```bash
git clean -fd -- backend/src/routes/keeta backend/src/routes/americana   # etc
git checkout 640bcbe^ -- backend/src/routes/keeta.ts                     # to get one back
```
