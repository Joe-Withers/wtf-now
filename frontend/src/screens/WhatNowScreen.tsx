import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getJson, type MapTask, type ProjectMap } from "../api";
import { ProjectPanel } from "../components/ProjectPanel";
import { TaskPanel } from "../components/TaskPanel";
import { Loading } from "../components/ui";
import { ViewSwitch } from "../components/ViewSwitch";
import { EMPTY_MAP } from "../graph/layout";
import { FILTERS, day, layoutJobs, readyCounts, type FilterKey, type JobCard } from "../jobs/layout";
import { useSize } from "../useSize";

const KIND_LABELS: Record<MapTask["kind"], string> = {
  build: "Build",
  purchase: "Buy",
  research: "Research",
  decision: "Decide",
};

/** How far round the job is: done, started, ready to start, or waiting. */
function StatusRing({ card }: { card: JobCard }) {
  if (card.state === "done") {
    return (
      <svg viewBox="0 0 16 16" className="mark done" role="img" aria-label="Done">
        <circle cx="8" cy="8" r="8" fill="var(--done)" />
        <path d="M4.5 8.2l2.2 2.2 4.6-4.8" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (card.state === "doing") {
    const arc = 37.7 * (card.progress / 100);
    return (
      <svg viewBox="0 0 16 16" className="mark progress" role="img" aria-label="In progress">
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="var(--now)"
          strokeWidth="2"
          strokeDasharray={`${arc.toFixed(1)} 100`}
          transform="rotate(-90 8 8)"
        />
      </svg>
    );
  }
  if (card.column === "ready") {
    return (
      <svg viewBox="0 0 16 16" className="mark ready" role="img" aria-label="Ready">
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--now)" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="mark waiting" role="img" aria-label="Waiting">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

/** What a card says, in full, for anyone who can't see the whole of it. */
function describe(card: JobCard): string {
  if (card.column === "done") {
    return [card.title, card.label, card.day ? day(card.day) : null].filter(Boolean).join(", ");
  }
  return [card.title, KIND_LABELS[card.kind]].join(", ");
}

/** The shape of each kind of job, so a card says what it is at a glance. */
function KindIcon({ kind }: { kind: MapTask["kind"] }) {
  const path = {
    build: "M2.5 13.5l6.5-6.5M8 3.5l2-1.5 4 4-1.5 2z",
    purchase: "M1.5 2h2l1.6 8h7.2l1.4-5.5H4.3M6.2 13.2h.01M11.8 13.2h.01",
    decision: "M8 14V8.5M8 8.5L3.5 4M8 8.5L12.5 4M3.5 7V4h3M12.5 7V4h-3",
    research: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5L14 14",
  }[kind];
  return (
    <svg viewBox="0 0 16 16" className="kind-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

/** The sentence under the title: what you could be doing right now. */
function summary(map: ProjectMap): string {
  const { total, byKind } = readyCounts(map);
  if (total === 0) return "Nothing is ready right now. The log will say when it is.";
  const parts = [
    { kind: "build", name: "build" },
    { kind: "purchase", name: "to buy" },
    { kind: "decision", name: "to decide" },
    { kind: "research", name: "to research" },
  ]
    .filter((one) => byKind[one.kind])
    .map((one) => `${byKind[one.kind]} ${one.name}`);
  const things = `${total} ${total === 1 ? "thing" : "things"} you can do right now`;
  return `${things}${parts.length > 0 ? `: ${parts.join(", ")}` : ""}.`;
}

export function WhatNowScreen() {
  const project = useQuery({ queryKey: ["map"], queryFn: () => getJson<ProjectMap>("/map") });
  const [focus, setFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const { ref, size } = useSize();

  // The job you're looking at is in the address, so a link can point at it.
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
  const layout = useMemo(
    () => layoutJobs(map, size.width, selected, filter, focus),
    [map, size.width, selected, filter, focus],
  );
  const colours = new Map(map.categories.map((category) => [category.slug, category.colour]));
  const task = map.tasks.find((one) => one.slug === selected);

  return (
    <main className="screen wide jobs-screen">
      <Loading query={project}>
        {() => (
          <>
            <ProjectPanel map={map} focus={focus} onFocus={setFocus} />
            <div className="jobs-main">
              <div className="jobs-head">
                <div>
                  <h1>What now?</h1>
                  <p className="meta">{summary(map)}</p>
                </div>
                <ViewSwitch current="what-now" />
              </div>

              <div className="jobs-filters">
                {FILTERS.map((option) => (
                  <button
                    key={option.key}
                    className="chip"
                    aria-pressed={filter === option.key}
                    onClick={() => setFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="jobs-canvas" ref={ref} style={{ height: layout.height }}>
                <svg className="jobs-edges" width={layout.width} height={layout.height} aria-hidden="true">
                  {layout.edges.map((edge) => {
                    const middle = Math.round((edge.x1 + edge.x2) / 2);
                    return (
                      <path
                        key={edge.id}
                        className={`job-edge${edge.hot ? " hot" : ""}`}
                        d={`M ${edge.x1} ${edge.y1} H ${middle} V ${edge.y2} H ${edge.x2}`}
                      />
                    );
                  })}
                </svg>

                {layout.columns.map((column) => (
                  <div key={column.key} className="jobs-column" style={{ left: column.x, width: layout.cardWidth }}>
                    <h2 className={`jobs-column-head ${column.key}`}>
                      {column.label}
                      <span className="meta">{column.count}</span>
                    </h2>
                  </div>
                ))}

                {layout.cards.map((card) => (
                  <button
                    key={`${card.column}-${card.slug}`}
                    className={`job-card${card.selected ? " selected" : ""}${card.dimmed ? " faded" : ""}`}
                    style={{ left: card.x, top: card.y, width: card.width, height: card.height }}
                    onClick={() => setSelected(card.slug === selected ? null : card.slug)}
                    aria-pressed={card.selected}
                    aria-label={describe(card)}
                    title={describe(card)}
                  >
                    <StatusRing card={card} />
                    <span className="job-title">{card.title}</span>
                    {card.column === "done" ? (
                      <span className="job-kind">{card.day ? day(card.day) : ""}</span>
                    ) : (
                      <span className="job-kind">
                        <KindIcon kind={card.kind} />
                        {card.state === "doing" && card.kind !== "purchase" ? `${Math.round(card.progress)}%` : ""}
                      </span>
                    )}
                    <span className={`dot cat-${colours.get(card.category) ?? 0}`} aria-hidden="true" />
                  </button>
                ))}
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
