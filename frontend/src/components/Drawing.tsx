import { createElement, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import type { Drawing, Shape, Zone } from "../api";
import { Pill } from "./ui";

function fill(zone: Zone): CSSProperties {
  if (zone.progress === null) return { fill: "var(--surface)" };
  if (zone.progress >= 100) return { fill: "var(--done)" };
  return { fill: `color-mix(in srgb, var(--now) ${Math.round(zone.progress * 0.75 + 15)}%, var(--surface))` };
}

function label(zone: Zone): string {
  return zone.progress === null ? "no tasks" : `${Math.round(zone.progress)}%`;
}

function shapes(drawing: Drawing): Shape[] {
  return drawing.shapes.length > 0 ? drawing.shapes : drawing.zones.flatMap((zone) => zone.shape ?? []);
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

/** A drawing at a glance: the shape of it, coloured by how far the work has got. */
export function DrawingPreview({ drawing }: { drawing: Drawing }) {
  const list = shapes(drawing);
  if (!drawing.view_box || list.length === 0) return null;
  const zones = new Map(drawing.zones.map((zone) => [zone.id, zone]));
  return (
    <svg className="drawing-preview" viewBox={drawing.view_box} aria-hidden="true">
      {list.map((shape, index) => {
        const owner = zones.get(shape.id);
        return createElement(shape.tag, {
          ...shape.attributes,
          ...(shape.id ? { id: shape.id } : {}),
          key: shape.id || index,
          className: owner ? "zone" : "outline",
          style: owner ? fill(owner) : undefined,
        });
      })}
    </svg>
  );
}

/** A drawing full size: its zones, and what's in them. */
export function DrawingView({ drawing }: { drawing: Drawing }) {
  const [selected, setSelected] = useState<string | null>(null);
  const zone = drawing.zones.find((candidate) => candidate.id === selected);
  const zones = new Map(drawing.zones.map((candidate) => [candidate.id, candidate]));
  const list = shapes(drawing);

  return (
    <section className="section">
      {drawing.view_box && list.length > 0 && (
        <svg className="plan" viewBox={drawing.view_box} role="img" aria-label={drawing.title}>
          {list.map((shape, index) => {
            const owner = zones.get(shape.id);
            return createElement(shape.tag, {
              ...shape.attributes,
              ...(shape.id ? { id: shape.id } : {}),
              key: shape.id || index,
              className: owner ? `zone${owner.id === selected ? " selected" : ""}` : "outline",
              style: owner ? fill(owner) : undefined,
              onClick: owner ? () => setSelected(owner.id) : undefined,
            });
          })}
          {drawing.zones.map((item) => (
            <ZoneLabel key={item.id} zone={item} />
          ))}
        </svg>
      )}
      <div className="zone-list">
        {drawing.zones.map((item) => (
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
