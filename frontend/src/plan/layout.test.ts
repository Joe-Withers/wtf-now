import { describe, expect, test } from "vitest";

import type { TreeNode } from "../api";
import {
  ARC,
  COLUMN_GAP,
  DETAIL_HEIGHT,
  INDENT,
  MAX_NODE_WIDTH,
  MIN_NODE_WIDTH,
  NODE_HEIGHT,
  dependencyEdge,
  layoutPlan,
  treeEdge,
} from "./layout";

const node = (slug: string, children: TreeNode[] = []): TreeNode => ({
  slug,
  title: slug,
  kind: "build",
  state: "todo",
  progress: 0,
  remaining_hours: 1,
  blocked: false,
  children,
});

const tree = [node("electrics", [node("wire"), node("board")]), node("floor", [node("ply")])];

test("a closed node keeps its children off the plan", () => {
  const layout = layoutPlan(tree, new Set());

  expect(layout.nodes.map((item) => item.node.slug)).toEqual(["electrics", "floor"]);
});

test("an open node brings its children in, indented", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]), null, 500);

  expect(layout.nodes.map((item) => item.node.slug)).toEqual(["electrics", "wire", "board", "floor"]);
  expect(layout.nodes[1].x).toBe(layout.nodes[0].x + INDENT);
  expect(layout.nodes[1].y).toBeGreaterThan(layout.nodes[0].y);
});

test("the plan is only as wide as the cards need", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]));

  expect(layout.width).toBe(2 * (layout.nodeWidth + INDENT) + COLUMN_GAP + ARC);
  expect(layout.width).toBeLessThanOrEqual(880);
  expect(layout.height).toBe(3 * (NODE_HEIGHT + 14) - 14);
});

test("a wide screen puts the work in three columns", () => {
  const many = [node("one"), node("two"), node("three")];

  const layout = layoutPlan(many, new Set(), null, 1400);

  expect(layout.columns).toBe(3);
  expect(new Set(layout.nodes.map((item) => item.column)).size).toBe(3);
});

test("a narrow screen keeps the work in one column", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]), null, 420);

  expect(layout.columns).toBe(1);
  expect(layout.width).toBeLessThanOrEqual(420);
});

test("the cards grow to fill the space, but not beyond what they can hold", () => {
  const narrow = layoutPlan(tree, new Set(["electrics"]), null, 800);
  const wide = layoutPlan(tree, new Set(["electrics"]), null, 1600);

  expect(wide.nodeWidth).toBeGreaterThan(narrow.nodeWidth);
  expect(wide.nodeWidth).toBe(MAX_NODE_WIDTH);
  expect(narrow.nodeWidth).toBeGreaterThanOrEqual(MIN_NODE_WIDTH);
});

test("an open task's details take up room of their own", () => {
  const closed = layoutPlan(tree, new Set(["electrics"]), null, 500);
  const open = layoutPlan(tree, new Set(["electrics"]), "electrics", 500);

  expect(open.height).toBe(closed.height + DETAIL_HEIGHT);
});

test("a child hangs off its parent", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]), null, 500);
  const [parent, child] = layout.nodes;

  expect(treeEdge(parent, child)).toBe(
    `M ${parent.x + 8} ${parent.y + NODE_HEIGHT} V ${child.y + NODE_HEIGHT / 2} H ${child.x}`,
  );
});

test("a dependency is a curve, not a corner", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]), null, 500);
  const [parent, child] = layout.nodes;

  expect(dependencyEdge(parent, child, layout.nodeWidth)).toContain("C");
});

test("the columns are about the same height", () => {
  const many = [
    node("one", [node("a"), node("b"), node("c")]),
    node("two", [node("d")]),
    node("three", [node("e"), node("f")]),
  ];

  const layout = layoutPlan(many, new Set(["one", "three"]), null, 1200);

  const heights = new Map<number, number>();
  for (const item of layout.nodes) {
    heights.set(item.column, Math.max(heights.get(item.column) ?? 0, item.y));
  }
  const columns = [...heights.values()];
  expect(columns).toHaveLength(2);
  expect(Math.abs(columns[0] - columns[1])).toBeLessThanOrEqual(NODE_HEIGHT * 2);
});
