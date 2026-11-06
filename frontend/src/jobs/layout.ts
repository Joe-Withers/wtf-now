import type { MapStep, MapTask, ProjectMap } from "../api";

/** The columns of the run, in the order the work moves through them. */
export const COLUMNS = [
  { key: "done", label: "Done" },
  { key: "ready", label: "Ready now" },
  { key: "up_next", label: "Up next" },
  { key: "later", label: "Later" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

export const CARD_HEIGHT = 48;
export const CARD_GAP = 10;
export const COLUMN_GAP = 28;
export const HEADER_HEIGHT = 34;
export const MIN_CARD_WIDTH = 180;
export const MAX_CARD_WIDTH = 280;
/** On a phone the run scrolls sideways, so the cards can be wider than the screen. */
export const PHONE_CARD_WIDTH = 220;
const PHONE_WIDTH = 700;
/** Room at the edge of the run, so the first column isn't against the rail. */
const PAD = 14;

/** The kinds you can filter the run by. */
export const FILTERS = [
  { key: "all", label: "All" },
  { key: "build", label: "Build" },
  { key: "purchase", label: "Buy" },
  { key: "decision", label: "Decide" },
  { key: "research", label: "Research" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];

export type JobCard = {
  /** The task this card is, whether it is finished or still to do. */
  slug: string;
  title: string;
  kind: MapTask["kind"];
  state: MapTask["state"];
  progress: number;
  /** The group it belongs to. */
  category: string;
  column: ColumnKey;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The log's word for what happened, on a finished card. */
  label?: string;
  day?: string;
  /** Faded out because the filter is on another kind. */
  dimmed: boolean;
  selected: boolean;
};

export type JobEdge = {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Lit, because it touches the card you've picked. */
  hot: boolean;
};

export type JobsLayout = {
  cards: JobCard[];
  edges: JobEdge[];
  /** Where each column starts, so the headings line up with the cards. */
  columns: { key: ColumnKey; label: string; count: number; x: number }[];
  width: number;
  height: number;
  cardWidth: number;
};

/** Whether there is room for four columns side by side. */
function narrow(width: number): boolean {
  return width < PHONE_WIDTH;
}

/** Which column a task belongs to, given what it is waiting on. */
export function columnOf(task: MapTask, ready: Set<string>): ColumnKey {
  if (task.state === "done") return "done";
  if (task.needs.length === 0) return "ready";
  if (task.needs.length === 1 && ready.has(task.needs[0])) return "up_next";
  return "later";
}

/**
 * Lays the work out as a run of jobs: the last few things finished, the work
 * you could start now, the work one step away, and the rest.
 */
export function layoutJobs(
  map: ProjectMap,
  width: number,
  selected: string | null = null,
  filter: FilterKey = "all",
  focus: string | null = null,
): JobsLayout {
  const leaves = map.tasks.filter((task) => task.is_leaf);
  const ready = new Set(leaves.filter((task) => task.state !== "done" && task.needs.length === 0).map((task) => task.slug));

  const cardWidth = narrow(width)
    ? PHONE_CARD_WIDTH
    : Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, (width - COLUMN_GAP * 3 - PAD * 2) / 4));
  const columnX = (index: number) => PAD + Math.round(index * (cardWidth + COLUMN_GAP));
  const faded = (kind: MapTask["kind"], category: string) =>
    (filter !== "all" && kind !== filter) || (focus !== null && category !== focus);

  const cards: JobCard[] = [];
  const counts: Record<ColumnKey, number> = { done: 0, ready: 0, up_next: 0, later: 0 };

  for (const [index, step] of map.recent.entries()) {
    cards.push({
      slug: step.slug,
      title: step.title,
      kind: step.kind,
      state: "done",
      progress: 100,
      category: step.category,
      column: "done",
      x: columnX(0),
      y: HEADER_HEIGHT + index * (CARD_HEIGHT + CARD_GAP),
      width: cardWidth,
      height: CARD_HEIGHT,
      label: step.label,
      day: step.day,
      dimmed: faded(step.kind, step.category),
      selected: selected === step.slug,
    });
    counts.done += 1;
  }

  for (const task of leaves) {
    if (task.state === "done") continue;
    const column = columnOf(task, ready);
    const index = counts[column];
    cards.push({
      slug: task.slug,
      title: task.title,
      kind: task.kind,
      state: task.state,
      progress: task.progress,
      category: task.category,
      column,
      x: columnX(COLUMNS.findIndex((one) => one.key === column)),
      y: HEADER_HEIGHT + index * (CARD_HEIGHT + CARD_GAP),
      width: cardWidth,
      height: CARD_HEIGHT,
      dimmed: faded(task.kind, task.category),
      selected: selected === task.slug,
    });
    counts[column] += 1;
  }

  const placed = new Map(cards.map((card) => [card.slug, card]));
  const edges: JobEdge[] = [];
  const seen = new Set<string>();

  const link = (from: JobCard, to: JobCard) => {
    if (from.column === to.column) return;
    const id = `${from.slug}->${to.slug}`;
    if (seen.has(id)) return;
    seen.add(id);
    const forward = from.x < to.x;
    edges.push({
      id,
      from: from.slug,
      to: to.slug,
      x1: forward ? from.x + from.width : from.x,
      y1: from.y + from.height / 2,
      x2: forward ? to.x : to.x + to.width,
      y2: to.y + to.height / 2,
      hot: selected === from.slug || selected === to.slug,
    });
  };

  // A job waits on the ones in its needs; a finished job holds up the ones in its blocks.
  for (const card of cards) {
    const task = map.tasks.find((one) => one.slug === card.slug);
    for (const need of task?.needs ?? []) {
      const blocker = placed.get(need);
      if (blocker) link(blocker, card);
    }
    for (const blocked of task?.blocks ?? []) {
      const other = placed.get(blocked);
      if (other) link(card, other);
    }
  }

  const tallest = Math.max(
    ...COLUMNS.map((column) => HEADER_HEIGHT + counts[column.key] * (CARD_HEIGHT + CARD_GAP)),
    HEADER_HEIGHT,
  );

  return {
    cards,
    edges,
    columns: COLUMNS.map((column, index) => ({
      key: column.key,
      label: column.label,
      count: counts[column.key],
      x: columnX(index),
    })),
    width: columnX(COLUMNS.length - 1) + cardWidth + PAD,
    height: tallest,
    cardWidth,
  };
}

/** How many jobs you could start right now, and what kind they are. */
export function readyCounts(map: ProjectMap): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  for (const task of map.tasks) {
    if (!task.is_leaf || task.state === "done" || task.needs.length > 0) continue;
    byKind[task.kind] = (byKind[task.kind] ?? 0) + 1;
  }
  return { total: Object.values(byKind).reduce((sum, count) => sum + count, 0), byKind };
}

/** The days a step happened, the way the log writes them. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function day(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return `${date} ${MONTHS[month - 1]}`;
}
