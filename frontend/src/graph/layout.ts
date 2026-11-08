import type { MapCategory, MapTask, ProjectMap } from "../api";

/** A full turn around the circle. */
const TAU = Math.PI * 2;

/** How far the label of the next task sits from its dot. */
const LABEL_GAP = 16;

/** Where the groups sit, as a part of the outermost ring. */
const HUB_RING = 0.34;

/** Where a group inside a group sits. */
const NESTED_RING = 0.42;

/** Where the work that waits on nothing sits. */
const FIRST_RING = 0.5;

/** The room outside the outer ring for the labels. */
const LABEL_ROOM = 46;

/** How far a job moves from its place in the tree towards the work it waits on. */
const PULL = 0.75;

/** How much a dependency on another group counts, against one inside the group. */
const OUTSIDE_WEIGHT = 3;

/** The room a job keeps from the edge of its group's slice, in degrees. */
const EDGE = 3;

/** The room two jobs on the same ring keep between them, in pixels. */
const DOT_GAP = 20;

export type Side = "left" | "right" | "above" | "below";

export type Hub = { category: MapCategory; x: number; y: number; dimmed: boolean };

export type Dot = {
  task: MapTask;
  x: number;
  y: number;
  r: number;
  next: boolean;
  done: boolean;
  /** Not done, and held up by work that isn't either. */
  waiting: boolean;
  group: boolean;
  dimmed: boolean;
  hidden: boolean;
  /** How many steps of work this job is waiting behind. */
  level: number;
};

export type Line = {
  id: string;
  d: string;
  kind: "hub" | "branch" | "dependency" | "cross" | "note";
  dimmed: boolean;
  hidden: boolean;
  /** Set on a dependency: the job it comes from, and the job that waits on it. */
  from?: string;
  to?: string;
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
  /** The radii of the ellipse the map is drawn on. */
  rx: number;
  ry: number;
  hubs: Hub[];
  dots: Dot[];
  lines: Line[];
  pills: Pill[];
  notes: NoteDot[];
};

const EMPTY: ProjectMap = { total: 0, done: 0, progress: 0, categories: [], tasks: [], notes: [], recent: [] };

/** A node of the tree the map is drawn from. */
type Tree = {
  slug: string;
  task: MapTask | null;
  category: MapCategory;
  depth: number;
  /** The place the tree gives the node, and the slice it sits in. */
  angle: number;
  start: number;
  span: number;
  children: Tree[];
  leaves: number;
};

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

/** The angle from one to another, the short way round. */
function gap(a: number, b: number): number {
  const span = Math.abs(a - b) % TAU;
  return span > Math.PI ? TAU - span : span;
}

/** The end of a slice that an angle is nearest to. */
function nearestEnd(angle: number, start: number, end: number): number {
  return gap(angle, start) <= gap(angle, end) ? start : end;
}

/** Roughly how big the label of a task will be once it's drawn. */
function labelSize(title: string, limit: number): { width: number; height: number } {
  return { width: Math.min(limit, 84 + title.length * 7), height: 30 };
}

/** Where a label would sit if it went that way. */
function anchor(x: number, y: number, side: Side, gap: number): { x: number; y: number } {
  if (side === "left") return { x: x - gap, y };
  if (side === "right") return { x: x + gap, y };
  if (side === "above") return { x, y: y - gap };
  return { x, y: y + gap };
}

/** Whether a label would fit on the canvas that way. */
function fits(at: { x: number; y: number }, side: Side, size: { width: number; height: number }, width: number, height: number): boolean {
  const pad = 10;
  if (side === "right") return at.x + size.width <= width - pad;
  if (side === "left") return at.x - size.width >= pad;
  if (side === "above") return at.y - size.height >= pad;
  return at.y + size.height <= height - pad;
}

/** The label's place, kept on the canvas whichever way it ended up, and off the
 * work it is labelling. */
