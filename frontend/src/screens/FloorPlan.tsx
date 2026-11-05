import { useQuery } from "@tanstack/react-query";
import { createElement, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { getJson, type Layout, type Shape, type Zone } from "../api";
import { Loading, Pill, ScreenHead } from "../components/ui";

function style(zone: Zone): CSSProperties {
  if (zone.progress === null) return { fill: "var(--surface)" };
  if (zone.progress >= 100) return { fill: "var(--done)" };
  return { fill: `color-mix(in srgb, var(--now) ${Math.round(zone.progress * 0.75 + 15)}%, var(--surface))` };
}

function label(zone: Zone): string {
  return zone.progress === null ? "no tasks" : `${Math.round(zone.progress)}%`;
}

function ZoneLabel({ zone }: { zone: Zone }) {
  if (zone.shape?.tag !== "rect") return null;
  const { x = "0", y = "0", width = "0", height = "0" } = zone.shape.attributes;
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + Number(height) / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fill={zone.progress !== null && zone.progress >= 100 ? "var(--on-now)" : "var(--text)"}
    >
      {zone.title}
    </text>
  );
}

function Plan({ layout }: { layout: Layout }) {
  const [selected, setSelected] = useState<string | null>(null);
  const zone = layout.zones.find((candidate) => candidate.id === selected);
  const zones = new Map(layout.zones.map((candidate) => [candidate.id, candidate]));
  const shapes: Shape[] = layout.shapes.length > 0 ? layout.shapes : layout.zones.flatMap((candidate) => candidate.shape ?? []);

  return (
    <section className="section">
      {layout.view_box && shapes.length > 0 && (
        <svg className="plan" viewBox={layout.view_box} role="img" aria-label={layout.title}>
          {shapes.map((shape, index) => {
            const owner = zones.get(shape.id);
            return createElement(shape.tag, {
              ...shape.attributes,
              ...(shape.id ? { id: shape.id } : {}),
              key: shape.id || index,
              className: owner ? `zone${owner.id === selected ? " selected" : ""}` : "outline",
              style: owner ? style(owner) : undefined,
              onClick: owner ? () => setSelected(owner.id) : undefined,
            });
          })}
          {layout.zones.map((item) => (
            <ZoneLabel key={item.id} zone={item} />
          ))}
        </svg>
      )}
      <div className="zone-list">
        {layout.zones.map((item) => (
          <button key={item.id} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
            <span>{item.title}</span>
            <span className="meta">{label(item)}</span>
          </button>
        ))}
      </div>
      {zone && (
        <section className="section" aria-label={`Tasks in ${zone.title}`}>
          <h2>{zone.title}</h2>
          {zone.tasks.length === 0 && <p className="empty">Nothing here.</p>}
          <div>
            {zone.tasks.map((task) => (
              <Link key={task.slug} className="ref" to={`/tasks/${task.slug}`}>
                <span>{task.title}</span>
                <Pill state={task.state} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function FloorPlan() {
  const query = useQuery({ queryKey: ["layouts"], queryFn: () => getJson<Layout[]>("/layouts") });

  return (
    <main className="screen">
      <ScreenHead title="Floor plan" />
      <Loading query={query}>
        {(layouts) =>
          layouts.length === 0 ? (
            <section className="section">
              <p className="empty">No plan yet. Describe the layout to the AI, and it can draw a simple one.</p>
              <Link className="button" to="/chat" style={{ textAlign: "center", lineHeight: "22px" }}>
                Open the chat
              </Link>
            </section>
          ) : (
            layouts.map((layout) => <Plan key={layout.slug} layout={layout} />)
          )
        }
      </Loading>
    </main>
  );
}
