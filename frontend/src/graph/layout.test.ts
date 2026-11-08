import type { MapTask, ProjectMap } from "../api";
import { layoutMap } from "./layout";

const task = (overrides: Partial<MapTask> = {}): MapTask => ({
  slug: "wire",
  title: "Run the cables",
  kind: "build",
  state: "todo",
  progress: 0,
  category: "electrics",
  parent: "electrics",
  is_leaf: true,
  needs: [],
  blocks: [],
  children: [],
  note: "",
  ...overrides,
});

const map: ProjectMap = {
  total: 3,
  done: 0,
  progress: 0,
  categories: [
    { slug: "electrics", title: "Electrics", colour: 1, total: 2, done: 0, progress: 0, next: "wire" },
    { slug: "insulation", title: "Insulation", colour: 2, total: 1, done: 0, progress: 0, next: "wool" },
  ],
  tasks: [
    task({ slug: "wire", needs: [] }),
    task({ slug: "fridge", title: "Fit the fridge", needs: ["wire"] }),
    task({ slug: "wool", title: "Lay the wool", category: "insulation", parent: "insulation" }),
  ],
  notes: [{ slug: "blue-box", title: "The blue box", task: "wire" }],
  recent: [],
};

const size = { width: 900, height: 600 };

/** How far a dot is from the middle of the map, as a part of the outer ring. */
const out = (layout: ReturnType<typeof layoutMap>, dot: { x: number; y: number }) =>
  Math.hypot((dot.x - layout.centre.x) / layout.rx, (dot.y - layout.centre.y) / layout.ry);

/** Where a dot sits around the circle. */
const around = (layout: ReturnType<typeof layoutMap>, dot: { x: number; y: number }) =>
  Math.atan2((dot.y - layout.centre.y) / layout.ry, (dot.x - layout.centre.x) / layout.rx);

/** The angle from one to another, the short way round. */
const apart = (one: number, two: number) => {
  const span = Math.abs(one - two) % (Math.PI * 2);
  return span > Math.PI ? Math.PI * 2 - span : span;
};

test("the groups sit in a ring around the centre", () => {
  const layout = layoutMap(map, size);

  expect(layout.hubs).toHaveLength(2);
  for (const hub of layout.hubs) {
    const distance = Math.hypot(hub.x - layout.centre.x, hub.y - layout.centre.y);
    expect(distance).toBeGreaterThan(50);
  }
});

test("the work sits inside to out: a job that waits on another is further out", () => {
  const layout = layoutMap(map, size);

  const wire = layout.dots.find((dot) => dot.task.slug === "wire");
  const fridge = layout.dots.find((dot) => dot.task.slug === "fridge");

  expect(wire?.level).toBe(0);
  expect(fridge?.level).toBe(1);
  expect(out(layout, fridge!)).toBeGreaterThan(out(layout, wire!));
});

test("a group under a group sits inside the ring", () => {
  const nested: ProjectMap = {
    ...map,
    categories: [{ slug: "electrics", title: "Electrics", colour: 1, total: 3, done: 0, progress: 0, next: "wire" }],
    tasks: [
      task({ slug: "electrics-board", title: "The board", parent: "electrics", is_leaf: false, children: ["wire"] }),
      task({ slug: "wire", parent: "electrics-board" }),
    ],
  };

  const layout = layoutMap(nested, size);

  const group = layout.dots.find((dot) => dot.task.slug === "electrics-board");
  const job = layout.dots.find((dot) => dot.task.slug === "wire");
  expect(group?.group).toBe(true);
  expect(out(layout, group!)).toBeLessThan(out(layout, job!));
});

test("hiding the done work leaves everything where it was", () => {
  const withDone: ProjectMap = {
    ...map,
    tasks: [...map.tasks, task({ slug: "old", title: "Old work", state: "done" })],
  };

  const before = layoutMap(withDone, size);
  const after = layoutMap(withDone, size, null, true);

  const place = (layout: ReturnType<typeof layoutMap>) =>
    layout.dots.map((dot) => `${dot.task.slug}:${dot.x.toFixed(2)},${dot.y.toFixed(2)}`);
  expect(place(after)).toEqual(place(before));

  const old = after.dots.find((dot) => dot.task.slug === "old");
  expect(old?.hidden).toBe(true);
});

test("the job to do next sparkles, a few more glow, and no label is drawn until a job is picked", () => {
  const recommended: ProjectMap = {
    ...map,
    tasks: map.tasks.map((one) =>
      one.slug === "wire" ? { ...one, recommended: "next" as const } : one.slug === "wool" ? { ...one, recommended: "also" as const } : one,
    ),
  };

  const layout = layoutMap(recommended, size);

  expect(layout.dots.find((dot) => dot.task.slug === "wire")).toMatchObject({ next: true, also: false });
  expect(layout.dots.find((dot) => dot.task.slug === "wool")).toMatchObject({ next: false, also: true });
  expect(layout.dots.filter((dot) => dot.next)).toHaveLength(1);
  expect(layout.pills).toHaveLength(0);
});

