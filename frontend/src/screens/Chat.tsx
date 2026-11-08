import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useSearchParams } from "react-router-dom";

import {
  getJson,
  postJson,
  streamMessage,
  transcribe,
  uploadPhoto,
  type ChatEvent,
  type ChatItem,
  type Features,
  type Proposal,
  type Session,
  type SessionSummary,
  type TaskDetail,
} from "../api";
import { useSnack } from "../components/ui";

const ACTIVITY: Record<string, string> = {
  set_progress: "Updating progress…",
  set_state: "Updating the task…",
  update_current_state: "Noting where things are…",
  write_note: "Writing to the docs…",
  propose_changes: "Preparing some changes…",
};

const PROMPTS = ["I've ordered the …", "The … has turned up", "I've finished …", "What should I do next?"];

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const client = useQueryClient();
  const [status, setStatus] = useState(proposal.status);
  const [error, setError] = useState(proposal.error ?? "");

  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") => postJson<Proposal>(`/proposals/${proposal.id}/${action}`),
    onSuccess: (result) => {
      setStatus(result.status);
      client.invalidateQueries();
    },
    onError: (failure) => {
      setStatus("failed");
      setError(failure.message);
    },
  });

  return (
    <div className={`card proposal${status === "pending" ? " next" : ""}`}>
      <div className="card-title">{proposal.summary}</div>
      <ul>
        {proposal.descriptions.map((description) => (
          <li key={description}>{description}</li>
        ))}
      </ul>
      {status === "pending" ? (
        <div className="button-row">
          <button className="button primary" disabled={decide.isPending} onClick={() => decide.mutate("approve")}>
            Approve
          </button>
          <button className="button" disabled={decide.isPending} onClick={() => decide.mutate("reject")}>
            Reject
          </button>
        </div>
      ) : (
        <div className="meta">
          {{ applied: "Approved", rejected: "Rejected", failed: `Couldn't apply: ${error}` }[status]}
        </div>
      )}
    </div>
  );
}

