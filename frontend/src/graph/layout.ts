import type { MapCategory, MapTask, ProjectMap } from "../api";

/** A full turn around the circle. */
const TAU = Math.PI * 2;

/** How far the label of the next task sits from its dot. */
const LABEL_GAP = 16;

/** The innermost ring, as a part of the outermost one. */
const INNER = 0.36;

/** The room outside the outer ring for the labels. */
const LABEL_ROOM = 46;

export type Side = "left" | "right" | "above" | "below";

export type Hub = { category: MapCategory; x: number; y: number; dimmed: boolean };

export type Dot = {
  task: MapTask;
  x: number;
  y: number;
  r: number;
  next: boolean;
  done: boolean;
  group: boolean;
  dimmed: boolean;
  hidden: boolean;
};

export type Line = {
  id: string;
  d: string;
  kind: "hub" | "branch" | "dependency" | "cross" | "note";
  dimmed: boolean;
  hidden: boolean;
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
  angle: number;
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
    return { slug, task: bySlug.get(slug) ?? null, category, depth, angle: 0, children, leaves };
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
    child.angle = cursor + part / 2;
    allocateChildren(child, cursor, part);
    cursor += part;
  }
}

/**
 * Where a node sits. The jobs all sit on the outer ring, in the order the tree
 * puts them; the groups that hold them sit inside it, a ring further in for
 * each level of nesting.
 */
function ring(node: Tree, centre: { x: number; y: number }, rx: number, ry: number) {
  const leaf = node.task ? node.task.is_leaf : node.children.length === 0;
  const scale = leaf ? 1 : Math.min(0.86, INNER + 0.18 * (node.depth - 1));
  return {
    x: centre.x + rx * scale * Math.cos(node.angle),
    y: centre.y + ry * scale * Math.sin(node.angle),
  };
}

