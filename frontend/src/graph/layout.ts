import type { MapCategory, MapTask, ProjectMap } from "../api";

/** The angle between dots in a cluster, so they spread out evenly. */
const GOLDEN_ANGLE = 2.399963;

/** How far the next task of a group sits outside its cluster. */
const PUSH = 56;

/** How far the label of the next task sits from its dot. */
const LABEL_GAP = 16;

export type Side = "left" | "right" | "above" | "below";

export type Hub = { category: MapCategory; x: number; y: number; dimmed: boolean };

export type Dot = {
  task: MapTask;
  x: number;
  y: number;
  r: number;
  next: boolean;
  done: boolean;
  dimmed: boolean;
};

export type Line = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "hub" | "branch" | "dependency" | "cross" | "note";
  dimmed: boolean;
};

export type Pill = {
  task: MapTask;
  x: number;
  y: number;
  side: Side;
  colour: number;
};

export type NoteDot = {
  slug: string;
  title: string;
  x: number;
  y: number;
  colour: number;
};

export type MapLayout = {
  width: number;
  height: number;
  label: number;
  centre: { x: number; y: number };
  hubs: Hub[];
  dots: Dot[];
  lines: Line[];
  pills: Pill[];
  notes: NoteDot[];
};

const EMPTY: ProjectMap = { total: 0, done: 0, progress: 0, categories: [], tasks: [], notes: [] };

/** How big a dot is, by how far along the task is. */
function radius(task: MapTask): number {
  if (task.state === "done") return 5;
  if (task.state === "doing") return 8;
  return 6.5;
}

/** A stable angle, so a note's dot always sits in the same place. */
function angleOf(slug: string): number {
  let total = 0;
  for (const letter of slug) total += letter.charCodeAt(0);
  return (total % 12) * (Math.PI / 6);
}

/** Roughly how big the label of a task will be once it's drawn. */
function labelSize(title: string, limit: number): { width: number; height: number } {
  return { width: Math.min(limit, 84 + title.length * 7), height: 30 };
}

/** Where a label would sit if it went that way. */
function anchor(x: number, y: number, side: Side): { x: number; y: number } {
  if (side === "left") return { x: x - LABEL_GAP, y };
  if (side === "right") return { x: x + LABEL_GAP, y };
  if (side === "above") return { x, y: y - LABEL_GAP };
  return { x, y: y + LABEL_GAP };
}

/** Whether a label would fit on the canvas that way. */
function fits(at: { x: number; y: number }, side: Side, size: { width: number; height: number }, width: number, height: number): boolean {
  const pad = 10;
  if (side === "right") return at.x + size.width <= width - pad;
  if (side === "left") return at.x - size.width >= pad;
  if (side === "above") return at.y - size.height >= pad;
  return at.y + size.height <= height - pad;
}

/** The label's place, kept on the canvas whichever way it ended up. */
function place(
  x: number,
  y: number,
  side: Side,
  size: { width: number; height: number },
  width: number,
  height: number,
): { x: number; y: number; side: Side } {
  const pad = 10;
  const options: Side[] =
    side === "right" ? ["right", "left", "above", "below"] : side === "left" ? ["left", "right", "above", "below"] : side === "above" ? ["above", "below", "right", "left"] : ["below", "above", "right", "left"];

  for (const option of options) {
    const at = anchor(x, y, option);
    if (fits(at, option, size, width, height)) return { ...at, side: option };
  }

  const at = anchor(x, y, side);
  const cx = side === "left" ? Math.max(at.x, size.width + pad) : Math.min(at.x, width - size.width - pad);
  const cy = side === "above" ? Math.max(at.y, size.height + pad) : side === "below" ? Math.min(at.y, height - size.height - pad) : at.y;
  return { x: cx, y: cy, side };
}

/**
 * Lays the project out as a map: the top-level groups sit in a ring, and each
 * group's work sits in a cluster around it. The next task of each group waits
 * just outside its cluster, where there's room to call it out.
 */