function ChangeLine({ id, summary }: { id: string; summary: string }) {
  const client = useQueryClient();
  const snack = useSnack();
  const [undone, setUndone] = useState(false);

  const undo = useMutation({
    mutationFn: () => postJson(`/changes/${id}/undo`),
    onSuccess: () => {
      setUndone(true);
      client.invalidateQueries();
    },
    onError: (error) => snack({ message: error.message }),
  });

  return (
    <div className="change-line">
      <span>{undone ? `Undone: ${summary}` : summary}</span>
      {!undone && (
        <button disabled={undo.isPending} onClick={() => undo.mutate()}>
          Undo
        </button>
      )}
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  switch (item.type) {
    case "user":
      return (
        <div className="bubble user">
          {item.photos?.map((key) => <img key={key} className="chat-photo" src={`/api/photos/${key}`} alt="Attached" />)}
          {item.text}
        </div>
      );
    case "assistant":
      return (
        <div className="bubble">
          <Markdown>{item.text}</Markdown>
        </div>
      );
    case "change":
      return <ChangeLine id={item.id} summary={item.summary} />;
    case "proposal":
      return <ProposalCard proposal={item} />;
    case "error":
      return <p className="status error">{item.message}</p>;
  }
}

function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const snack = useSnack();
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const recorder = useRef<MediaRecorder | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState("working");
        try {
          onText(await transcribe(new Blob(chunks, { type: media.mimeType })));
        } catch (error) {
          snack({ message: (error as Error).message });
        } finally {
          setState("idle");
        }
      };
      recorder.current = media;
      media.start();
      setState("recording");
    } catch {
      snack({ message: "Couldn't use the microphone" });
    }
  };

  return (
    <button
      type="button"
      className={`button icon-button${state === "recording" ? " recording" : ""}`}
      aria-label={state === "recording" ? "Stop recording" : "Record a voice note"}
      disabled={state === "working"}
      onClick={() => (state === "recording" ? recorder.current?.stop() : void start())}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

function Recent({ onPrompt, onSession }: { onPrompt: (text: string) => void; onSession: (id: string) => void }) {
  const query = useQuery({ queryKey: ["sessions"], queryFn: () => getJson<SessionSummary[]>("/sessions") });
  const started = query.data?.filter((session) => session.title) ?? [];

  return (
    <>
      <p className="lede">What's happened?</p>
      <p className="meta">Tell me what you've done, what's gone wrong, or what you're stuck on. Everything worth keeping goes in the docs.</p>
      <div className="suggestions">
        {PROMPTS.map((prompt) => (
          <button key={prompt} className="suggestion" onClick={() => onPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      {query.isError && <p className="status error">{query.error.message}</p>}
      {started.length > 0 && (
        <section className="section">
          <h2>Recent chats</h2>
          <div className="card-stack">
            {started.map((session) => (
              <button key={session.id} className="card" onClick={() => onSession(session.id)}>
                {session.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function Chat({
  focus = null,
  session = null,
  onSession,
  onClose,
}: {
  focus?: string | null;
  session?: string | null;
  onSession?: (id: string | null) => void;
  onClose?: () => void;
}) {
  const client = useQueryClient();
  const features = useQuery({ queryKey: ["features"], queryFn: () => getJson<Features>("/features") });
  const focused = useQuery({
    queryKey: ["task", focus],
    queryFn: () => getJson<TaskDetail>(`/tasks/${focus}`),
    enabled: Boolean(focus),
  });

  // The drawer keeps the conversation; on its own, the page keeps it in the URL.
  const controlled = onSession !== undefined;
  const [own, setOwn] = useState<string | null>(null);
  const sessionId = controlled ? session : (session ?? own);
  const choose = (id: string | null) => {
    setOwn(id);
    onSession?.(id);
  };

  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const streaming = useRef(false);

  useEffect(() => {
    if (streaming.current) return;
    if (!sessionId) {
      setItems([]);
      return;
    }
    getJson<Session>(`/sessions/${sessionId}`)
      .then((session) => setItems(session.display))
      .catch(() => choose(null));
  }, [sessionId]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [items, activity]);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const apply = (event: ChatEvent) => {
    if (event.type === "text") {
      setActivity("");
      setItems((current) => {
        const last = current.at(-1);
        return last?.type === "assistant"
          ? [...current.slice(0, -1), { ...last, text: last.text + event.text }]
          : [...current, { type: "assistant", text: event.text }];
      });
    } else if (event.type === "tool") {
      setActivity(ACTIVITY[event.name] ?? "Checking the project…");
    } else if (event.type !== "done") {
      setActivity("");
      setItems((current) => [...current, event]);
    }
  };

  // A fresh conversation: the old one is kept, and shows under Recent chats.
  const startNew = () => {
    if (busy) return;
    choose(null);
    setItems([]);
    setDraft("");
    setPhoto(null);
    setActivity("");
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !photo) || busy) return;
    const attached = photo;
    setDraft("");
    setPhoto(null);
    setBusy(true);
    streaming.current = true;
    const shown: ChatItem = { type: "user", text };
    setItems((current) => [...current, shown]);
    try {
      const keys = attached ? [(await uploadPhoto(attached)).key] : [];
      if (keys.length > 0) {
        setItems((current) => current.map((item) => (item === shown ? { ...shown, photos: keys } : item)));
      }
      let id = sessionId;
      if (!id) {
        const session = await postJson<Session>("/sessions", { focus });
        id = session.id;
        choose(id);
      }
      await streamMessage(id, text, keys, apply);
    } catch (error) {
      setItems((current) => [...current, { type: "error", message: (error as Error).message }]);
    } finally {
      streaming.current = false;
      setBusy(false);
      setActivity("");
      client.invalidateQueries();
    }
  };

  return (
    <div className="chat">
      <div className="chat-head">
        {focused.data ? (
          <Link className="chat-focus" to={`/tasks/${focused.data.slug}`}>
            {focused.data.title}
          </Link>
        ) : (
          <span className="meta">Chat</span>
        )}
        <div className="chat-actions">
          {(sessionId || items.length > 0) && (
            <button className="button" onClick={startNew} disabled={busy}>
              New chat
            </button>
          )}
          {onClose && (
            <button className="button icon-button" onClick={onClose} aria-label="Close the chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="chat-log" ref={log}>
        {items.length === 0 && !busy && <Recent onPrompt={setDraft} onSession={choose} />}
        {items.map((item, index) => (
          <Item key={item.type === "proposal" || item.type === "change" ? item.id : index} item={item} />
        ))}
        {(activity || (busy && items.at(-1)?.type === "user")) && (
          <p className="activity" role="status">
            {activity || "Thinking…"}
          </p>
        )}
      </div>
      {photo && (
        <div className="pending-photo">
          <img src={preview} alt="To send" />
          <button type="button" onClick={() => setPhoto(null)}>
            Remove
          </button>
        </div>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="button file-button icon-button" aria-label="Add a photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          </svg>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              setPhoto(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        {features.data?.voice && (
          <VoiceButton onText={(text) => setDraft((current) => [current, text].filter(Boolean).join(" "))} />
        )}
        <textarea
          aria-label="Message"
          placeholder="Tell me what happened…"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.innerWidth >= 700) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button className="button primary" type="submit" disabled={busy || (!draft.trim() && !photo)}>
          Send
        </button>
      </form>
    </div>
  );
}

/** The chat on its own, for a link someone has bookmarked. */
export function ChatPage() {
  const [parameters, setParameters] = useSearchParams();
  const session = parameters.get("session");
  const focus = parameters.get("focus");

  return (
    <main className="screen chat-page">
      <header className="screen-head">
        <h1>Chat</h1>
        <Link className="head-action" to="/">
          Close
        </Link>
      </header>
      <Chat
        focus={focus}
        session={session}
        onSession={(id) => setParameters(id ? { session: id } : {})}
      />
    </main>
  );
}
