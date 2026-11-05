"""Chat sessions. Transcripts live outside the bundle, because the wiki is the memory."""

import base64
import json
import uuid
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .agent import Model, Tools, run_conversation
from .bundle import write_text_atomic
from .context import build_system
from .photos import media_type_of
from .proposals import ProposalStore
from .store import Store
from .views import NotFound

RETENTION = timedelta(days=30)
MAX_HISTORY = 60
TITLE_LENGTH = 60


@dataclass
class Session:
    id: str
    created_at: str
    updated_at: str
    title: str = ""
    focus: str | None = None
    messages: list[dict[str, Any]] = field(default_factory=list)  # as sent to the model
    display: list[dict[str, Any]] = field(default_factory=list)  # as shown to the owner
    notes: list[str] = field(default_factory=list)  # to pass on with the next message


class SessionStore:
    def __init__(self, root: Path, clock: Callable[[], datetime]) -> None:
        self.root = root
        self.clock = clock

    def _path(self, session_id: str) -> Path:
        return self.root / f"{Path(session_id).name}.json"

    def create(self, focus: str | None = None) -> Session:
        now = self.clock().isoformat()
        session = Session(uuid.uuid4().hex, now, now, focus=focus)
        self.save(session)
        return session

    def get(self, session_id: str) -> Session:
        path = self._path(session_id)
        if not path.exists():
            raise NotFound(f"No session {session_id!r}")
        return Session(**json.loads(path.read_text(encoding="utf-8")))

    def save(self, session: Session) -> None:
        session.updated_at = self.clock().isoformat()
        write_text_atomic(self._path(session.id), json.dumps(asdict(session), default=str))

    def list(self) -> list[Session]:
        """Recent sessions, newest first. Expired ones are removed."""
        cutoff = self.clock() - RETENTION
        sessions = []
        for path in self.root.glob("*.json"):
            session = self.get(path.stem)
            if datetime.fromisoformat(session.updated_at) < cutoff:
                path.unlink()
            else:
                sessions.append(session)
        return sorted(sessions, key=lambda session: session.updated_at, reverse=True)


def trim_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keeps the latest messages, starting at something the owner said, so tool calls stay paired."""
    if len(messages) <= MAX_HISTORY:
        return messages
    for index in range(len(messages) - MAX_HISTORY, len(messages)):
        message = messages[index]
        if message["role"] == "user" and not _is_tool_result(message):
            return messages[index:]
    return messages[-1:]


def _is_tool_result(message: dict[str, Any]) -> bool:
    content = message["content"]
    return isinstance(content, list) and any(part.get("type") == "tool_result" for part in content)


def _image_block(key: str, data: bytes) -> dict[str, Any]:
    source = {"type": "base64", "media_type": media_type_of(key), "data": base64.b64encode(data).decode()}
    return {"type": "image", "source": source}


def _without_images(message: dict[str, Any]) -> dict[str, Any]:
    """Images are only sent on their own turn, so transcripts stay small."""
    content = message["content"]
    if message["role"] != "user" or not isinstance(content, list):
        return message
    return {**message, "content": [part for part in content if part.get("type") != "image"]}


class Chat:
    def __init__(
        self,
        llm: Model,
        store: Store,
        sessions: SessionStore,
        proposals: ProposalStore,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.llm = llm
        self.store = store
        self.sessions = sessions
        self.proposals = proposals
        self.clock = clock

    @property
    def actor(self) -> str:
        return f"wtf-now/{self.llm.model}"

    def send(self, session_id: str, text: str, photos: list[tuple[str, bytes]] | None = None) -> Iterator[dict[str, Any]]:
        """Runs one owner message. `photos` are (key, data) pairs the AI can see this turn."""
        photos = photos or []
        session = self.sessions.get(session_id)
        session.title = session.title or text[:TITLE_LENGTH] or "Photo"
        session.display.append({"type": "user", "text": text, "photos": [key for key, _ in photos]})

        keys = [f"[Photo attached, key {key}]" for key, _ in photos]
        said = "\n".join([*(f"[{note}]" for note in session.notes), *keys, text])
        session.notes = []
        content: Any = said
        if photos:
            content = [*(_image_block(key, data) for key, data in photos), {"type": "text", "text": said}]
        session.messages.append({"role": "user", "content": content})

        tools = Tools(self.store, self.proposals, session.id, self.actor, self.clock)
        system = build_system(self.store, self.clock(), self.proposals.pending(), session.focus)
        history = trim_history(session.messages)
        reply: list[str] = []
        try:
            for event in run_conversation(self.llm, tools, history, system):
                if event["type"] == "text":
                    reply.append(event["text"])
                elif event["type"] != "tool":
                    if reply:
                        session.display.append({"type": "assistant", "text": "".join(reply)})
                        reply = []
                    if event["type"] in ("change", "proposal", "error"):
                        session.display.append(event)
                yield event
        finally:
            if reply:
                session.display.append({"type": "assistant", "text": "".join(reply)})
            session.messages = [_without_images(message) for message in history]
            self.sessions.save(session)

    def decide(self, proposal_id: str, approved: bool) -> Any:
        proposal = self.proposals.approve(proposal_id) if approved else self.proposals.reject(proposal_id)
        session = self.sessions.get(proposal.session_id)
        session.notes.append(f"The owner {'approved' if approved else 'rejected'} the proposal: {proposal.summary}")
        self.sessions.save(session)
        return proposal