function place(
  x: number,
  y: number,
  side: Side,
  size: { width: number; height: number },
  width: number,
  height: number,
  avoid: { x: number; y: number }[] = [],
): { x: number; y: number; side: Side } {
  const pad = 10;
  const options: Side[] =
    side === "right" ? ["right", "left", "above", "below"] : side === "left" ? ["left", "right", "above", "below"] : side === "above" ? ["above", "below", "right", "left"] : ["below", "above", "right", "left"];

  /** The space the label would take up that way. */
  const box = (at: { x: number; y: number }, way: Side) => {
    if (way === "right") return { left: at.x, right: at.x + size.width, top: at.y - size.height / 2, bottom: at.y + size.height / 2 };
    if (way === "left") return { left: at.x - size.width, right: at.x, top: at.y - size.height / 2, bottom: at.y + size.height / 2 };
    if (way === "above") return { left: at.x - size.width / 2, right: at.x + size.width / 2, top: at.y - size.height, bottom: at.y };
    return { left: at.x - size.width / 2, right: at.x + size.width / 2, top: at.y, bottom: at.y + size.height };
  };

  /** Whether the label would land on top of any of the work. */
  const clear = (way: Side) => {
    const area = box(anchor(x, y, way, LABEL_GAP), way);
    return !avoid.some((dot) => dot.x > area.left - 12 && dot.x < area.right + 12 && dot.y > area.top - 12 && dot.y < area.bottom + 12);
  };

  for (const option of options) {
    const at = anchor(x, y, option, LABEL_GAP);
    if (fits(at, option, size, width, height) && clear(option)) return { ...at, side: option };
  }
  for (const option of options) {
    const at = anchor(x, y, option, LABEL_GAP);
    if (fits(at, option, size, width, height)) return { ...at, side: option };
  }

  const at = anchor(x, y, side, LABEL_GAP);
  const cx = side === "left" ? Math.max(at.x, size.width + pad) : Math.min(at.x, width - size.width - pad);
  const cy = side === "above" ? Math.max(at.y, size.height + pad) : side === "below" ? Math.min(at.y, height - size.height - pad) : at.y;
  return { x: cx, y: cy, side };
}

/** The tree of the project: the groups, and the work under each of them. */
function buildTree(map: ProjectMap): Tree[] {
  const bySlug = new Map(map.tasks.map((task) => [task.slug, task]));

  const childrenOf = new Map<string, string[]>();
  for (const task of map.tasks) {
    if (!task.parent || !bySlug.has(task.parent)) continue;
    const list = childrenOf.get(task.parent) ?? [];
    if (!list.includes(task.slug)) list.push(task.slug);
    childrenOf.set(task.parent, list);
  }

  // The project knows the order of the children; keep it.
  const wanted = new Map(map.tasks.filter((task) => task.children.length).map((task) => [task.slug, task.children]));
  for (const [parent, slugs] of childrenOf) {
    const order = wanted.get(parent);
    if (!order) continue;
    slugs.sort((a, b) => {
      const left = order.indexOf(a);
      const right = order.indexOf(b);
      return (left < 0 ? order.length : left) - (right < 0 ? order.length : right);
    });
  }

  const make = (slug: string, category: MapCategory, depth: number, path: Set<string>): Tree => {
    const kids = (childrenOf.get(slug) ?? []).filter((child) => !path.has(child));
    const children = kids.map((child) => make(child, category, depth + 1, new Set([...path, child])));
    const leaves = children.length ? children.reduce((sum, child) => sum + child.leaves, 0) : 1;
    return { slug, task: bySlug.get(slug) ?? null, category, depth, angle: 0, start: 0, span: 0, children, leaves };
  };

  const roots: Tree[] = [];
  const seen = new Set<string>();
  const mark = (node: Tree) => {
    seen.add(node.slug);
    node.children.forEach(mark);
  };

  for (const category of map.categories) {
    const root = make(category.slug, category, 1, new Set([category.slug]));
    roots.push(root);
    mark(root);
  }

  // A task whose parent has gone missing hangs off its own group.
  for (const task of map.tasks) {
    if (seen.has(task.slug)) continue;
    const category = map.categories.find((one) => one.slug === task.category);
    const root = roots.find((one) => one.category.slug === category?.slug);
    if (!category || !root) continue;
    root.children.push(make(task.slug, category, root.depth + 1, new Set([task.slug])));
  }

  return roots;
}

