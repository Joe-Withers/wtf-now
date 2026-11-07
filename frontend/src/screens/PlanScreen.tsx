import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getJson, type Home as HomeData, type TaskDetail, type TreeNode } from "../api";
import { useChat } from "../chat-state";
import { Loading, Pill, ProgressBar, ScreenHead } from "../components/ui";
import { ViewSwitch } from "../components/ViewSwitch";
import { dependencyEdge, layoutPlan, treeEdge, type Positioned } from "../plan/layout";
import { useSize } from "../useSize";

/** Which nodes are open, so the plan is where you left it. */
const opened = new Set<string>();

function meta(node: TreeNode): string {
  const parts = [`${Math.round(node.progress)}%`];
  if (node.blocked) parts.push("blocked");
  else if (node.children.length > 0) parts.push(`${node.children.length} ${node.children.length === 1 ? "part" : "parts"}`);
  return parts.join(" · ");
}

function Card({
  item,
  open,
  selected,
  onSelect,
  onToggle,
}: {
  item: Positioned;
  open: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const node = item.node;
  return (
    <div className={`node-card ${node.state}${selected ? " selected" : ""}`}>
      <button className="node-select" onClick={onSelect} aria-expanded={selected}>
        <span className="node-title">{node.title}</span>
        <span className="node-meta">{meta(node)}</span>
      </button>
      {node.state !== "todo" && <Pill state={node.state} kind={node.kind} />}
      {node.children.length > 0 && (
        <button
          className="node-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} ${node.title}`}
        >
          {open ? "▾" : "▸"}
        </button>
      )}
    </div>
  );
}

function Detail({ slug, detail }: { slug: string; detail?: TaskDetail }) {
  const waits = detail?.blocked_by ?? [];
  const unlocks = detail?.dependents ?? [];
  const line =
    waits.length > 0
      ? `Needs first: ${waits.map((ref) => ref.title).join(", ")}`
      : unlocks.length > 0
        ? `Unlocks: ${unlocks.map((ref) => ref.title).join(", ")}`
        : "";

  return (
    <div className="node-detail">
      {line && <p className="meta">{line}</p>}
      <p className={detail?.current_state ? "quote" : "meta"}>
        {detail?.current_state || "Nothing recorded yet."}
      </p>
      <div className="button-row">
        <Link className="button" to={`/tasks/${slug}`}>
          Open task →
        </Link>
      </div>
    </div>
  );
}

export function PlanScreen() {
  const tree = useQuery({ queryKey: ["tree"], queryFn: () => getJson<TreeNode[]>("/tree") });
  const home = useQuery({ queryKey: ["home"], queryFn: () => getJson<HomeData>("/home") });
  const { setFocus } = useChat();
  const [open, setOpen] = useState<Set<string>>(() => new Set(opened));
  const [selected, setSelected] = useState<string | null>(null);
  const { ref, size } = useSize();

  // The first time, the areas are open, so you can see the shape of the project.
  useEffect(() => {
    if (!tree.data || opened.size > 0) return;
    for (const root of tree.data) opened.add(root.slug);
    setOpen(new Set(opened));
  }, [tree.data]);

  // The chat button is about the task you've picked out of the plan.
  useEffect(() => {
    setFocus(selected);
    return () => setFocus(null);
  }, [selected, setFocus]);

  const layout = useMemo(
    () => layoutPlan(tree.data ?? [], open, selected, size.width),
    [tree.data, open, selected, size.width],
  );
  const positions = new Map(layout.nodes.map((item) => [item.node.slug, item]));

  const detail = useQuery({
    queryKey: ["task", selected],
    queryFn: () => getJson<TaskDetail>(`/tasks/${selected}`),
    enabled: Boolean(selected),
  });

  const toggle = (slug: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      opened.clear();
      for (const item of next) opened.add(item);
      return next;
    });
  };

  const branches = layout.nodes
    .filter((item) => item.parent && positions.has(item.parent))
    .map((item) => ({
      key: item.node.slug,
      d: treeEdge(positions.get(item.parent as string) as Positioned, item),
    }));

  const links: { key: string; d: string }[] = [];
  const here = selected ? positions.get(selected) : undefined;
  if (here && detail.data) {
    for (const ref of detail.data.blocked_by) {
      const to = positions.get(ref.slug);
      if (to) links.push({ key: `needs-${ref.slug}`, d: dependencyEdge(to, here, layout.nodeWidth) });
    }
    for (const ref of detail.data.dependents) {
      const to = positions.get(ref.slug);
      if (to) links.push({ key: `unlocks-${ref.slug}`, d: dependencyEdge(here, to, layout.nodeWidth) });
    }
  }

  return (
    <main className="screen wide">
      <ScreenHead title="Plan" action={<ViewSwitch current="plan" />} />
      {home.data && (
        <section className="plan-summary">
          <ProgressBar value={home.data.overall_progress} label="Overall progress" />
          <div className="meta">
            {Math.round(home.data.overall_progress)}% of the whole project
            {home.data.days_away === 0 && " · last here today"}
            {home.data.days_away !== null && home.data.days_away > 0 && ` · last here ${home.data.days_away} days ago`}
          </div>
        </section>
      )}
      <Loading query={tree}>
        {() => (
          <div className="plan-area" ref={ref}>
            <div className="plan-canvas" style={{ width: layout.width, height: layout.height }}>
              <svg className="plan-edges" width={layout.width} height={layout.height} aria-hidden="true">
                {branches.map((edge) => (
                  <path key={edge.key} className="plan-edge" d={edge.d} />
                ))}
                {links.map((edge) => (
                  <path key={edge.key} className="plan-edge dependency" d={edge.d} />
                ))}
              </svg>
              {layout.nodes.map((item) => {
                const slug = item.node.slug;
                return (
                  <div
                    key={slug}
                    className="plan-node"
                    style={{ left: item.x, top: item.y, width: layout.nodeWidth }}
                  >
                    <Card
                      item={item}
                      open={open.has(slug)}
                      selected={selected === slug}
                      onSelect={() => setSelected(selected === slug ? null : slug)}
                      onToggle={() => toggle(slug)}
                    />
                    {selected === slug && <Detail slug={slug} detail={detail.data} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Loading>
    </main>
  );
}
