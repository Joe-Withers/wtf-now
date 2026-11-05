import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getJson, type TreeNode } from "../api";
import { Loading, ProgressBar, ScreenHead } from "../components/ui";

// Kept outside the component so the tree stays open after visiting a task.
const opened = new Set<string>();

function badge(node: TreeNode) {
  if (node.state === "done") return <span className="badge done">Done</span>;
  if (node.blocked && node.children.length === 0) return <span className="badge">Blocked</span>;
  return <span className="meta">{Math.round(node.progress)}%</span>;
}

function Row({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(opened.has(node.slug));
  const parent = node.children.length > 0;

  const toggle = () => {
    if (open) opened.delete(node.slug);
    else opened.add(node.slug);
    setOpen(!open);
  };

  return (
    <>
      <div className={`tree-row${node.state === "done" ? " is-done" : ""}`} style={{ paddingLeft: depth * 14 }}>
        {parent ? (
          <button className="toggle" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${node.title}`} onClick={toggle}>
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="spacer" />
        )}
        <Link className="tree-link" to={`/tasks/${node.slug}`}>
          <span className="tree-title">
            <span>{node.title}</span>
            {badge(node)}
          </span>
          {node.progress > 0 && <ProgressBar value={node.progress} label={`${node.title} progress`} />}
        </Link>
      </div>
      {open && node.children.map((child) => <Row key={child.slug} node={child} depth={depth + 1} />)}
    </>
  );
}

export function Tasks() {
  const query = useQuery({ queryKey: ["tree"], queryFn: () => getJson<TreeNode[]>("/tree") });

  return (
    <main className="screen">
      <ScreenHead title="Tasks" />
      <Loading query={query}>
        {(tree) =>
          tree.length === 0 ? (
            <p className="empty">No tasks yet. Start in the chat.</p>
          ) : (
            <div className="tree">
              {tree.map((node) => (
                <Row key={node.slug} node={node} depth={0} />
              ))}
            </div>
          )
        }
      </Loading>
    </main>
  );
}
