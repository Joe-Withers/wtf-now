import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getJson, type MapTask, type ProjectMap } from "../api";
import { ProjectPanel } from "../components/ProjectPanel";
import { TaskPanel } from "../components/TaskPanel";
import { Loading } from "../components/ui";
import { EMPTY_MAP, layoutMap } from "../graph/layout";
import { useSize } from "../useSize";

const KIND_LABELS: Record<MapTask["kind"], string> = {
  build: "Build",
  purchase: "Buy",
  research: "Research",
  decision: "Decide",
};

export function GraphScreen() {
  const project = useQuery({ queryKey: ["map"], queryFn: () => getJson<ProjectMap>("/map") });
  const [focus, setFocus] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const { ref, size } = useSize();

  // The task you're looking at is in the address, so a link can point at it.
  const [params, setParams] = useSearchParams();
  const selected = params.get("task");
  const setSelected = useCallback(
    (slug: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (slug) next.set("task", slug);
          else next.delete("task");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const map = project.data ?? EMPTY_MAP;
  const shown = useMemo(
    () => (hideDone ? { ...map, tasks: map.tasks.filter((task) => !task.is_leaf || task.state !== "done") } : map),
    [map, hideDone],
  );
  const layout = useMemo(() => layoutMap(shown, size, focus), [shown, size, focus]);
  const colours = new Map(map.categories.map((category) => [category.slug, category.colour]));
  const task = map.tasks.find((one) => one.slug === selected);

  return (
    <main className="screen wide graph-screen">
      <Loading query={project}>
        {() => (
          <>
            <ProjectPanel map={map} focus={focus} onFocus={setFocus} />
            <div className="graph-main">
              <div className="graph-toolbar">
                <button className="chip" aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)}>
                  Hide done
                </button>
                {focus && (
                  <button className="chip" onClick={() => setFocus(null)}>
                    Show everything
                  </button>
                )}
              </div>

              <div className="graph-canvas" ref={ref} style={{ "--pill-max": `${layout.label}px` } as React.CSSProperties}>
                <svg className="graph-lines" width={layout.width} height={layout.height} aria-hidden="true">
                  {layout.lines.map((line) => (
                    <line
                      key={line.id}
                      className={`graph-line ${line.kind}${line.dimmed ? " dim" : ""}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                    />
                  ))}
                </svg>
                <span
                  className="graph-centre"
                  style={{ left: layout.centre.x, top: layout.centre.y }}
                  aria-hidden="true"
                />
                {layout.hubs.map((hub) => (
                  <span
                    key={hub.category.slug}
                    className={`graph-hub cat-${hub.category.colour}${hub.dimmed ? " dim" : ""}`}
                    style={{ left: hub.x, top: hub.y }}
                    aria-hidden="true"
                  />
                ))}
                {layout.dots.map((dot) => (
                  <button
                    key={dot.task.slug}
                    className={`graph-dot cat-${colours.get(dot.task.category) ?? 0}${dot.next ? " next" : ""}${dot.done ? " done" : ""}${dot.dimmed ? " dim" : ""}`}
                    style={{ left: dot.x, top: dot.y, width: dot.r * 2, height: dot.r * 2 }}
                    onClick={() => setSelected(dot.task.slug)}
                    aria-label={dot.task.title}
                    title={dot.task.title}
                  />
                ))}
                {layout.notes.map((note) => (
                  <Link
                    key={note.slug}
                    className={`graph-note cat-${note.colour}`}
                    style={{ left: note.x, top: note.y }}
                    to={`/notes/${note.slug}`}
                    aria-label={note.title}
                    title={note.title}
                  />
                ))}
                {layout.pills.map((pill) => (
                  <button
                    key={pill.task.slug}
                    className={`graph-pill cat-${pill.colour} ${pill.side}`}
                    style={{ left: pill.x, top: pill.y }}
                    onClick={() => setSelected(pill.task.slug)}
                    aria-label={`Next up: ${pill.task.title}, ${KIND_LABELS[pill.task.kind]}`}
                    title={pill.task.title}
                  >
                    <span className="dot" aria-hidden="true" />
                    <span className="pill-text">{pill.task.title}</span>
                    <span className="pill-kind">{KIND_LABELS[pill.task.kind]}</span>
                  </button>
                ))}
              </div>

              <div className="graph-legend">
                <span>
                  <i className="swatch done" aria-hidden="true" />
                  Done
                </span>
                <span>
                  <i className="swatch next" aria-hidden="true" />
                  Next up
                </span>
                <span>
                  <i className="swatch note" aria-hidden="true" />
                  Note
                </span>
                <span>
                  <i className="swatch cross" aria-hidden="true" />
                  Cross-dependency
                </span>
              </div>

              {task && (
                <TaskPanel task={task} map={map} onSelect={setSelected} onClose={() => setSelected(null)} />
              )}
            </div>
          </>
        )}
      </Loading>
    </main>
  );
}
