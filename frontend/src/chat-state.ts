import { createContext, useContext } from "react";

/** The chat drawer: one conversation, pulled out over whatever you were reading. */
export type ChatDrawer = {
  /** Is the drawer open? */
  open: boolean;
  /** The task the chat is about, if any. */
  focus: string | null;
  /** The conversation on show, if any. */
  session: string | null;
  /** Opens the drawer, optionally about a task. */
  openChat: (focus?: string) => void;
  closeChat: () => void;
  /** Shows a conversation, or a new one when given nothing. */
  pickSession: (session: string | null) => void;
  /** Told by the screen you're on, so the chat knows what you're looking at. */
  setFocus: (focus: string | null) => void;
};

export const ChatContext = createContext<ChatDrawer>({
  open: false,
  focus: null,
  session: null,
  openChat: () => {},
  closeChat: () => {},
  pickSession: () => {},
  setFocus: () => {},
});

export const useChat = () => useContext(ChatContext);
