import { Link } from "react-router-dom";

import type { WorkItem } from "../api";
import { hours, ProgressBar } from "./ui";

export function details(item: WorkItem): string {
  const parts = [item.area, hours(item.remaining_hours)];
  if (item.needs_helper) parts.push("needs two people");
  if (item.unlocks_hours >= 1) parts.push(`unlocks ${hours(item.unlocks_hours)}`);
  return parts.filter(Boolean).join(" · ");
}

export function WorkCard({ item, lead = false }: { item: WorkItem; lead?: boolean }) {
  return (
    <Link to={`/tasks/${item.slug}`} className={`card${lead ? " next" : ""}`}>
      <div className={`card-title${lead ? " lead" : ""}`}>{item.title}</div>
      <div className="meta">{details(item)}</div>
      {item.state === "doing" && item.progress > 0 && (
        <div style={{ marginTop: 8 }}>
          <ProgressBar value={item.progress} label={`${item.title} progress`} />
        </div>
      )}
      {item.current_state && <p className="quote">{item.current_state}</p>}
      {item.easier_after.length > 0 && <div className="meta warn">Easier after {item.easier_after.join(", ")}</div>}
    </Link>
  );
}
