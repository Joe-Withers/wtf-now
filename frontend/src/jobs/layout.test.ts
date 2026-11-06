import type { MapTask, ProjectMap } from "../api";
import { layoutJobs, readyCounts } from "./layout";

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
  total: 4,
  done: 1,
  progress: 25,
  categories: [
    { slug: "electrics", title: "Electrics", colour: 1, total: 2, done: 0, progress: 0, next: "wire" },
    { slug: "insulation", title: "Insulation", colour: 2, total: 2, done: 1, progress: 50, next: "wool" },
  ],
  tasks: [
    task({ slug: "wire", needs: [], blocks: ["fridge"] }),
    task({ slug: "fridge", title: "Fit the fridge", needs: ["wire"], blocks: [] }),
    task({ slug: "wool", title: "Lay the wool", kind: "purchase", category: "insulation", parent: "insulation", needs: [], blocks: [] }),
    task({ slug: "felt", title: "Trim the felt", category: "insulation", parent: "insulation", state: "done", progress: 100 }),
  ],
  notes: [],
  recent: [
    { slug: "felt", title: "Trim the felt", kind: "build", category: "insulation", label: "Finished", day: "2026-08-10" },
  ],
};

test("the run is four columns, each with a count", () => {
  const layout = layoutJobs(map, 1200);

  expect(layout.columns.map((column) => column.key)).toEqual(["done", "ready", "up_next", "later"]);
  expect(layout.columns.map((column) => column.count)).toEqual([1, 2, 1, 0]);
});

test("the last finished things are in the done column", () => {
  const layout = layoutJobs(map, 1200);

  const [card] = layout.cards.filter((one) => one.column === "done");
  expect(card.slug).toBe("felt");
  expect(card.label).toBe("Finished");
});

test("work you could start now is ready, and the work one step away is up next", () => {
  const layout = layoutJobs(map, 1200);

  const columnOf = (slug: string) => layout.cards.find((one) => one.slug === slug)?.column;
  expect(columnOf("wire")).toBe("ready");
  expect(columnOf("wool")).toBe("ready");
  expect(columnOf("fridge")).toBe("up_next");
});

test("a line runs from a job to the job it holds up", () => {
  const layout = layoutJobs(map, 1200);

  expect(layout.edges).toHaveLength(1);
  const [edge] = layout.edges;
  expect(edge.from).toBe("wire");
  expect(edge.to).toBe("fridge");
  expect(edge.x1).toBeLessThan(edge.x2);
});

test("the lines touching the job you picked are lit", () => {
  const layout = layoutJobs(map, 1200, "fridge");

  expect(layout.edges[0].hot).toBe(true);
  expect(layoutJobs(map, 1200, "wire").edges[0].hot).toBe(true);
  expect(layoutJobs(map, 1200, "wool").edges[0].hot).toBe(false);
});

test("a filter fades the jobs of other kinds", () => {
  const layout = layoutJobs(map, 1200, null, "build");

  expect(layout.cards.find((one) => one.slug === "wire")?.dimmed).toBe(false);
  expect(layout.cards.find((one) => one.slug === "wool")?.dimmed).toBe(true);
});

test("focusing a group fades the jobs of the others", () => {
  const layout = layoutJobs(map, 1200, null, "all", "insulation");

  expect(layout.cards.find((one) => one.slug === "wool")?.dimmed).toBe(false);
  expect(layout.cards.find((one) => one.slug === "wire")?.dimmed).toBe(true);
});

test("the summary counts what you could do right now, by kind", () => {
  const counts = readyCounts(map);

  expect(counts.total).toBe(2);
  expect(counts.byKind.build).toBe(1);
  expect(counts.byKind.purchase).toBe(1);
});