/** Gives every node a slice of the circle, in the order of the leaves under it. */
function allocate(nodes: Tree[], start: number, span: number) {
  const total = nodes.reduce((sum, node) => sum + node.leaves, 0) || 1;
  let cursor = start;
  for (const node of nodes) {
    const part = (node.leaves / total) * span;
    node.start = cursor;
    node.span = part;
    node.angle = cursor + part / 2;
    allocateChildren(node, cursor, part);
    cursor += part;
  }
}

function allocateChildren(node: Tree, start: number, span: number) {
  const total = node.children.reduce((sum, child) => sum + child.leaves, 0) || 1;
  let cursor = start;
  for (const child of node.children) {
    const part = (child.leaves / total) * span;
    child.start = cursor;
    child.span = part;
    child.angle = cursor + part / 2;
    allocateChildren(child, cursor, part);
    cursor += part;
  }
}

/** The leaves of a group, in the order the tree puts them. */
function leavesUnder(node: Tree): Tree[] {
  if (!node.children.length) return node.task ? [node] : [];
  return node.children.flatMap(leavesUnder);
}

/**
 * How many steps of work a job is waiting behind: none if it waits on nothing
 * that is unfinished, and one more than the deepest job it waits on otherwise.
 */
function levels(map: ProjectMap): Map<string, number> {
  const bySlug = new Map(map.tasks.map((task) => [task.slug, task]));
  const known = new Map<string, number>();
  const walking = new Set<string>();

  const level = (slug: string): number => {
    const found = known.get(slug);
    if (found !== undefined) return found;
    const task = bySlug.get(slug);
    // A loop of dependencies: start again rather than never finish.
    if (!task || walking.has(slug)) return 0;
    walking.add(slug);
    let depth = 0;
    for (const need of task.needs) {
      const other = bySlug.get(need);
      if (!other?.is_leaf) continue;
      depth = Math.max(depth, level(need) + 1);
    }
    walking.delete(slug);
    known.set(slug, depth);
    return depth;
  };

  for (const task of map.tasks) level(task.slug);
  return known;
}

/**
 * Where a job is pulled to: the side of its group that the work it waits on is
 * on. A dependency on another group pulls harder than one inside the group,
 * because that is the line that would otherwise cross the whole map.
 */
