// ─── API Client ───────────────────────────────────────────────────────────────
// Throws ApiError on non-2xx or network failure so callers can distinguish
// "backend not reachable" from other errors.

import type {
  TaskDetail,
  EvidenceResponse,
  TasksResponse,
} from "@/data/demo";
import { API_BASE_URL } from "@/config";

const BASE = API_BASE_URL;

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly unreachable: boolean;

  constructor(message: string, status?: number, unreachable = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.unreachable = unreachable;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("Backend not reachable", undefined, true);
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message ?? body?.error ?? msg;
    } catch { /* ignore */ }
    throw new ApiError(msg, res.status);
  }

  const json = await res.json() as { data: T } | T;
  return (json as { data: T }).data !== undefined
    ? (json as { data: T }).data
    : (json as T);
}

// ─── POST /api/task ────────────────────────────────────────────────────────────

export interface CreateTaskResponse {
  taskId: string;
  status: string;
}

export function createTask(goal: string): Promise<CreateTaskResponse> {
  return request<CreateTaskResponse>("/api/task", {
    method: "POST",
    body: JSON.stringify({ goal }),
  });
}

// ─── GET /api/task/:id ─────────────────────────────────────────────────────────

export function getTask(id: string): Promise<TaskDetail> {
  return request<TaskDetail>(`/api/task/${id}`);
}

// ─── GET /api/task/:id/evidence ────────────────────────────────────────────────

export function getEvidence(id: string): Promise<EvidenceResponse> {
  return request<EvidenceResponse>(`/api/task/${id}/evidence`);
}

// ─── POST /api/task/:id/approve ────────────────────────────────────────────────

export function approveTask(id: string): Promise<unknown> {
  return request<unknown>(`/api/task/${id}/approve`, { method: "POST" });
}

// ─── GET /api/tasks ────────────────────────────────────────────────────────────

export function getTasks(): Promise<TasksResponse> {
  return request<TasksResponse>("/api/tasks");
}

// ─── Terminal states ───────────────────────────────────────────────────────────

export function isTerminal(status: string): boolean {
  return status === "VERIFIED" || status === "FAILED";
}
