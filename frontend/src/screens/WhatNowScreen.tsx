import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getJson, type RecentStep, type WhatNow, type WorkItem } from "../api";
import { Loading, Pill, ScreenHead } from "../components/ui";
import { WorkCard } from "../components/WorkCard";

const TIMES: { label: string; hours: number | null }[] = [
  { label: "Any time", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "Half a day", hours: 4 },
  { label: "All day", hours: 8 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return `${date} ${MONTHS[month - 1]}`;
}

/** A step of work the log says already happened. */
function Done({ step }: { step: RecentStep }) {
  return (
    <li className="flow-step done">
      <span className="flow-mark" aria-hidden="true">
        ✓
      </span>
      <div className="flow-body">
        <Link className="flow-card" to={`/tasks/${step.slug}`}>
          <div className="card-head">
            <div className="card-title">{step.title}</div>
            {step.state !== "todo" && <Pill state={step.state} kind={step.kind} />}
          </div>
          <div className="meta">
            {step.label} · {day(step.day)}
          </div>
        </Link>
      </div>
    </li>
  );
}

/** A step of work still to do. The first one is the one to start on. */
function Next({ item, lead }: { item: WorkItem; lead: boolean }) {
  return (
    <li className={`flow-step ${lead ? "next" : "later"}`}>
      <span className="flow-mark" aria-hidden="true" />
      <div className="flow-body">
        {lead && <div className="flow-badge">Recommended</div>}
        <WorkCard item={item} lead={lead} />
      </div>
    </li>
  );
}

function Group({ title, items }: { title: string; items: WorkItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="card-stack">
        {items.map((item) => (
          <WorkCard key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
}

export function WhatNowScreen() {
  const [time, setTime] = useState<number | null>(null);
  const [solo, setSolo] = useState(false);

  const parameters = new URLSearchParams();
  if (time !== null) parameters.set("hours", String(time));
  if (solo) parameters.set("helper", "false");
  const query = useQuery({
    queryKey: ["what-now", time, solo],
    queryFn: () => getJson<WhatNow>(`/what-now?${parameters}`),
  });

  return (
    <main className="screen">
      <ScreenHead title="What now?" />
      <div className="content">
        <section className="section" aria-label="Filters">
          <div className="scroll-row">
            {TIMES.map((option) => (
              <button key={option.label} className="chip" aria-pressed={time === option.hours} onClick={() => setTime(option.hours)}>
                {option.label}
              </button>
            ))}
            <button className="chip" aria-pressed={solo} onClick={() => setSolo(!solo)}>
              On my own
            </button>
          </div>
        </section>
        <Loading query={query}>
          {(result) => (
            <>
              {result.recent.length > 0 && (
                <section className="section">
                  <h2>Just done</h2>
                  <ol className="flow">
                    {result.recent.map((step) => (
                      <Done key={step.slug} step={step} />
                    ))}
                  </ol>
                </section>
              )}
              <section className="section">
                <h2 className="now">Next</h2>
                {result.can_do.length === 0 ? (
                  <p className="empty">Nothing hands-on fits that right now.</p>
                ) : (
                  <ol className="flow">
                    {result.can_do.map((item, index) => (
                      <Next key={item.slug} item={item} lead={index === 0} />
                    ))}
                  </ol>
                )}
              </section>
              <Group title="Order first" items={result.order_first} />
              <Group title="On its way" items={result.on_its_way} />
              <Group title="Decide or research first" items={result.decide_first} />
            </>
          )}
        </Loading>
      </div>
    </main>
  );
}
