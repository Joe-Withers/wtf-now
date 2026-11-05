import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getJson, type TaskDetail, type TaskRef } from "../api";
import { hours, Loading, Pill, ProgressBar } from "../components/ui";
import { WikiText } from "../components/WikiText";

function Refs({ title, items }: { title: string; items: TaskRef[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div>
        {items.map((item) => (
          <Link key={item.slug} className="ref" to={`/tasks/${item.slug}`}>
            <span>{item.title}</span>
            {item.state !== "todo" && <Pill state={item.state} />}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CurrentState({ task }: { task: TaskDetail }) {
  return (
    <section className="section">
      <h2>Current state</h2>
      <p className={task.current_state ? "quote" : "meta"}>{task.current_state || "Nothing recorded yet."}</p>
    </section>
  );
}

function Photos({ task }: { task: TaskDetail }) {
  if (task.photos.length === 0) return null;
  return (
    <section className="section">
      <h2>Photos</h2>
      <div className="photos">
        {task.photos.map((photo) => (
          <a key={photo.key} href={`/api/photos/${photo.key}`} target="_blank" rel="noreferrer">
            <img src={`/api/photos/${photo.key}`} alt={photo.caption || `Photo of ${task.title}`} loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}

export function TaskScreen() {
  const { slug = "" } = useParams();
  const query = useQuery({ queryKey: ["task", slug], queryFn: () => getJson<TaskDetail>(`/tasks/${slug}`) });

  return (
    <main className="screen" key={slug}>
      <Loading query={query}>
        {(task) => (
          <>
            <div className="content">
              <header className="task-head">
                {task.breadcrumbs.length > 0 && (
                  <div className="crumbs">
                    {task.breadcrumbs.map((crumb, index) => (
                      <span key={crumb.slug}>
                        {index > 0 && "›"}
                        <Link to={`/tasks/${crumb.slug}`}>{crumb.title}</Link>
                      </span>
                    ))}
                  </div>
                )}
                <h1>{task.title}</h1>
                <div className="task-meta">
                  <Pill state={task.state} kind={task.kind} />
                  <span className="meta">
                    {[
                      task.state !== "done" && `${hours(task.remaining_hours)} left`,
                      task.needs_helper && "needs two people",
                      task.cost !== null && `£${task.cost}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </header>

              {task.progress > 0 && <ProgressBar value={task.progress} label={`${task.title} progress`} />}
              {task.description && <p>{task.description}</p>}

              {task.blocked_by.length > 0 && <Refs title="Blocked by" items={task.blocked_by} />}

              {task.preflight.length > 0 && (
                <section className="card warning" role="alert">
                  <p className="card-title">This closes off {task.closes_zone_title}</p>
                  <p className="meta">Still unfinished in there:</p>
                  <ul>
                    {task.preflight.map((item) => (
                      <li key={item.slug}>
                        <Link to={`/tasks/${item.slug}`}>{item.title}</Link>
                      </li>
                    ))}
                  </ul>
                  <p className="meta">What else needs to go in there before it's closed up?</p>
                </section>
              )}

              <CurrentState task={task} />

              <Photos task={task} />

              <Refs title="Subtasks" items={task.children} />
              <Refs title="Easier after" items={task.easier_after} />
              <Refs title="Unlocks" items={task.dependents} />

              {task.notes && (
                <section className="section">
                  <h2>Notes</h2>
                  <WikiText text={task.notes} />
                </section>
              )}

              <Link className="meta" to={`/graph?task=${task.slug}`}>
                See what this depends on →
              </Link>
            </div>

            <div className="cta-bar">
              <Link className="button primary" to={`/chat?focus=${task.slug}`}>
                Tell it what you've done
              </Link>
            </div>
          </>
        )}
      </Loading>
    </main>
  );
}
