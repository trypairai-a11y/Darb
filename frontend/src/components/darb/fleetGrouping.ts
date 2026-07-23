// Darb 2.0 — roll commonly-owned fleets up by owner entity (client revision
// #28). Sidra, Marina and Nakheel are one operation, so ops wanted their
// numbers combined and averaged rather than read as three unrelated rows.
//
// Ungrouped fleets are passed through untouched as single-member groups, so a
// caller can render one uniform list either way.

export interface FleetRowLike {
  fleetPartnerId: string;
  name: string;
  disciplineStatus: string;
  driversOnline: number;
  minDriversOnline: number | null;
  deliveredToday: number;
  ownerGroupId?: string | null;
  ownerGroupName?: string | null;
}

export interface FleetGroup<T extends FleetRowLike> {
  /** Owner group id, or the fleet's own id when it belongs to no group. */
  key: string;
  name: string;
  /** True only when this really is an owner group with more than one fleet. */
  isGroup: boolean;
  members: T[];
  driversOnline: number;
  /** Null when no member declares a commitment — never a misleading 0. */
  minDriversOnline: number | null;
  deliveredToday: number;
  /** Worst discipline status across the group: one throttled fleet is the story. */
  disciplineStatus: string;
}

/** Severity order — the group takes the worst status any member holds. */
const DISCIPLINE_RANK: Record<string, number> = {
  OK: 0,
  WARNED: 1,
  THROTTLED: 2,
  SUSPENDED: 3,
  REMOVED: 4,
};

function worstDiscipline(statuses: string[]): string {
  return statuses.reduce(
    (worst, s) => ((DISCIPLINE_RANK[s] ?? 0) > (DISCIPLINE_RANK[worst] ?? 0) ? s : worst),
    statuses[0] ?? "OK"
  );
}

export function groupFleetsByOwner<T extends FleetRowLike>(rows: T[]): FleetGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.ownerGroupId ?? row.fleetPartnerId;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  return Array.from(byKey.entries()).map(([key, members]) => {
    const commitments = members
      .map((m) => m.minDriversOnline)
      .filter((n): n is number => n != null);
    const isGroup = members.length > 1 && !!members[0].ownerGroupId;
    return {
      key,
      name: isGroup ? members[0].ownerGroupName ?? members[0].name : members[0].name,
      isGroup,
      members,
      driversOnline: members.reduce((sum, m) => sum + m.driversOnline, 0),
      minDriversOnline: commitments.length > 0 ? commitments.reduce((a, b) => a + b, 0) : null,
      deliveredToday: members.reduce((sum, m) => sum + m.deliveredToday, 0),
      disciplineStatus: worstDiscipline(members.map((m) => m.disciplineStatus)),
    };
  });
}
