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

export type LogLine = { day: string; label: string; text: string; task: string | null };

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

export type Proposal = {
  id: string;
  summary: string;
  descriptions: string[];
  status: "pending" | "applied" | "rejected" | "failed";
  error?: string | null;
};

export type ChatItem =
  | { type: "user"; text: string; photos?: string[] }
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
export async function streamMessage(
  sessionId: string,
  text: string,
  photos: string[],
  onEvent: (event: ChatEvent) => void,
) {
  const response = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, photos }),
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
  closes_zone_title: string | null;
  preflight: TaskRef[];
  photos: { key: string; caption: string }[];
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

export type ShoppingItem = { slug: string; title: string; area: string | null; cost: number | null; blocked_by: TaskRef[] };
export type Shopping = {
  to_order: ShoppingItem[];
  on_order: ShoppingItem[];
  arrived: ShoppingItem[];
  still_to_spend: number;
  spent: number;
  unpriced: number;
};

const MAX_PHOTO_SIDE = 1600;

/** Shrinks a photo before upload, because signal can be poor. Falls back to the original. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function sendPhoto<T>(path: string, file: File, caption?: string): Promise<T> {
  const form = new FormData();
  const photo = await shrinkPhoto(file);
  form.append("file", photo, "photo");
  if (caption) form.append("caption", caption);
  const response = await fetch(`/api${path}`, { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Upload failed (${response.status})`);
  }
  return response.json();
}

export const uploadPhoto = (file: File) => sendPhoto<{ key: string }>("/photos", file);
export const addTaskPhoto = (slug: string, file: File) => sendPhoto<ChangeResult>(`/tasks/${slug}/photos`, file);

export type Features = { chat: boolean; voice: boolean };

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "note");
  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Transcription failed (${response.status})`);
  }
  return (await response.json()).text;
}

export type Shape = {
  id: string;
  tag: "rect" | "path" | "polygon" | "circle" | "ellipse";
  attributes: Record<string, string>;
};
export type Zone = {
  id: string;
  title: string;
  progress: number | null;
  tasks: TaskRef[];
  shape: Shape | null;
};
export type Drawing = { slug: string; title: string; view_box: string; zones: Zone[]; shapes: Shape[] };

/** A task, as the map shows it: a dot in a cluster, or a card in a run of jobs. */
export type MapTask = {
  slug: string;
  title: string;
  kind: Kind;
  state: State;
  progress: number;
  category: string;
  parent: string | null;
  is_leaf: boolean;
  needs: string[];
  blocks: string[];
  children: string[];
  note: string;
};

/** A top-level group: the cluster a task belongs to. */
export type MapCategory = {
  slug: string;
  title: string;
  colour: number;
  total: number;
  done: number;
  progress: number;
  next: string | null;
};

export type MapNote = { slug: string; title: string; task: string | null };

/** Something the log says you finished, and the day it happened. */
export type MapStep = {
  slug: string;
  title: string;
  kind: Kind;
  category: string;
  label: string;
  day: string;
};

export type ProjectMap = {
  total: number;
  done: number;
  progress: number;
  categories: MapCategory[];
  tasks: MapTask[];
  notes: MapNote[];
  recent: MapStep[];
};
