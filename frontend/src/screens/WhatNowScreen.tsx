import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getJson, type WhatNow, type WorkItem } from "../api";
import { Loading, useChange } from "../components/ui";
import { WorkCard } from "../components/WorkCard";

const TIMES: { label: string; hours: number | null }[] = [
  { label: "Any time", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "Half a day", hours: 4 },
  { label: "All day", hours: 8 },
];

function Group({ title, items, action }: { title: string; items: WorkItem[]; action?: (item: WorkItem) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="card-stack">
        {items.map((item) => (
          <div className="card-stack" key={item.slug}>
            <WorkCard item={item} />
            {action?.(item)}
          </div>
        ))}
      </div>
    </section>
  );
}

export function WhatNowScreen() {
  const [time, setTime] = useState<number | null>(null);
  const [solo, setSolo] = useState(false);
  const change = useChange();

  const parameters = new URLSearchParams();
  if (time !== null) parameters.set("hours", String(time));
  if (solo) parameters.set("helper", "false");
  const query = useQuery({
    queryKey: ["what-now", time, solo],
    queryFn: () => getJson<WhatNow>(`/what-now?${parameters}`),
  });

  const markPurchase = (item: WorkItem, state: "doing" | "done", message: string) => (
    <button
      className="button"
      disabled={change.isPending}
      onClick={() => change.mutate({ path: `/tasks/${item.slug}/state`, body: { state }, message })}
    >
      {state === "doing" ? "Mark as ordered" : "It's arrived"}
    </button>
  );

  return (
    <main className="screen">
      <h1>What now?</h1>
      <section className="section" aria-label="Filters">
        <div className="chips">
          {TIMES.map((option) => (
            <button key={option.label} className="chip" aria-pressed={time === option.hours} onClick={() => setTime(option.hours)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="chips">
          <button className="chip" aria-pressed={solo} onClick={() => setSolo(!solo)}>
            On my own
          </button>
        </div>
      </section>
      <Loading query={query}>
        {(result) => (
          <>
            {result.can_do.length === 0 && <p className="empty">Nothing hands-on fits that right now.</p>}
            <Group title="Can do now" items={result.can_do} />
            <Group title="Order first" items={result.order_first} action={(item) => markPurchase(item, "doing", `Ordered ${item.title}`)} />
            <Group title="On its way" items={result.on_its_way} action={(item) => markPurchase(item, "done", `${item.title} arrived`)} />
            <Group title="Decide or research first" items={result.decide_first} />
          </>
        )}
      </Loading>
    </main>
  );
}