function pullOf(
  job: MapTask,
  start: number,
  end: number,
  angles: Map<string, number>,
  groupOf: Map<string, string>,
): number | null {
  const needs = job.needs
    .map((slug) => {
      const angle = angles.get(slug);
      if (angle === undefined) return null;
      return { angle, outside: groupOf.get(slug) !== job.category };
    })
    .filter((need): need is { angle: number; outside: boolean } => need !== null);
  if (!needs.length) return null;

  const candidates = [start, end, ...needs.map((need) => nearestEnd(need.angle, start, end))];
  let best = start;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    let cost = 0;
    for (const need of needs) cost += (need.outside ? OUTSIDE_WEIGHT : 1) * gap(candidate, need.angle);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

/**
 * A line that bows a little to the side, so the flow of it is clear. A line
 * that crosses between groups bows away from the middle of the map, so it
 * goes round the work rather than through it.
 */
function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  centre: { x: number; y: number },
  round = false,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = length * 0.1;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let control = { x: middle.x - (dy / length) * bow, y: middle.y + (dx / length) * bow };
  if (round) {
    const out = Math.hypot(middle.x - centre.x, middle.y - centre.y) || 1;
    const push = out * 0.45;
    control = {
      x: control.x + ((middle.x - centre.x) / out) * push,
      y: control.y + ((middle.y - centre.y) / out) * push,
    };
  }
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/**
 * Lays the project out as a flow: the groups sit in a ring, each one given a
 * slice of the circle in proportion to how much work is in it, and the work
 * itself sits inside to out — the job that waits on nothing is in the middle
 * and the job that waits on the most is on the outer ring. Within a group's
 * slice a job sits on the side of the group that the work it waits on is on,
 * so a dependency is a short line rather than one across the map. Every
 * dependency is drawn in the colour of the group it comes from, fading to a
 * tint of orange where it lands on the job that waits on it.
 */
export function layoutMap(
  map: ProjectMap,
  size: { width: number; height: number },
  focus: string | null = null,
  hideDone = false,
  selected: string | null = null,
): MapLayout {
  const width = Math.max(size.width, 300);
  const height = Math.max(size.height, 300);
  const centre = { x: width / 2, y: height / 2 };
  const label = Math.max(120, Math.min(190, width * 0.4));

  const roots = buildTree(map);
  allocate(roots, -Math.PI / 2, TAU);

  // The map is an ellipse, so it fills the space it is given. Round the outside
  // of it is the room for the labels of the next jobs.
  const narrow = width < 700;
  const labelRoom = narrow ? 18 : LABEL_ROOM;
  const rx = Math.max(80, width / 2 - labelRoom - 12);
  const ry = Math.max(80, height / 2 - labelRoom - 12);

  const hubs: Hub[] = [];
  const dots: Dot[] = [];
  const lines: Line[] = [];
  const pills: Pill[] = [];
  const notes: NoteDot[] = [];

  const groupOf = new Map(map.tasks.map((task) => [task.slug, task.category]));
  const levelOf = levels(map);
  const maxLevel = map.tasks.reduce((max, task) => Math.max(max, levelOf.get(task.slug) ?? 0), 0);
  /** The ring a level of work sits on. */
  const ringOf = (level: number) => (maxLevel === 0 ? 1 : FIRST_RING + (level * (1 - FIRST_RING)) / maxLevel);

  /** Where every node sits, and whether it is showing. */
  const placed = new Map<string, { x: number; y: number; angle: number; dimmed: boolean; hidden: boolean }>();
  /** The angle of every job placed so far, so the next one can be pulled to it. */
  const angles = new Map<string, number>();

  // The done work comes out of the drawing, but not out of the layout.
  const isHidden = (task: MapTask | null, next: string | null) =>
    Boolean(hideDone && task?.state === "done" && task.is_leaf && task.slug !== next);

  // The groups, in a ring inside the work.
  for (const root of roots) {
    const dimmed = focus !== null && focus !== root.category.slug;
    const x = centre.x + rx * HUB_RING * Math.cos(root.angle);
    const y = centre.y + ry * HUB_RING * Math.sin(root.angle);
    hubs.push({ category: root.category, x, y, dimmed });
    placed.set(root.slug, { x, y, angle: root.angle, dimmed, hidden: false });
    lines.push({
      id: `hub-${root.slug}`,
      d: `M ${centre.x.toFixed(1)} ${centre.y.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`,
      kind: "hub",
      dimmed,
      hidden: false,
    });
  }

  // The work, inside to out: the job that waits on nothing is in the middle of
  // the map, and the job that waits on the most is on the outer ring.
  for (let level = 0; level <= maxLevel; level++) {
    for (const root of roots) {
      const jobs = leavesUnder(root).filter((node) => (levelOf.get(node.slug) ?? 0) === level);
      if (!jobs.length) continue;

      const start = root.start + (EDGE * Math.PI) / 180;
      const end = root.start + root.span - (EDGE * Math.PI) / 180;

      // Where each job is pulled to: the work it waits on.
      const wanted = jobs.map((node) => {
        const pull = pullOf(node.task!, start, end, angles, groupOf);
        const base = node.angle;
        return { node, angle: pull === null ? base : base + PULL * (pull - base) };
      });
      wanted.sort((one, two) => one.angle - two.angle);

      // Keep them from sitting on top of each other.
      const speed = (ringOf(level) * (rx + ry)) / 2;
      const room = DOT_GAP / speed;
      let previous = -Infinity;
      for (const item of wanted) {
        item.angle = Math.max(item.angle, previous + room);
        previous = item.angle;
      }
      const overflow = wanted[wanted.length - 1].angle - end;
      if (overflow > 0) {
        for (const item of wanted) item.angle -= overflow;
        for (let index = 1; index < wanted.length; index++) {
          const before = wanted[index - 1].angle + room;
          if (wanted[index].angle < before) wanted[index].angle = before;
        }
      }
      for (const item of wanted) item.angle = Math.max(start, Math.min(end, item.angle));

      for (const item of wanted) {
        const task = item.node.task!;
        const scale = ringOf(level);
        const x = centre.x + rx * scale * Math.cos(item.angle);
        const y = centre.y + ry * scale * Math.sin(item.angle);
        const dimmed = focus !== null && focus !== task.category;
        const next = task.category === root.category.slug ? root.category.next === task.slug : false;
        const hidden = isHidden(task, root.category.next);

        angles.set(task.slug, item.angle);
        placed.set(task.slug, { x, y, angle: item.angle, dimmed, hidden });
        dots.push({
          task,
          x,
          y,
          r: next ? 11 : radius(task),
          next,
          done: task.state === "done",
          waiting: task.state !== "done" && task.needs.length > 0,
          group: false,
          dimmed,
          hidden,
          level,
        });
      }
    }
  }

  // A group inside a group, and the tree that holds the work together.
  const walk = (node: Tree) => {
    for (const child of node.children) {
      if (child.depth > 1 && child.task && !child.task.is_leaf) {
        const dimmed = focus !== null && focus !== child.category.slug;
        const x = centre.x + rx * NESTED_RING * Math.cos(child.angle);
        const y = centre.y + ry * NESTED_RING * Math.sin(child.angle);
        placed.set(child.slug, { x, y, angle: child.angle, dimmed, hidden: false });
        dots.push({
          task: child.task,
          x,
          y,
          r: 8,
          next: false,
          done: false,
          waiting: false,
          group: true,
          dimmed,
          hidden: false,
          level: 0,
        });
      }
      const from = placed.get(node.slug);
      const to = placed.get(child.slug);
      if (from && to) {
        lines.push({
          id: `branch-${child.slug}`,
          d: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
          kind: "branch",
          dimmed: from.dimmed || to.dimmed,
          hidden: to.hidden,
        });
      }
      walk(child);
    }
  };
  roots.forEach(walk);

  // A dependency. These are only drawn for the job that is picked.
  for (const task of map.tasks) {
    if (!task.is_leaf) continue;
    const to = placed.get(task.slug);
    if (!to) continue;
    for (const need of task.needs) {
      const from = placed.get(need);
      if (!from) continue;
      const outside = groupOf.get(need) !== task.category;
      lines.push({
        id: `needs-${need}-${task.slug}`,
        d: curve(from, to, centre, outside),
        kind: outside ? "cross" : "dependency",
        dimmed: from.dimmed || to.dimmed,
        hidden: from.hidden || to.hidden,
        from: need,
        to: task.slug,
      });
    }
  }

  // The job that is picked is called out with a label, out towards the edge of the map.
  const picked = selected ? map.tasks.find((task) => task.slug === selected) : undefined;
  const at = picked ? placed.get(picked.slug) : undefined;
  if (picked && at && !at.hidden) {
    const outward = Math.abs(Math.cos(at.angle)) > 0.5 ? (Math.cos(at.angle) < 0 ? "left" : "right") : Math.sin(at.angle) < 0 ? "above" : "below";
    const size = labelSize(picked.title, label);
    const spot = place(at.x, at.y, outward, size, width, height, dots.map((dot) => ({ x: dot.x, y: dot.y })));
    const colour = map.categories.find((category) => category.slug === picked.category)?.colour ?? 0;
    pills.push({ task: picked, x: spot.x, y: spot.y, side: spot.side, colour });
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
    lines.push({
      id: `note-${note.slug}`,
      d: `M ${at.x.toFixed(1)} ${at.y.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`,
      kind: "note",
      dimmed: at.dimmed,
      hidden: at.hidden,
    });
  }

  return { width, height, label, centre, rx, ry, hubs, dots, lines, pills, notes };
}

export { EMPTY as EMPTY_MAP };
