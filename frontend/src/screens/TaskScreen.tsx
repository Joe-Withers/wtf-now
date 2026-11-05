import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { addTaskPhoto, getJson, postJson, type State, type TaskDetail, type TaskRef } from "../api";
import { hours, Loading, ProgressBar, useChange, useSnack } from "../components/ui";
import { WikiText } from "../components/WikiText";

function actions(task: TaskDetail): { state: State; label: string; primary?: boolean }[] {
  const purchase = task.kind === "purchase";
  switch (task.state) {
    case "todo":
      return [
        { state: "doing", label: purchase ? "Mark as ordered" : "Start", primary: true },
        { state: "done", label: purchase ? "It's arrived" : "Done" },
      ];
    case "doing":
      return [
        { state: "done", label: purchase ? "It's arrived" : "Done", primary: true },
        { state: "todo", label: purchase ? "Not ordered after all" : "Back to not started" },
      ];
    case "done":
      return [{ state: "todo", label: "Reopen" }];
  }
}

function Refs({ title, items }: { title: string; items: TaskRef[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div>
        {items.map((item) => (
          <Link key={item.slug} className="ref" to={`/tasks/${item.slug}`}>
            <span>{item.title}</span>
            <span className="meta">{item.state === "done" ? "Done" : item.state === "doing" ? "Underway" : "Not started"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CurrentState({ task }: { task: TaskDetail }) {
  const change = useChange();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.current_state);

  if (!editing) {
    return (
      <section className="section">
        <h2>Current state</h2>
        <p className={task.current_state ? "" : "meta"}>{task.current_state || "Nothing recorded yet."}</p>
        <div>
          <button
            className="button"
            onClick={() => {
              setText(task.current_state);
              setEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="section">
      <h2>Current state</h2>
      <textarea className="field" aria-label="Current state" rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="button-row">
        <button
          className="button primary"
          disabled={!text.trim() || change.isPending}
          onClick={() => {
            change.mutate({ path: `/tasks/${task.slug}/current-state`, body: { text }, message: "Saved" });
            setEditing(false);
          }}
        >
          Save
        </button>
        <button className="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function Progress({ task }: { task: TaskDetail }) {
  const change = useChange();
  const [value, setValue] = useState(Math.round(task.progress));
  const [reason, setReason] = useState("");
  const changed = value !== Math.round(task.progress);

  return (
    <section className="section">
      <h2>How far through</h2>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label="Progress"
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />
      <div className="meta">{value}%{task.progress_reason && !changed ? `. ${task.progress_reason}` : ""}</div>
      {changed && (
        <>
          <input className="field" aria-label="What changed?" placeholder="What changed?" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div>
            <button
              className="button primary"
              disabled={!reason.trim() || change.isPending}
              onClick={() => {
                change.mutate({ path: `/tasks/${task.slug}/progress`, body: { progress: value, reason }, message: `Set to ${value}%` });
                setReason("");
              }}
            >
              Save progress
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Photos({ task }: { task: TaskDetail }) {
  const client = useQueryClient();
  const snack = useSnack();
  const undo = useMutation({
    mutationFn: (id: string) => postJson(`/changes/${id}/undo`),
    onSuccess: () => client.invalidateQueries(),
  });
  const add = useMutation({
    mutationFn: (file: File) => addTaskPhoto(task.slug, file),
    onSuccess: (result) => {
      client.invalidateQueries();
      snack({ message: "Photo added", undo: () => undo.mutate(result.change.id) });
    },
    onError: (error) => snack({ message: error.message }),
  });

  return (
    <section className="section">
      <h2>Photos</h2>
      {task.photos.length > 0 && (
        <div className="photos">
          {task.photos.map((photo) => (
            <a key={photo.key} href={`/api/photos/${photo.key}`} target="_blank" rel="noreferrer">
              <img src={`/api/photos/${photo.key}`} alt={photo.caption || `Photo of ${task.title}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div>
        <label className="button file-button">
          {add.isPending ? "Uploading…" : "Add a photo"}
          <input
            type="file"
            accept="image/*"
            disabled={add.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) add.mutate(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </section>
  );
}

export function TaskScreen() {
  const { slug = "" } = useParams();
  const query = useQuery({ queryKey: ["task", slug], queryFn: () => getJson<TaskDetail>(`/tasks/${slug}`) });
  const change = useChange();

  return (
    <main className="screen" key={slug}>
      <Loading query={query}>
        {(task) => (
          <>
            <section className="section">
              {task.breadcrumbs.length > 0 && (
                <div className="crumbs">
                  {task.breadcrumbs.map((crumb) => (
                    <Link key={crumb.slug} to={`/tasks/${crumb.slug}`}>
                      {crumb.title} ›
                    </Link>
                  ))}
                </div>
              )}
              <h1>{task.title}</h1>
              <div className="meta">
                {[
                  task.state !== "done" && `${hours(task.remaining_hours)} left`,
                  task.needs_helper && "needs two people",
                  task.cost !== null && `£${task.cost}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <ProgressBar value={task.progress} label={`${task.title} progress`} />
              {task.description && <p>{task.description}</p>}
            </section>

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

            {task.is_leaf && (
              <div className="button-row">
                {actions(task).map((action) => (
                  <button
                    key={action.state}
                    className={`button${action.primary ? " primary" : ""}`}
                    disabled={change.isPending}
                    onClick={() =>
                      change.mutate({
                        path: `/tasks/${task.slug}/state`,
                        body: { state: action.state },
                        message: `${task.title}: ${action.label}`,
                      })
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            <CurrentState key={task.current_state} task={task} />
            {task.is_leaf && task.state === "doing" && <Progress key={task.progress} task={task} />}

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

            <Link className="button" to={`/chat?focus=${task.slug}`} style={{ textAlign: "center", lineHeight: "22px" }}>
              Talk about this task
            </Link>
          </>
        )}
      </Loading>
    </main>
  );
}