test("the job that is picked is called out with a label", () => {
  const layout = layoutMap(map, size, null, false, "fridge");

  expect(layout.pills.map((pill) => pill.task.slug)).toEqual(["fridge"]);
  expect(layout.pills[0].colour).toBe(1);
});

test("a label does not land on top of the work", () => {
  const layout = layoutMap(map, size, null, false, "wire");

  const pill = layout.pills.find((one) => one.task.slug === "wire")!;
  for (const dot of layout.dots) {
    const clear = Math.hypot(dot.x - pill.x, dot.y - pill.y) > 30;
    expect(clear || dot.task.slug === "wire").toBe(true);
  }
});

test("a dependency inside a group is a plain line", () => {
  const layout = layoutMap(map, size);

  const line = layout.lines.find((one) => one.id === "needs-wire-fridge");
  expect(line?.kind).toBe("dependency");
});

test("a dependency across groups is a dashed line", () => {
  const crossing = {
    ...map,
    tasks: [
      task({ slug: "wire", needs: ["wool"] }),
      task({ slug: "fridge", title: "Fit the fridge", needs: ["wire"] }),
      task({ slug: "wool", title: "Lay the wool", category: "insulation", parent: "insulation" }),
    ],
  };

  const layout = layoutMap(crossing, size);

  const line = layout.lines.find((one) => one.id === "needs-wool-wire");
  expect(line?.kind).toBe("cross");
});

test("a dependency says which job it comes from and which waits on it", () => {
  const layout = layoutMap(map, size);

  const line = layout.lines.find((one) => one.id === "needs-wire-fridge");
  expect(line?.from).toBe("wire");
  expect(line?.to).toBe("fridge");
});

test("a job held up by unfinished work is waiting; one that is free is not", () => {
  const layout = layoutMap(map, size);

  expect(layout.dots.find((dot) => dot.task.slug === "fridge")?.waiting).toBe(true);
  expect(layout.dots.find((dot) => dot.task.slug === "wire")?.waiting).toBe(false);
});

test("a job sits on the side of its group that the work it waits on is on", () => {
  const crossing: ProjectMap = {
    ...map,
    tasks: [
      task({ slug: "wire", needs: [] }),
      task({ slug: "board", title: "Fit the board", needs: ["wool"] }),
      task({ slug: "wool", title: "Lay the wool", category: "insulation", parent: "insulation" }),
    ],
  };

  const layout = layoutMap(crossing, size);

  const wire = layout.dots.find((dot) => dot.task.slug === "wire")!;
  const board = layout.dots.find((dot) => dot.task.slug === "board")!;
  const wool = layout.dots.find((dot) => dot.task.slug === "wool")!;

  // The board waits on the wool, so it sits nearer to it than the wire, which
  // waits on nothing, does.
  const toWool = (dot: typeof wire) => apart(around(layout, dot), around(layout, wool));
  expect(toWool(board)).toBeLessThan(toWool(wire));
});

test("a note about a task sits beside it", () => {
  const layout = layoutMap(map, size);

  const note = layout.notes.find((one) => one.slug === "blue-box");
  const dot = layout.dots.find((one) => one.task.slug === "wire");
  expect(note).toBeDefined();
  expect(Math.hypot((note?.x ?? 0) - (dot?.x ?? 0), (note?.y ?? 0) - (dot?.y ?? 0))).toBeLessThan(20);
});

test("focusing one group dims the rest", () => {
  const layout = layoutMap(map, size, "electrics");

  expect(layout.hubs.find((hub) => hub.category.slug === "electrics")?.dimmed).toBe(false);
  expect(layout.hubs.find((hub) => hub.category.slug === "insulation")?.dimmed).toBe(true);
  expect(layout.dots.every((dot) => dot.dimmed === (dot.task.category !== "electrics"))).toBe(true);
});

test("a job with no group above it is tied to its own dot", () => {
  const loose: ProjectMap = {
    ...map,
    categories: [...map.categories, { slug: "garage", title: "Garage", colour: 3, total: 1, done: 0, progress: 0, next: "garage" }],
    tasks: [...map.tasks, task({ slug: "garage", title: "Garage", category: "garage", parent: null })],
  };

  const layout = layoutMap(loose, size);

  expect(layout.lines.some((line) => line.id === "branch-garage")).toBe(true);
});