export function layoutMap(
  map: ProjectMap,
  size: { width: number; height: number },
  focus: string | null = null,
): MapLayout {
  const width = Math.max(size.width, 300);
  const height = Math.max(size.height, 300);
  const centre = { x: width / 2, y: height / 2 };
  const categories = map.categories;

  // The labels sit outside the ring, so the ring leaves room for them.
  const label = Math.max(120, Math.min(190, width * 0.4));

  // On a narrow screen there isn't room to call out every group at once.
  const roomForAll = width >= 700;
  const room = roomForAll ? width / 2 - PUSH - LABEL_GAP - label - 12 : width / 2 - PUSH - 12;
  const ring = Math.max(70, Math.min(room, height * 0.3, 235));
  const hubs: Hub[] = [];
  const dots: Dot[] = [];
  const lines: Line[] = [];
  const pills: Pill[] = [];
  const notes: NoteDot[] = [];
  const placed = new Map<string, { x: number; y: number; dimmed: boolean }>();

  categories.forEach((category, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(categories.length, 1);
    const hub = {
      category,
      x: centre.x + Math.cos(angle) * ring,
      y: centre.y + Math.sin(angle) * ring,
      dimmed: focus !== null && focus !== category.slug,
    };
    hubs.push(hub);
    lines.push({ id: `hub-${category.slug}`, x1: centre.x, y1: centre.y, x2: hub.x, y2: hub.y, kind: "hub", dimmed: hub.dimmed });

    const tasks = map.tasks.filter((task) => task.category === category.slug && task.is_leaf);
    const next = tasks.find((task) => task.slug === category.next);
    const others = tasks.filter((task) => task.slug !== category.next);
    const spread = Math.min(100, 26 + 15 * Math.sqrt(tasks.length));

    others.forEach((task, at) => {
      const spreadAngle = at * GOLDEN_ANGLE + index * 0.7;
      const distance = Math.max(24, spread * Math.sqrt((at + 0.5) / Math.max(others.length, 1)));
      const x = hub.x + Math.cos(spreadAngle) * distance;
      const y = hub.y + Math.sin(spreadAngle) * distance * 0.86;
      dots.push({ task, x, y, r: radius(task), next: false, done: task.state === "done", dimmed: hub.dimmed });
      placed.set(task.slug, { x, y, dimmed: hub.dimmed });
    });

    if (next) {
      const x = hub.x + Math.cos(angle) * PUSH;
      const y = hub.y + Math.sin(angle) * PUSH;
      dots.push({ task: next, x, y, r: 11, next: true, done: false, dimmed: hub.dimmed });
      placed.set(next.slug, { x, y, dimmed: hub.dimmed });

      // The label goes the way the group faces, so the groups don't all shout at once.
      const side: Side = Math.abs(Math.cos(angle)) > 0.5 ? (Math.cos(angle) < 0 ? "left" : "right") : Math.sin(angle) < 0 ? "above" : "below";
      if (focus ? focus === category.slug : roomForAll) {
        const at = place(x, y, side, labelSize(next.title, label), width, height);
        pills.push({ task: next, x: at.x, y: at.y, side: at.side, colour: category.colour });
      }
    }
  });

  // Each task hangs off its parent when the parent is in the same group.
  for (const dot of dots) {
    const parent = map.tasks.find((task) => task.slug === dot.task.parent);
    const from = parent && parent.category === dot.task.category ? placed.get(parent.slug) : undefined;
    const hub = hubs.find((one) => one.category.slug === dot.task.category);
    const start = from ?? (hub ? { x: hub.x, y: hub.y } : undefined);
    if (!start) continue;
    lines.push({ id: `branch-${dot.task.slug}`, x1: start.x, y1: start.y, x2: dot.x, y2: dot.y, kind: "branch", dimmed: dot.dimmed });
  }

  // What each task waits on.
  const categoryOf = new Map(map.tasks.map((task) => [task.slug, task.category]));
  for (const task of map.tasks) {
    const to = placed.get(task.slug);
    if (!to) continue;
    for (const need of task.needs) {
      const from = placed.get(need);
      if (!from) continue;
      const crosses = categoryOf.get(need) !== task.category;
      lines.push({
        id: `needs-${need}-${task.slug}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        kind: crosses ? "cross" : "dependency",
        dimmed: from.dimmed || to.dimmed,
      });
    }
  }

  // A note sits beside the task it documents.
  for (const note of map.notes) {
    if (!note.task) continue;
    const at = placed.get(note.task);
    if (!at) continue;
    const angle = angleOf(note.slug);
    const task = map.tasks.find((one) => one.slug === note.task);
    const category = map.categories.find((one) => one.slug === task?.category);
    const x = at.x + Math.cos(angle) * 14;
    const y = at.y + Math.sin(angle) * 14;
    notes.push({ slug: note.slug, title: note.title, x, y, colour: category?.colour ?? 0 });
    lines.push({ id: `note-${note.slug}`, x1: at.x, y1: at.y, x2: x, y2: y, kind: "note", dimmed: at.dimmed });
  }

  return { width, height, label, centre, hubs, dots, lines, pills, notes };
}

export { EMPTY as EMPTY_MAP };
