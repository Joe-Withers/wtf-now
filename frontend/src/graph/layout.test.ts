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

test("the groups sit in a ring around the centre", () => {
  const layout = layoutMap(map, size);

  expect(layout.hubs).toHaveLength(2);
  for (const hub of layout.hubs) {
    const distance = Math.hypot(hub.x - layout.centre.x, hub.y - layout.centre.y);
    expect(distance).toBeGreaterThan(50);
  }
});

test("the next task of a group is called out with a label", () => {
  const layout = layoutMap(map, size);

  expect(layout.pills.map((pill) => pill.task.slug)).toEqual(["wire", "wool"]);
  const dot = layout.dots.find((one) => one.task.slug === "wire");
  const pill = layout.pills.find((one) => one.task.slug === "wire");
  expect(dot?.next).toBe(true);
  expect(pill).toBeDefined();
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
      task({ slug: "fridge", needs: ["wire"] }),
      task({ slug: "wool", title: "Lay the wool", category: "insulation", parent: "insulation" }),
    ],
  };

  const layout = layoutMap(crossing, size);

  const line = layout.lines.find((one) => one.id === "needs-wool-wire");
  expect(line?.kind).toBe("cross");
});

test("a note about a task sits beside it", () => {
  const layout = layoutMap(map, size);

  const note = layout.notes.find((one) => one.slug === "blue-box");
  const dot = layout.dots.find((one) => one.task.slug === "wire");
  expect(note).toBeDefined();
  expect(Math.hypot((note?.x ?? 0) - (dot?.x ?? 0), (note?.y ?? 0) - (dot?.y ?? 0))).toBeLessThan(20);
});

test("focusing one group dims the rest, and calls out only that one", () => {
  const layout = layoutMap(map, size, "electrics");

  expect(layout.hubs.find((hub) => hub.category.slug === "electrics")?.dimmed).toBe(false);
  expect(layout.hubs.find((hub) => hub.category.slug === "insulation")?.dimmed).toBe(true);
  expect(layout.dots.every((dot) => dot.dimmed === (dot.task.category !== "electrics"))).toBe(true);
  expect(layout.pills.map((pill) => pill.task.slug)).toEqual(["wire"]);
});
