import type { TreeNode } from "../api";

/** How the plan is drawn: cards indented by depth, in as many columns as there's room for. */
export const NODE_HEIGHT = 74;
export const NODE_GAP = 14;
export const INDENT = 24;
/** Room on the right for the curves that link one task to another. */
export const ARC = 30;
/** How much room an open task's details take, so the plan doesn't jump about. */
export const DETAIL_HEIGHT = 140;
export const MIN_NODE_WIDTH = 200;
export const MAX_NODE_WIDTH = 420;
export const COLUMN_GAP = 40;
/** The widths at which another column of work fits. */
export const TWO_COLUMNS_AT = 700;
export const THREE_COLUMNS_AT = 1080;

export type Positioned = {
  node: TreeNode;
  x: number;
  y: number;
  depth: number;
  column: number;
  parent: string | null;
};

export type PlanLayout = {
  nodes: Positioned[];
  width: number;
  height: number;
  nodeWidth: number;
  columns: number;
};

type Entry = { node: TreeNode; depth: number; parent: string | null };
type Chain = { entries: Entry[]; depth: number };

/** The top-level groups, split into columns of about the same height. */
function split(chains: Chain[], columns: number): Chain[][] {
  if (columns <= 1 || chains.length <= 1) return [chains];
  const total = chains.reduce((sum, chain) => sum + chain.entries.length, 0);
  const target = total / columns;
  const groups: Chain[][] = [[]];
  let height = 0;
  for (const chain of chains) {
    if (groups.length < columns && height >= target) {
      groups.push([]);
      height = 0;
    }
    groups[groups.length - 1].push(chain);
    height += chain.entries.length;
  }
  return groups;
}

/** Lays the tree out in columns. A node's children are only drawn when it's open. */
export function layoutPlan(
  tree: TreeNode[],
  opened: Set<string>,
  selected: string | null = null,
  width = 880,
): PlanLayout {
  const chains: Chain[] = tree.map((root) => {
    const entries: Entry[] = [];
    let depth = 0;
    const visit = (node: TreeNode, level: number, parent: string | null) => {
      entries.push({ node, depth: level, parent });
      depth = Math.max(depth, level);
      if (opened.has(node.slug)) for (const child of node.children) visit(child, level + 1, node.slug);
    };
    visit(root, 0, null);
    return { entries, depth };
  });

  const wanted = chains.length > 1 ? (width >= THREE_COLUMNS_AT ? 3 : width >= TWO_COLUMNS_AT ? 2 : 1) : 1;
  const groups = split(chains, wanted);
  const columns = groups.length;
  const columnWidth = (width - COLUMN_GAP * (columns - 1)) / columns;
  const deepest = Math.max(0, ...groups.map((group) => Math.max(0, ...group.map((chain) => chain.depth))));
  const nodeWidth = Math.max(
    MIN_NODE_WIDTH,
    Math.min(MAX_NODE_WIDTH, columnWidth - deepest * INDENT - ARC),
  );
  /** How much room one column of cards takes, from its left edge to the widest card. */
  const slot = nodeWidth + deepest * INDENT;

  const nodes: Positioned[] = [];
  let height = 0;

  groups.forEach((group, index) => {
    let y = 0;
    const left = index * (slot + COLUMN_GAP);
    for (const chain of group) {
      for (const entry of chain.entries) {
        nodes.push({
          node: entry.node,
          x: Math.round(left + entry.depth * INDENT),
          y,
          depth: entry.depth,
          column: index,
          parent: entry.parent,
        });
        y += NODE_HEIGHT + NODE_GAP;
        if (entry.node.slug === selected) y += DETAIL_HEIGHT;
      }
    }
    height = Math.max(height, y - NODE_GAP);
  });

  return {
    nodes,
    width: Math.round(columns * slot + COLUMN_GAP * (columns - 1) + ARC),
    height: Math.max(height, 0),
    nodeWidth,
    columns,
  };
}

/** The line from a parent down to one of its children. */
export function treeEdge(from: Positioned, to: Positioned): string {
  const x = from.x + 8;
  const y = from.y + NODE_HEIGHT;
  const middle = to.y + NODE_HEIGHT / 2;
  return `M ${x} ${y} V ${middle} H ${to.x}`;
}

/** The curve from one task to another it hangs on. */
export function dependencyEdge(from: Positioned, to: Positioned, nodeWidth: number): string {
  const x1 = from.x + nodeWidth;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x + nodeWidth;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bow = Math.max(x1, x2) + ARC * 0.8;
  return `M ${x1} ${y1} C ${bow} ${y1} ${bow} ${y2} ${x2} ${y2}`;
}
