import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getJson, type Shopping, type ShoppingItem } from "../api";
import { Loading, ScreenHead } from "../components/ui";

const money = (value: number) => `£${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

function Item({ item }: { item: ShoppingItem }) {
  const blocked = item.blocked_by.length > 0;
  return (
    <div className="card shop-item">
      <Link to={`/tasks/${item.slug}`}>
        <div className="card-title">{item.title}</div>
        <div className="meta">{[item.area, item.cost !== null ? money(item.cost) : "No price yet"].filter(Boolean).join(" · ")}</div>
        {blocked && <div className="meta warn">Waiting on {item.blocked_by.map((ref) => ref.title).join(", ")}</div>}
      </Link>
    </div>
  );
}

function Group({ title, items }: { title: string; items: ShoppingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="card-stack">
        {items.map((item) => (
          <Item key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
}

export function ShoppingScreen() {
  const query = useQuery({ queryKey: ["shopping"], queryFn: () => getJson<Shopping>("/shopping") });

  return (
    <main className="screen">
      <ScreenHead title="Shopping" />
      <Loading query={query}>
        {(shopping) => {
          const total = shopping.spent + shopping.still_to_spend;
          const spentPercent = total > 0 ? (shopping.spent / total) * 100 : 0;
          return (
            <div className="content">
              <section className="spend">
                <div className="figure">{money(shopping.still_to_spend)}</div>
                <div className="meta">
                  Still to spend{shopping.unpriced > 0 ? `, ${shopping.unpriced} not priced yet` : ""}
                </div>
                <div className="bar" role="progressbar" aria-label="Budget spent" aria-valuenow={Math.round(spentPercent)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${spentPercent}%` }} />
                </div>
                <div className="split">
                  <span>{money(shopping.spent)} spent</span>
                  <span>{money(total)} all told</span>
                </div>
              </section>

              <Group title="To order" items={shopping.to_order} />
              <Group title="On order" items={shopping.on_order} />
              <Group title="Arrived" items={shopping.arrived} />
            </div>
          );
        }}
      </Loading>
    </main>
  );
}
