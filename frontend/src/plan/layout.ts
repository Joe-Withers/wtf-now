import type { TreeNode } from "../api";

/** How the plan is drawn: a column of nodes, indented by depth, with edges between them. */
export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 74;
export const NODE_GAP = 14;
export const INDENT = 24;
/** Room on the right for the curves that link one task to another. */
export const ARC = 30;
/** How much room an open task's details take, so the plan doesn't jump about. */
export const DETAIL_HEIGHT = 140;

export type Positioned = {
  node: TreeNode;
  x: number;
  y: number;
  depth: number;
  parent: string | null;
};

export type PlanLayout = {
  nodes: Positioned[];
  width: number;
  height: number;
};

/** Lays the tree out as a column. A node's children are only drawn when it's open. */
export function layoutPlan(tree: TreeNode[], opened: Set<string>, selected: string | null = null): PlanLayout {
  const nodes: Positioned[] = [];
  let y = 0;

  const visit = (node: TreeNode, depth: number, parent: string | null) => {
    nodes.push({ node, x: depth * INDENT, y, depth, parent });
    y += NODE_HEIGHT + NODE_GAP;
    if (node.slug === selected) y += DETAIL_HEIGHT;
    if (opened.has(node.slug)) for (const child of node.children) visit(child, depth + 1, node.slug);
  };

  for (const root of tree) visit(root, 0, null);

  const widest = nodes.reduce((widest, item) => Math.max(widest, item.x + NODE_WIDTH), 0);
  return { nodes, width: widest + ARC, height: Math.max(y - NODE_GAP, 0) };
}

/** The line from a parent down to one of its children. */
export function treeEdge(from: Positioned, to: Positioned): string {
  const x = from.x + 8;
  const y = from.y + NODE_HEIGHT;
  const middle = to.y + NODE_HEIGHT / 2;
  return `M ${x} ${y} V ${middle} H ${to.x}`;
}

/** The curve from one task to another it hangs on. */
export function dependencyEdge(from: Positioned, to: Positioned): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x + NODE_WIDTH;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bow = Math.max(x1, x2) + ARC * 0.8;
  return `M ${x1} ${y1} C ${bow} ${y1} ${bow} ${y2} ${x2} ${y2}`;
}
