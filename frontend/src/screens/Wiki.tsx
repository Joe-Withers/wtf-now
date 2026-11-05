import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { getJson, type NoteSummary, type SearchHit } from "../api";
import { Loading, ScreenHead } from "../components/ui";

export function Wiki() {
  const [search, setSearch] = useState("");
  const term = search.trim();
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => getJson<NoteSummary[]>("/notes") });
  const hits = useQuery({
    queryKey: ["search", term],
    queryFn: () => getJson<SearchHit[]>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length > 1,
  });
  const toVerify = notes.data?.filter((note) => note.needs_verifying).length ?? 0;

  return (
    <main className="screen">
      <ScreenHead title="Wiki" />
      <input className="field" type="search" aria-label="Search" placeholder="Search tasks and notes" value={search} onChange={(event) => setSearch(event.target.value)} />
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
        <Loading query={notes}>
          {(list) =>
            list.length === 0 ? (
              <p className="empty">No notes yet. The AI adds them as you talk.</p>
            ) : (
              <div className="card-stack">
                {list.map((note) => (
                  <Link key={note.slug} className="card" to={`/notes/${note.slug}`}>
                    <div className="card-title">{note.title}</div>
                    <div className="meta">{[note.type, note.description].filter(Boolean).join(" · ")}</div>
                    {note.needs_verifying && <div className="flag">Unverified</div>}
                    {note.stale && <div className="flag">May be out of date</div>}
                  </Link>
                ))}
              </div>
            )
          }
        </Loading>
      )}
    </main>
  );
}
