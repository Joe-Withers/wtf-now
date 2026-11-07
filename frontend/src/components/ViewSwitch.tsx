import { Link } from "react-router-dom";

/** The three ways of looking at the project: the map, the plan, and the run of work. */
export function ViewSwitch({ current }: { current: "graph" | "plan" | "what-now" }) {
  return (
    <nav className="segmented" aria-label="View">
      <Link className={current === "graph" ? "active" : ""} to="/">
        Graph
      </Link>
      <Link className={current === "plan" ? "active" : ""} to="/plan">
        Plan
      </Link>
      <Link className={current === "what-now" ? "active" : ""} to="/what-now">
        What now
      </Link>
    </nav>
  );
}
