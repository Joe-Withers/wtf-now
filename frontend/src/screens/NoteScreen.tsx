import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { getJson, type NoteDetail } from "../api";
import { Loading, ScreenHead, useChange } from "../components/ui";
import { Markdown } from "../components/Markdown";

function author(by: string): string {
  if (!by) return "";
  return by.startsWith("human:") ? "Written by you" : "Written by the AI";
}

export function NoteScreen() {
  const { slug = "" } = useParams();
  const query = useQuery({ queryKey: ["note", slug], queryFn: () => getJson<NoteDetail>(`/notes/${slug}`) });
  const change = useChange();
  const navigate = useNavigate();

  return (
    <main className="screen">
      <Loading query={query}>
        {(note) => (
          <>
            <ScreenHead title={note.title} />
            <div className="content">
              <section className="section">
                <div className="meta">
                  {[note.type, author(note.generated_by), note.verified && "Verified by you"].filter(Boolean).join(" · ")}
                </div>
                {note.stale && <div className="flag">This may be out of date.</div>}
              </section>
              {note.needs_verifying && (
                <section className="card hero">
                  <p className="card-title">Is this right?</p>
                  <p className="meta" style={{ marginBottom: 10 }}>Check it before cutting anything.</p>
                  <button
                    className="button primary"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ path: `/notes/${note.slug}/verify`, message: "Verified" })}
                  >
                    Yes, it's right
                  </button>{" "}
                  <button
                    className="button"
                    disabled={change.isPending}
                    onClick={() =>
                      change.mutate(
                        { path: `/notes/${note.slug}`, method: "DELETE", message: "Removed" },
                        { onSuccess: () => navigate("/docs") },
                      )
                    }
                  >
                    No, it's wrong
                  </button>
                  <p className="meta" style={{ marginTop: 10 }}>
                    Removes the note. Tell the chat the right figures and it will write them down again.
                  </p>
                </section>
              )}
              <Markdown text={note.body} />
            </div>
          </>
        )}
      </Loading>
    </main>
  );
}
