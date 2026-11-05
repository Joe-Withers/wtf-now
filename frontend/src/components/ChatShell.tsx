import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { ChatContext, useChat, type ChatDrawer } from "../chat-state";
import { Chat } from "../screens/Chat";

/** Holds the drawer's state, and hands it to anything that wants to talk to the AI. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<{ open: boolean; focus: string | null; session: string | null }>({
    open: false,
    focus: null,
    session: null,
  });

  const openChat = useCallback((focus?: string) => {
    setDrawer((current) => {
      const next = focus ?? current.focus;
      return { open: true, focus: next, session: next === current.focus ? current.session : null };
    });
  }, []);

  const closeChat = useCallback(() => setDrawer((current) => ({ ...current, open: false })), []);

  const pickSession = useCallback(
    (session: string | null) => setDrawer((current) => ({ ...current, session })),
    [],
  );

  const setFocus = useCallback((focus: string | null) => {
    setDrawer((current) => (current.focus === focus ? current : { ...current, focus, session: null }));
  }, []);

  const value = useMemo<ChatDrawer>(
    () => ({ ...drawer, openChat, closeChat, pickSession, setFocus }),
    [drawer, openChat, closeChat, pickSession, setFocus],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** The one button that opens the chat, wherever you are. */
export function ChatFab() {
  const { open, openChat } = useChat();
  const { pathname } = useLocation();

  if (open || pathname === "/chat") return null;

  return (
    <button className="chat-fab" onClick={() => openChat()} aria-label="Chat to the AI">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3.5A8 8 0 1 1 21 12z" />
      </svg>
    </button>
  );
}

/** The chat, pulled out of the right-hand side over the screen you were on. */
export function ChatDrawer() {
  const { open, closeChat, focus, session, pickSession } = useChat();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeChat]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={closeChat} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Chat with the AI">
        <Chat focus={focus} session={session} onSession={pickSession} onClose={closeChat} />
      </aside>
    </>
  );
}