/** A path that goes out from one node, round the outside of the map, and in to another. */
function aroundArc(
  from: { x: number; y: number; angle: number },
  to: { x: number; y: number; angle: number },
  centre: { x: number; y: number },
  rx: number,
  ry: number,
  gap: number,
): string {
  let span = to.angle - from.angle;
  while (span > Math.PI) span -= TAU;
  while (span < -Math.PI) span += TAU;
  const sweep = span > 0 ? 1 : 0;
  const start = { x: centre.x + (rx + gap) * Math.cos(from.angle), y: centre.y + (ry + gap) * Math.sin(from.angle) };
  const end = { x: centre.x + (rx + gap) * Math.cos(to.angle), y: centre.y + (ry + gap) * Math.sin(to.angle) };
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${(rx + gap).toFixed(1)} ${(ry + gap).toFixed(1)} 0 0 ${sweep} ${end.x.toFixed(1)} ${end.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/** The pairs of groups that lean on each other, so their arcs can be given a band each. */
function crossPairs(map: ProjectMap): string[] {
  const categoryOf = new Map(map.tasks.map((task) => [task.slug, task.category]));
  const pairs = new Set<string>();
  for (const task of map.tasks) {
    if (!task.is_leaf) continue;
    for (const need of task.needs) {
      const other = categoryOf.get(need);
      if (!other || other === task.category) continue;
      pairs.add([task.category, other].sort().join("|"));
    }
  }
  return [...pairs].sort();
}

/**
 * Lays the project out as a map: the groups sit in a ring, each one given a
 * slice of the circle in proportion to how much work is in it, the jobs sit on
 * the outer ring in the order the tree puts them, and the groups themselves
 * sit inside, a ring further in for each level of nesting. A dependency that
 * crosses between two groups is drawn round the outside, where it can't cross
 * anything else.
 */
export function layoutMap(
  map: ProjectMap,
  size: { width: number; height: number },
  focus: string | null = null,
  hideDone = false,
): MapLayout {
  const width = Math.max(size.width, 300);
  const height = Math.max(size.height, 300);
  const centre = { x: width / 2, y: height / 2 };
  const label = Math.max(120, Math.min(190, width * 0.4));

  const roots = buildTree(map);

  allocate(roots, -Math.PI / 2, TAU);

  // The map is an ellipse, so it fills the space it is given. Round the outside
  // of it is the halo of dependencies that cross between groups.
  const narrow = width < 700;
  const labelRoom = narrow ? 18 : LABEL_ROOM;
  const halo = 0.13;
  const rx = Math.max(80, (width / 2 - labelRoom - 12) / (1 + halo));
  const ry = Math.max(80, (height / 2 - labelRoom - 12) / (1 + halo));
  const haloSpace = halo * Math.min(rx, ry);

  const hubs: Hub[] = [];
  const dots: Dot[] = [];
  const lines: Line[] = [];
  const pills: Pill[] = [];
  const notes: NoteDot[] = [];
  const placed = new Map<string, { x: number; y: number; angle: number; dimmed: boolean; hidden: boolean }>();

  // The done work comes out of the drawing, but not out of the layout.
  const isHidden = (node: Tree) => {
    const done = node.task?.state === "done";
    const next = node.slug === node.category.next;
    return Boolean(hideDone && done && node.task?.is_leaf && !next);
  };

  // Where every node sits, and whether it is showing.
  const walk = (node: Tree) => {
    const at = ring(node, centre, rx, ry);
    const dimmed = focus !== null && focus !== node.category.slug;
    const next = node.slug === node.category.next;
    const done = node.task?.state === "done";
    const hidden = isHidden(node);
    placed.set(node.slug, { x: at.x, y: at.y, angle: node.angle, dimmed, hidden });

    if (node.depth === 1) {
      hubs.push({ category: node.category, x: at.x, y: at.y, dimmed });
      lines.push({
        id: `hub-${node.slug}`,
        d: `M ${centre.x.toFixed(1)} ${centre.y.toFixed(1)} L ${at.x.toFixed(1)} ${at.y.toFixed(1)}`,
        kind: "hub",
        dimmed,
        hidden: false,
      });
    } else if (node.task) {
      dots.push({
        task: node.task,
        x: at.x,
        y: at.y,
        r: next ? 11 : node.task.is_leaf ? radius(node.task) : 8,
        next,
        done: Boolean(done),
        group: !node.task.is_leaf,
        dimmed,
        hidden,
      });
    }

    for (const child of node.children) {
      const childAt = ring(child, centre, rx, ry);
      lines.push({
        id: `branch-${child.slug}`,
        d: `M ${at.x.toFixed(1)} ${at.y.toFixed(1)} L ${childAt.x.toFixed(1)} ${childAt.y.toFixed(1)}`,
        kind: "branch",
        dimmed: focus !== null && focus !== child.category.slug,
        hidden: isHidden(child),
      });
      walk(child);
    }
  };
  roots.forEach(walk);

  // A dependency inside a group: a short curve, within the group's own slice.
  const categoryOf = new Map(map.tasks.map((task) => [task.slug, task.category]));
  for (const task of map.tasks) {
    if (!task.is_leaf) continue;
    const to = placed.get(task.slug);
    if (!to) continue;
    for (const need of task.needs) {
      const from = placed.get(need);
      if (!from) continue;
      if (categoryOf.get(need) !== task.category) continue;
      const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const bow = 0.16;
      const control = { x: middle.x - dy * bow, y: middle.y + dx * bow };
      lines.push({
        id: `needs-${need}-${task.slug}`,
        d: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
        kind: "dependency",
        dimmed: from.dimmed || to.dimmed,
        hidden: from.hidden || to.hidden,
      });
    }
  }

  // A dependency that crosses between groups: round the outside, so it crosses nothing.
  const crossing: { a: string; b: string; pair: string }[] = [];
  for (const task of map.tasks) {
    if (!task.is_leaf) continue;
    for (const need of task.needs) {
      const other = categoryOf.get(need);
      if (!other || other === task.category) continue;
      const pair = [task.category, other].sort().join("|");
      if (!crossing.some((one) => one.a === need && one.b === task.slug)) crossing.push({ a: need, b: task.slug, pair });
    }
  }
  // The arcs of one pair of groups sit together, so the halo reads as a few
  // connections rather than a crowd of lines.
  const order = new Map(crossPairs(map).map((pair, index) => [pair, index]));
  crossing.sort((one, two) => (order.get(one.pair) ?? 0) - (order.get(two.pair) ?? 0));
  const step = haloSpace / Math.max(1, crossing.length);
  crossing.forEach((edge, index) => {
    const from = placed.get(edge.a);
    const to = placed.get(edge.b);
    if (!from || !to) return;
    const gap = 10 + (index + 0.5) * step;
    lines.push({
      id: `needs-${edge.a}-${edge.b}`,
      d: aroundArc(from, to, centre, rx, ry, gap),
      kind: "cross",
      dimmed: from.dimmed || to.dimmed,
      hidden: from.hidden || to.hidden,
    });
  });

  // The next task of each group is called out, out towards the edge of the map.
  // On a narrow screen there is only room for the group being looked at.
  const roomForAll = width >= 700;
  for (const category of map.categories) {
    const next = category.next;
    if (!next) continue;
    if (focus ? focus !== category.slug : !roomForAll) continue;
    const at = placed.get(next);
    if (!at) continue;
    const outward = Math.abs(Math.cos(at.angle)) > 0.5 ? (Math.cos(at.angle) < 0 ? "left" : "right") : Math.sin(at.angle) < 0 ? "above" : "below";
    const size = labelSize(map.tasks.find((task) => task.slug === next)?.title ?? "", label);
    const spot = place(at.x, at.y, outward, size, width, height);
    pills.push({ task: map.tasks.find((task) => task.slug === next)!, x: spot.x, y: spot.y, side: spot.side, colour: category.colour });
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
