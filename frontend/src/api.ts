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

export type Proposal = {
  id: string;
  summary: string;
  descriptions: string[];
  status: "pending" | "applied" | "rejected" | "failed";
  error?: string | null;
};

export type ChatItem =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "change"; id: string; summary: string }
  | ({ type: "proposal" } & Proposal)
  | { type: "error"; message: string };

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | Exclude<ChatItem, { type: "user" } | { type: "assistant" }>;

export type SessionSummary = { id: string; title: string; updated_at: string; focus: string | null };
export type Session = { id: string; title: string; focus: string | null; display: ChatItem[] };

/** Sends a message and calls `onEvent` for each server-sent event. */
export async function streamMessage(sessionId: string, text: string, onEvent: (event: ChatEvent) => void) {
  const response = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok || !response.body) throw new ApiError(`Request failed (${response.status})`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      if (event.startsWith("data: ")) onEvent(JSON.parse(event.slice(6)));
    }
  }
}

export type TreeNode = {
  slug: string;
  title: string;
  kind: Kind;
  state: State;
  progress: number;
  remaining_hours: number;
  blocked: boolean;
  children: TreeNode[];
};

export type TaskRef = { slug: string; title: string; state: State };

export type TaskDetail = {
  slug: string;
  title: string;
  description: string;
  kind: Kind;
  state: State;
  progress: number;
  progress_reason: string;
  remaining_hours: number;
  is_leaf: boolean;
  zone: string | null;
  needs_helper: boolean;
  cost: number | null;
  current_state: string;
  notes: string;
  breadcrumbs: TaskRef[];
  children: TaskRef[];
  depends_on: { slug: string; title: string; strength: "hard" | "soft"; done: boolean; inherited_from: string | null }[];
  dependents: TaskRef[];
  blocked_by: TaskRef[];
  easier_after: TaskRef[];
};

export type NoteSummary = {
  slug: string;
  title: string;
  type: string;
  description: string;
  generated_by: string;
  verified: boolean;
  needs_verifying: boolean;
  stale: boolean;
};
export type NoteDetail = NoteSummary & { body: string };
export type SearchHit = { kind: "task" | "note"; slug: string; title: string; snippet: string };
export type Problem = { code: string; path: string; message: string };
