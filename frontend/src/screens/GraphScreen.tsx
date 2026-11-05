import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { getJson, type Graph, type GraphNode, type TaskDetail } from "../api";
import { Loading } from "../components/ui";

function Blocked({ nodes }: { nodes: GraphNode[] }) {
  const [, setParameters] = useSearchParams();
  const blocked = nodes.filter((node) => node.blocked && node.is_leaf && node.state !== "done");

  return (
    <section className="section">
      <h2>Blocked tasks</h2>
      {blocked.length === 0 && <p className="empty">Nothing's blocked.</p>}
      <div className="link-list">
        {blocked.map((node) => (
          <button key={node.slug} className="link-card stack" onClick={() => setParameters({ task: node.slug })}>
            <span>{node.title}</span>
            {node.waiting_on && node.waiting_on.length > 0 && (
              <span className="why">Waiting on {node.waiting_on.join(", ")}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function Focus({ slug }: { slug: string }) {
  const [, setParameters] = useSearchParams();
  const query = useQuery({ queryKey: ["task", slug], queryFn: () => getJson<TaskDetail>(`/tasks/${slug}`) });
  const go = (task: string) => setParameters({ task });

  return (
    <Loading query={query}>
      {(task) => {
        const blocking = new Set(task.blocked_by.map((ref) => ref.slug));
        const direct = new Set(task.depends_on.map((dependency) => dependency.slug));
        const nested = task.blocked_by.filter((ref) => !direct.has(ref.slug));
        return (
          <>
            <section className="section">
              <h2>Needs first</h2>
              {task.depends_on.length === 0 && nested.length === 0 && <p className="empty">Nothing. This can start any time.</p>}
              <div className="link-list">
                {task.depends_on.map((dependency) => (
                  <button
                    key={dependency.slug}
                    className={`link-card${dependency.strength === "soft" ? " soft" : ""}${dependency.done ? " finished" : ""}`}
                    onClick={() => go(dependency.slug)}
                  >
                    <span>{dependency.title}</span>
                    <span className={`why${blocking.has(dependency.slug) ? " blocking" : ""}`}>
                      {dependency.done
                        ? "Done"
                        : dependency.strength === "soft"
                          ? "Easier first"
                          : dependency.inherited_from
                            ? `Blocking, via ${dependency.inherited_from}`
                            : "Blocking"}
                    </span>
                  </button>
                ))}
                {nested.map((ref) => (
                  <button key={ref.slug} className="link-card" onClick={() => go(ref.slug)}>
                    <span>{ref.title}</span>
                    <span className="why blocking">Blocking</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="card focus-card">
              <div className="card-title lead">{task.title}</div>
              <div className="meta">{blocking.size > 0 ? "Blocked" : task.state === "done" ? "Done" : "Ready"}</div>
              <Link className="meta" to={`/tasks/${task.slug}`}>
                Open this task →
              </Link>
            </section>

            <section className="section">
              <h2>Unlocks</h2>
              {task.dependents.length === 0 && <p className="empty">Nothing depends on this.</p>}
              <div className="link-list">
                {task.dependents.map((ref) => (
                  <button key={ref.slug} className={`link-card${ref.state === "done" ? " finished" : ""}`} onClick={() => go(ref.slug)}>
                    <span>{ref.title}</span>
                  </button>
                ))}
              </div>
            </section>

            <button className="button" onClick={() => setParameters({})}>
              Back to blocked tasks
            </button>
          </>
        );
      }}
    </Loading>
  );
}

export function GraphScreen() {
  const [parameters] = useSearchParams();
  const task = parameters.get("task");
  const graph = useQuery({ queryKey: ["graph"], queryFn: () => getJson<Graph>("/graph"), enabled: !task });

  return (
    <main className="screen">
      <h1>Dependencies</h1>
      {task ? <Focus key={task} slug={task} /> : <Loading query={graph}>{(data) => <Blocked nodes={data.nodes} />}</Loading>}
    </main>
  );
}
