import { Link } from "react-router-dom";

import type { MapTask, ProjectMap } from "../api";
import { useChat } from "../chat-state";

const KIND_LABELS: Record<MapTask["kind"], string> = {
  build: "Build",
  purchase: "Buy",
  research: "Research",
  decision: "Decide",
};

/** A step of a job: done, the one to do next, or still to do. */
function StepMark({ state }: { state: "done" | "current" | "todo" }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 16 16" className="mark done" role="img" aria-label="Done">
        <circle cx="8" cy="8" r="8" fill="var(--done)" />
        <path d="M4.5 8.2l2.2 2.2 4.6-4.8" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg viewBox="0 0 16 16" className="mark current" role="img" aria-label="Next">
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--now)" strokeWidth="2" />
        <circle cx="8" cy="8" r="2.5" fill="var(--now)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="mark todo" role="img" aria-label="To do">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--line)" strokeWidth="1.6" />
    </svg>
  );
}

function Chips({ tasks, empty, onSelect }: { tasks: MapTask[]; empty: string; onSelect: (slug: string) => void }) {
  if (tasks.length === 0) return <p className="meta">{empty}</p>;
  return (
    <div className="chips">
      {tasks.map((task) => (
        <button key={task.slug} className="chip small" onClick={() => onSelect(task.slug)}>
          {task.title}
        </button>
      ))}
    </div>
  );
}

/**
 * The task you've picked: where it is, the steps of the job it belongs to, what
 * it needs and what it unblocks.
 */
export function TaskPanel({
  task,
  map,
  onSelect,
  onClose,
}: {
  task: MapTask;
  map: ProjectMap;
  onSelect: (slug: string) => void;
  onClose?: () => void;
}) {
  const { openChat } = useChat();
  const category = map.categories.find((one) => one.slug === task.category);
  const job = task.children.length > 0 ? task : map.tasks.find((one) => one.slug === task.parent);
  const steps = (job?.children ?? [])
    .map((slug) => map.tasks.find((one) => one.slug === slug))
    .filter((one): one is MapTask => Boolean(one));
  const firstTodo = steps.find((step) => step.state !== "done");
  const needs = task.needs
    .map((slug) => map.tasks.find((one) => one.slug === slug))
    .filter((one): one is MapTask => Boolean(one));
  const blocks = task.blocks
    .map((slug) => map.tasks.find((one) => one.slug === slug))
    .filter((one): one is MapTask => Boolean(one));

  const status =
    task.state === "done"
      ? "Done"
      : task.state === "doing"
        ? `In progress · ${Math.round(task.progress)}%`
        : needs.length > 0
          ? `Waiting on ${needs.length} ${needs.length === 1 ? "task" : "tasks"}`
          : "Ready now";

  return (
    <section className="task-panel" aria-label="Selected task">
      <div className="panel-head">
        <div className="panel-heading">
          <h2 className="panel-title">{task.title}</h2>
          <div className="panel-meta">
            {category && (
              <span className="category-name">
                <span className={`dot cat-${category.colour}`} aria-hidden="true" />
                {category.title}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span>{KIND_LABELS[task.kind]}</span>
            <span aria-hidden="true">·</span>
            <span>{status}</span>
          </div>
        </div>
        <div className="button-row">
          <Link className="button" to={`/tasks/${task.slug}`}>
            Open task
          </Link>
          <button className="button primary" onClick={() => openChat(task.slug)}>
            Chat about this
          </button>
          {onClose && (
            <button className="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <div className="panel-steps">
          <h2>Steps</h2>
          {steps.length === 0 ? (
            <p className="meta">{task.note || "Nothing recorded yet."}</p>
          ) : (
            <ol className="steps">
              {steps.map((step) => (
                <li key={step.slug} className={`step${step.slug === task.slug ? " here" : ""}`}>
                  <StepMark state={step.state === "done" ? "done" : step.slug === firstTodo?.slug ? "current" : "todo"} />
                  <span className="step-name">{step.title}</span>
                  <span className="meta">{step.state === "done" ? "Done" : `${Math.round(step.progress)}%`}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel-facts">
          <div>
            <h2>Needs</h2>
            <Chips tasks={needs} empty="Nothing, it's ready" onSelect={onSelect} />
          </div>
          <div>
            <h2>Unblocks</h2>
            <Chips tasks={blocks} empty="Nothing yet" onSelect={onSelect} />
          </div>
          <div>
            <h2>Where it is</h2>
            <p className="panel-note">{task.note || "Nothing recorded yet."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
