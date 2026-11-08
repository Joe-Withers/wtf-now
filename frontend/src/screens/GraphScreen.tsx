import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getJson, type MapTask, type ProjectMap } from "../api";
import { ProjectPanel } from "../components/ProjectPanel";
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
  // Hiding the done work leaves the rest of the map where it is.
  const layout = useMemo(() => layoutMap(map, size, focus, hideDone, selected), [map, size, focus, hideDone, selected]);
  const colours = new Map(map.categories.map((category) => [category.slug, category.colour]));

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
                  {layout.lines
                    .filter((line) => !line.from || line.from === selected || line.to === selected)
                    .map((line) => (
                      <path
                        key={line.id}
                        className={`graph-line ${line.kind}${line.to === selected ? " needs" : ""}${line.from === selected ? " unlocks" : ""}${line.dimmed ? " dim" : ""}${line.hidden ? " hidden" : ""}`}
                        d={line.d}
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
                    style={{ left: hub.x, top: hub.y, "--progress": hub.category.progress } as React.CSSProperties}
                    aria-hidden="true"
                  />
                ))}
                {layout.dots.map((dot) => (
                  <button
                    key={dot.task.slug}
                    className={`graph-dot cat-${colours.get(dot.task.category) ?? 0}${dot.next ? " next" : ""}${dot.done ? " done" : ""}${dot.waiting ? " waiting" : ""}${dot.task.slug === selected ? " selected" : ""}${dot.group ? " group" : ""}${dot.dimmed ? " dim" : ""}${dot.hidden ? " hidden" : ""}`}
                    style={{ left: dot.x, top: dot.y, width: dot.r * 2, height: dot.r * 2 }}
                    onClick={() => setSelected(selected === dot.task.slug ? null : dot.task.slug)}
                    aria-label={dot.task.title}
                    aria-pressed={dot.task.slug === selected}
                    title={dot.task.title}
                    hidden={dot.hidden}
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
                  <Link
                    key={pill.task.slug}
                    className={`graph-pill cat-${pill.colour} ${pill.side}`}
                    style={{ left: pill.x, top: pill.y }}
                    to={`/tasks/${pill.task.slug}`}
                    aria-label={`Open ${pill.task.title}, ${KIND_LABELS[pill.task.kind]}`}
                    title={pill.task.title}
                  >
                    <span className="dot" aria-hidden="true" />
                    <span className="pill-text">{pill.task.title}</span>
                    <span className="pill-kind">{KIND_LABELS[pill.task.kind]}</span>
                  </Link>
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
                  <i className="swatch waiting" aria-hidden="true" />
                  Waiting
                </span>
                <span>
                  <i className="swatch needs" aria-hidden="true" />
                  Needs
                </span>
                <span>
                  <i className="swatch unlocks" aria-hidden="true" />
                  Unlocks
                </span>
              </div>
            </div>
          </>
        )}
      </Loading>
    </main>
  );
}
