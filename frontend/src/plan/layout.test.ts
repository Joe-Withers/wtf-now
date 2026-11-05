import { describe, expect, test } from "vitest";

import type { TreeNode } from "../api";
import { ARC, DETAIL_HEIGHT, INDENT, NODE_HEIGHT, NODE_WIDTH, dependencyEdge, layoutPlan, treeEdge } from "./layout";

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
  const layout = layoutPlan(tree, new Set(["electrics"]));

  expect(layout.nodes.map((item) => item.node.slug)).toEqual(["electrics", "wire", "board", "floor"]);
  expect(layout.nodes[1].x).toBe(INDENT);
  expect(layout.nodes[1].y).toBeGreaterThan(layout.nodes[0].y);
});

test("the plan is as wide as its deepest node, plus room for the curves", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]));

  expect(layout.width).toBe(INDENT + NODE_WIDTH + ARC);
  expect(layout.height).toBe(4 * (NODE_HEIGHT + 14) - 14);
});

test("an open task's details take up room of their own", () => {
  const closed = layoutPlan(tree, new Set(["electrics"]));
  const open = layoutPlan(tree, new Set(["electrics"]), "electrics");

  expect(open.height).toBe(closed.height + DETAIL_HEIGHT);
});

test("a child hangs off its parent", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]));
  const [parent, child] = layout.nodes;

  expect(treeEdge(parent, child)).toBe(`M ${parent.x + 8} ${parent.y + NODE_HEIGHT} V ${child.y + NODE_HEIGHT / 2} H ${child.x}`);
});

test("a dependency is a curve, not a corner", () => {
  const layout = layoutPlan(tree, new Set(["electrics"]));
  const [parent, child] = layout.nodes;

  expect(dependencyEdge(parent, child)).toContain("C");
});
