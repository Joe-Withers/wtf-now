import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getJson, type Shopping, type ShoppingItem } from "../api";
import { Loading } from "../components/ui";

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
      <h1>Shopping</h1>
      <Loading query={query}>
        {(shopping) => (
          <>
            <Link className="meta" to="/chat">
              Ordered something, or did it turn up? Tell it →
            </Link>
            <section className="totals">
              <div className="card">
                <div className="total">{money(shopping.still_to_spend)}</div>
                <div className="meta">Still to spend{shopping.unpriced > 0 ? `, ${shopping.unpriced} unpriced` : ""}</div>
              </div>
              <div className="card">
                <div className="total">{money(shopping.spent)}</div>
                <div className="meta">Spent so far</div>
              </div>
            </section>
            <Group title="To order" items={shopping.to_order} />
            <Group title="On order" items={shopping.on_order} />
            <Group title="Arrived" items={shopping.arrived} />
          </>
        )}
      </Loading>
    </main>
  );
}
