// Phase 2 Wave 3 — Typed axios wrappers for the Decisions + Audit APIs.
// Mounts on the existing axios instance from @/lib/api so JWT cookie auth
// + 401 refresh interceptor flow through automatically.

import api from "@/lib/api";
import type {
  DecisionCardData,
  DecisionsListResponse,
  AgentActionDetail,
  AuditListResponse,
} from "@/types/decisions";
import {
  DEMO_DECISION_CARDS,
  demoAuditResponse,
  demoDecisionsResponse,
  isDemoDecisionId,
} from "@/mocks/demoDecisions";

function shouldUseDemoFallback(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return isLocalhost && (status === 404 || status === 500 || status === undefined);
}

// ---- Decisions inbox ----

export interface ListDecisionsParams {
  status?: "pending" | "approved" | "dismissed" | "all";
  filter?:
    | "all"
    | "high-conf"
    | "this-week"
    | "penalty"
    | "cash"
    | "warn"
    | "suspend"
    | "promote";
  sort?: "priority" | "newest" | "confidence";
  page?: number;
  limit?: number;
}

export async function listDecisions(
  params: ListDecisionsParams = {},
): Promise<DecisionsListResponse> {
  try {
    const { data } = await api.get<DecisionsListResponse>("/api/decisions", {
      params,
    });
    if (!data.cards?.length && shouldUseDemoFallback({ response: { status: 404 } })) {
      return demoDecisionsResponse();
    }
    return data;
  } catch (error) {
    if (shouldUseDemoFallback(error)) return demoDecisionsResponse();
    throw error;
  }
}

export async function getPendingCount(): Promise<{ count: number }> {
  try {
    const { data } = await api.get<{ count: number }>(
      "/api/decisions/pending-count",
    );
    return data;
  } catch (error) {
    if (shouldUseDemoFallback(error)) {
      return { count: demoDecisionsResponse().counts.pending };
    }
    throw error;
  }
}

export async function getDecision(id: string): Promise<DecisionCardData> {
  if (isDemoDecisionId(id)) {
    const found = DEMO_DECISION_CARDS.find((c) => c.id === id);
    if (found) return found;
  }
  try {
    const { data } = await api.get<DecisionCardData>(`/api/decisions/${id}`);
    return data;
  } catch (error) {
    if (shouldUseDemoFallback(error)) {
      const found = DEMO_DECISION_CARDS.find((c) => c.id === id);
      if (found) return found;
    }
    throw error;
  }
}

export async function approveDecision(
  id: string,
  modifications?: Record<string, unknown>,
): Promise<{
  agentActionId: string;
  outcome: "success" | "failure";
  audit: unknown;
}> {
  if (isDemoDecisionId(id)) {
    return {
      agentActionId: `demo-action-${id}`,
      outcome: "success",
      audit: { demo: true, modifications: modifications ?? null },
    };
  }
  const body = modifications ? { modifications } : {};
  const { data } = await api.post(`/api/decisions/${id}/approve`, body);
  return data;
}

export async function dismissDecision(
  id: string,
  reason: string,
): Promise<{ agentMemoryId: string }> {
  if (isDemoDecisionId(id)) {
    return { agentMemoryId: `demo-memory-${reason.length}-${id}` };
  }
  const { data } = await api.post(`/api/decisions/${id}/dismiss`, { reason });
  return data;
}

export async function undoDecision(
  id: string,
): Promise<{ agentActionId: string; rolledBackAt: string }> {
  if (isDemoDecisionId(id)) {
    return {
      agentActionId: `demo-action-${id}`,
      rolledBackAt: new Date().toISOString(),
    };
  }
  const { data } = await api.post(`/api/decisions/${id}/undo`);
  return data;
}

// ---- Audit log ----

export interface ListAuditParams {
  dateFrom?: string;
  dateTo?: string;
  toolName?: string;
  outcome?: "success" | "failure" | "rolled_back";
  approverId?: string;
  subjectType?: string;
  subjectId?: string;
  page?: number;
  limit?: number;
}

export async function listAuditActions(
  params: ListAuditParams = {},
): Promise<AuditListResponse> {
  try {
    const { data } = await api.get<AuditListResponse>(
      "/api/audit/agent-actions",
      { params },
    );
    if (!data.rows?.length && shouldUseDemoFallback({ response: { status: 404 } })) {
      return demoAuditResponse();
    }
    return data;
  } catch (error) {
    if (shouldUseDemoFallback(error)) return demoAuditResponse();
    throw error;
  }
}

export async function getAuditAction(id: string): Promise<AgentActionDetail> {
  const { data } = await api.get<AgentActionDetail>(
    `/api/audit/agent-actions/${id}`,
  );
  return data;
}

export async function rollbackAuditAction(
  id: string,
  reason: string,
): Promise<{ agentActionId: string; rolledBackAt: string }> {
  const { data } = await api.post(
    `/api/audit/agent-actions/${id}/rollback`,
    { reason },
  );
  return data;
}
