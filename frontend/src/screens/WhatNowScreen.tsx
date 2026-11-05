import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getJson, type WhatNow, type WorkItem } from "../api";
import { Loading, ScreenHead } from "../components/ui";
import { WorkCard } from "../components/WorkCard";

const TIMES: { label: string; hours: number | null }[] = [
  { label: "Any time", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "Half a day", hours: 4 },
  { label: "All day", hours: 8 },
];

function Group({ title, items, accent }: { title: string; items: WorkItem[]; accent?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2 className={accent ? "now" : undefined}>{title}</h2>
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
              {result.can_do.length === 0 && <p className="empty">Nothing hands-on fits that right now.</p>}
              <Group title="Can do now" items={result.can_do} accent />
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
