import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getJson, type Drawing, type NoteSummary, type SearchHit } from "../api";
import { DrawingPreview } from "../components/Drawing";
import { Loading, ScreenHead } from "../components/ui";

function DrawingCard({ drawing }: { drawing: Drawing }) {
  const zones = drawing.zones.length;
  return (
    <Link className="card drawing-card" to={`/drawings/${drawing.slug}`}>
      <div className="card-head">
        <div className="card-title">{drawing.title}</div>
        <div className="meta">
          {zones} {zones === 1 ? "zone" : "zones"}
        </div>
      </div>
      <DrawingPreview drawing={drawing} />
    </Link>
  );
}

function NoteCard({ note }: { note: NoteSummary }) {
  return (
    <Link className="card" to={`/notes/${note.slug}`}>
      <div className="card-title">{note.title}</div>
      <div className="meta">{[note.type, note.description].filter(Boolean).join(" · ")}</div>
      {note.needs_verifying && <div className="flag">Unverified</div>}
      {note.stale && <div className="flag">May be out of date</div>}
    </Link>
  );
}

export function Docs() {
  const [search, setSearch] = useState("");
  const term = search.trim();
  const drawings = useQuery({ queryKey: ["drawings"], queryFn: () => getJson<Drawing[]>("/drawings") });
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => getJson<NoteSummary[]>("/notes") });
  const hits = useQuery({
    queryKey: ["search", term],
    queryFn: () => getJson<SearchHit[]>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length > 1,
  });
  const toVerify = notes.data?.filter((note) => note.needs_verifying).length ?? 0;

  return (
    <main className="screen">
      <ScreenHead title="Docs" />
      <input
        className="field"
        type="search"
        aria-label="Search"
        placeholder="Search tasks and docs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {toVerify > 0 && <div className="flag">{toVerify} to verify</div>}
      {term.length > 1 ? (
        <Loading query={hits}>
          {(results) =>
            results.length === 0 ? (
              <p className="empty">Nothing found.</p>
            ) : (
              <div className="card-stack">
                {results.map((hit) => (
                  <Link key={`${hit.kind}${hit.slug}`} className="card" to={`/${hit.kind}s/${hit.slug}`}>
                    <div className="card-title">{hit.title}</div>
                    <div className="meta">{hit.snippet}</div>
                  </Link>
                ))}
              </div>
            )
          }
        </Loading>
      ) : (
        <div className="content">
          <section className="section" aria-label="Drawings">
            <h2>Drawings</h2>
            <Loading query={drawings}>
              {(list) =>
                list.length === 0 ? (
                  <p className="empty">No drawings yet. Describe one to the AI, and it can draw a simple plan.</p>
                ) : (
                  <div className="card-stack">
                    {list.map((drawing) => (
                      <DrawingCard key={drawing.slug} drawing={drawing} />
                    ))}
                  </div>
                )
              }
            </Loading>
          </section>
          <section className="section" aria-label="Notes">
            <h2>Notes</h2>
            <Loading query={notes}>
              {(list) =>
                list.length === 0 ? (
                  <p className="empty">No notes yet. The AI adds them as you talk.</p>
                ) : (
                  <div className="card-stack">
                    {list.map((note) => (
                      <NoteCard key={note.slug} note={note} />
                    ))}
                  </div>
                )
              }
            </Loading>
          </section>
        </div>
      )}
    </main>
  );
}
