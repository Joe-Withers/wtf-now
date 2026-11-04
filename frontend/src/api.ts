export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
}

export const getJson = <T,>(path: string) => request<T>(path);

export const postJson = <T,>(path: string, body: unknown = {}, method = "POST") =>
  request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export type State = "todo" | "doing" | "done";
export type Kind = "build" | "purchase" | "research" | "decision";

export type Change = { id: string; summary: string; at: string };
export type ChangeResult = { change: Change; results?: unknown[] };

export type WorkItem = {
  slug: string;
  title: string;
  kind: Kind;
  state: State;
  progress: number;
  remaining_hours: number;
  needs_helper: boolean;
  zone: string | null;
  area: string | null;
  current_state: string;
  unlocks_hours: number;
  easier_after: string[];
};

export type LogLine = { day: string; label: string; text: string };

export type Home = {
  last_activity: string | null;
  days_away: number | null;
  overall_progress: number;
  last_session: LogLine[];
  in_progress: WorkItem[];
  on_order: WorkItem[];
  arrived: LogLine[];
  suggestions: WorkItem[];
};

export type WhatNow = {
  can_do: WorkItem[];
  order_first: WorkItem[];
  on_its_way: WorkItem[];
  decide_first: WorkItem[];
};
