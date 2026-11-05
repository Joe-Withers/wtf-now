import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getJson, type Home as HomeData, type LogLine } from "../api";
import { Loading, ProgressBar, Wordmark } from "../components/ui";
import { WorkCard } from "../components/WorkCard";

function away(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "You were last here today.";
  if (days === 1) return "You were last here yesterday.";
  return `It's been ${days} days. Here's where you are.`;
}

function Lines({ lines }: { lines: LogLine[] }) {
  return (
    <div className="card-stack">
      {lines.map((line, index) => (
        <div className="meta" key={index}>
          <strong>{line.label}</strong> {line.text}
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const query = useQuery({ queryKey: ["home"], queryFn: () => getJson<HomeData>("/home") });

  return (
    <main className="screen">
      <Wordmark />
      <Link to="/chat" className="meta">
        Tell it what you've done →
      </Link>
      <Loading query={query}>
        {(home) => {
          if (home.last_activity === null) {
            return (
              <section className="section">
                <h1>Nothing here yet</h1>
                <p className="meta">Tell the AI about your project, and it'll build the plan with you.</p>
                <Link to="/chat" className="button primary" style={{ textAlign: "center", lineHeight: "22px" }}>
                  Start talking
                </Link>
              </section>
            );
          }
          const [next, ...others] = home.suggestions;
          const elsewhere = home.in_progress.filter(
            (item) => !home.suggestions.some((suggestion) => suggestion.slug === item.slug),
          );
          return (
            <>
              <section className="section">
                <h1>{away(home.days_away)}</h1>
                <ProgressBar value={home.overall_progress} label="Overall progress" />
                <div className="meta">{Math.round(home.overall_progress)}% of the whole project</div>
              </section>

              {next && (
                <section className="section">
                  <h2>Do this next</h2>
                  <WorkCard item={next} lead />
                  {others.length > 0 && (
                    <div className="card-stack">
                      {others.map((item) => (
                        <WorkCard key={item.slug} item={item} />
                      ))}
                    </div>
                  )}
                  <Link to="/what-now" className="meta">
                    See everything you could do →
                  </Link>
                </section>
              )}

              {elsewhere.length > 0 && (
                <section className="section">
                  <h2>Also in progress</h2>
                  <div className="card-stack">
                    {elsewhere.map((item) => (
                      <WorkCard key={item.slug} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {home.on_order.length > 0 && (
                <section className="section">
                  <h2>On order</h2>
                  <div className="card-stack">
                    {home.on_order.map((item) => (
                      <WorkCard key={item.slug} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {home.arrived.length > 0 && (
                <section className="section">
                  <h2>Arrived</h2>
                  <Lines lines={home.arrived} />
                </section>
              )}

              <section className="section">
                <h2>Last session</h2>
                <Lines lines={home.last_session} />
              </section>
            </>
          );
        }}
      </Loading>
    </main>
  );
}
