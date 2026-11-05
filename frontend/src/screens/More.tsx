import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getJson, type NoteSummary, type Problem } from "../api";
import { ChatLink, ScreenHead } from "../components/ui";

const LINKS = [
  { to: "/shopping", label: "Shopping" },
  { to: "/floor-plan", label: "Floor plan" },
  { to: "/graph", label: "Dependency graph" },
  { to: "/wiki", label: "Wiki" },
  { to: "/log", label: "Log" },
];

export function More() {
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => getJson<NoteSummary[]>("/notes") });
  const problems = useQuery({ queryKey: ["problems"], queryFn: () => getJson<Problem[]>("/problems") });
  const toVerify = notes.data?.filter((note) => note.needs_verifying).length ?? 0;

  return (
    <main className="screen">
      <ScreenHead title="More" action={<ChatLink />} />
      <nav className="menu" aria-label="More">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
            {link.to === "/wiki" && toVerify > 0 && <span className="flag">{toVerify} to verify</span>}
          </Link>
        ))}
      </nav>
      {problems.data && problems.data.length > 0 && (
        <section className="section">
          <h2>Problems in the project files</h2>
          {problems.data.map((problem) => (
            <div key={`${problem.path}${problem.message}`} className="meta warn">
              {problem.path}: {problem.message}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
