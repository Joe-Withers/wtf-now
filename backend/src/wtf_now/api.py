"""The REST API. Writes go through the store only."""

import json
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import views
from .chat import Chat
from .photos import InvalidPhoto, PhotoStore, media_type_of, store_photo
from .store import ChangeRejected, Op, Store, UndoConflict
from .transcribe import Transcriber, TranscriptionError
from .what_now import home, log_lines, what_now

Kind = Literal["build", "purchase", "research", "decision"]
State = Literal["todo", "doing", "done"]
Strength = Literal["hard", "soft"]


class DependencyIn(BaseModel):
    task: str
    strength: Strength = "hard"


class NewTask(BaseModel):
    title: str = Field(min_length=1)
    parent: str | None = None
    kind: Kind = "build"
    description: str = ""
    effort_hours: float | None = Field(default=None, ge=0)
    zone: str | None = None
    closes_zone: str | None = None
    needs_helper: bool = False
    cost: float | None = Field(default=None, ge=0)
    depends_on: list[DependencyIn] = []


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    kind: Kind | None = None
    zone: str | None = None
    closes_zone: str | None = None
    effort_hours: float | None = Field(default=None, ge=0)
    needs_helper: bool | None = None
    cost: float | None = Field(default=None, ge=0)
    reason: str = ""


class SetState(BaseModel):
    state: State
    reason: str = ""


class SetProgress(BaseModel):
    progress: float = Field(ge=0, le=100)
    reason: str


class CurrentState(BaseModel):
    text: str


class Move(BaseModel):
    parent: str | None = None


class NewNote(BaseModel):
    title: str = Field(min_length=1)
    body: str
    slug: str | None = None
    type: str = "Note"
    description: str = ""
    stale_after: str | None = None


class NewSession(BaseModel):
    focus: str | None = None


class NewMessage(BaseModel):
    text: str = Field(default="")
    photos: list[str] = []


def _sse(events: Iterator[dict[str, Any]]) -> Iterator[str]:
    for event in events:
        yield f"data: {json.dumps(event, default=str)}\n\n"


def create_app(
    store: Store,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    chat: Chat | None = None,
    static_root: Path | None = None,
    photos: PhotoStore | None = None,
    transcriber: Transcriber | None = None,
) -> FastAPI:
    app = FastAPI(title="wtf-now")
    app.state.store = store

    @app.exception_handler(ChangeRejected)
    def rejected(_: Request, error: ChangeRejected) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(UndoConflict)
    def conflict(_: Request, error: UndoConflict) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=409)

    @app.exception_handler(InvalidPhoto)
    def invalid_photo(_: Request, error: InvalidPhoto) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(TranscriptionError)
    def transcription_failed(_: Request, error: TranscriptionError) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=502)

    @app.exception_handler(views.NotFound)
    def not_found(_: Request, error: views.NotFound) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=404)

    def change(*ops: Op) -> dict[str, Any]:
        result, outputs = store.apply(list(ops))
        return {"change": result, "results": outputs}

    def require_task(slug: str) -> None:
        if slug not in store.project.tasks:
            raise HTTPException(404, f"No task called {slug!r}")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/home")
    def get_home() -> Any:
        return home(store.project, store.log(), clock().date())

    @app.get("/api/what-now")
    def get_what_now(hours: float | None = Query(default=None, gt=0), helper: bool = True) -> Any:
        return what_now(store.project, hours, helper)

    @app.get("/api/tree")
    def get_tree() -> Any:
        return views.tree(store.project)

    @app.get("/api/graph")
    def get_graph() -> Any:
        return views.dependency_graph(store.project)

    @app.get("/api/shopping")
    def get_shopping() -> Any:
        return views.shopping(store.project)

    @app.get("/api/layouts")
    def get_layouts() -> Any:
        return views.layouts(store.project, store.root)

    @app.get("/api/problems")
    def get_problems() -> Any:
        return store.project.problems

    @app.get("/api/log")
    def get_log(limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0)) -> Any:
        return log_lines(store.log())[offset : offset + limit]

    @app.get("/api/search")
    def get_search(q: str) -> Any:
        return views.search(store.project, q)

    @app.post("/api/tasks", status_code=201)
    def create_task(task: NewTask) -> Any:
        return change(Op("create_task", task.model_dump()))

    @app.get("/api/tasks/{slug}")
    def get_task(slug: str) -> Any:
        return views.task_detail(store.project, slug)

    @app.patch("/api/tasks/{slug}")
    def update_task(slug: str, update: TaskUpdate) -> Any:
        require_task(slug)
        return change(Op("update_task", {"slug": slug, **update.model_dump(exclude_unset=True)}))

    @app.delete("/api/tasks/{slug}")
    def delete_task(slug: str) -> Any:
        require_task(slug)
        return change(Op("delete_task", {"slug": slug}))

    @app.post("/api/tasks/{slug}/state")
    def set_state(slug: str, body: SetState) -> Any:
        require_task(slug)
        return change(Op("set_state", {"slug": slug, **body.model_dump()}))

    @app.post("/api/tasks/{slug}/progress")
    def set_progress(slug: str, body: SetProgress) -> Any:
        require_task(slug)
        return change(Op("set_progress", {"slug": slug, **body.model_dump()}))

    @app.post("/api/tasks/{slug}/current-state")
    def set_current_state(slug: str, body: CurrentState) -> Any:
        require_task(slug)
        return change(Op("update_current_state", {"slug": slug, "text": body.text}))

    @app.post("/api/tasks/{slug}/move")
    def move_task(slug: str, body: Move) -> Any:
        require_task(slug)
        return change(Op("move_task", {"slug": slug, "parent": body.parent}))

    @app.post("/api/tasks/{slug}/dependencies")
    def add_dependency(slug: str, body: DependencyIn) -> Any:
        require_task(slug)
        return change(Op("add_dependency", {"task": slug, "depends_on": body.task, "strength": body.strength}))

    @app.delete("/api/tasks/{slug}/dependencies/{target}")
    def remove_dependency(slug: str, target: str) -> Any:
        require_task(slug)
        return change(Op("remove_dependency", {"task": slug, "depends_on": target}))

    @app.get("/api/notes")
    def get_notes() -> Any:
        return views.notes(store.project, clock())

    @app.post("/api/notes", status_code=201)
    def write_note(note: NewNote) -> Any:
        return change(Op("write_note", note.model_dump()))

    @app.get("/api/notes/{slug}")
    def get_note(slug: str) -> Any:
        return views.note_detail(store.project, slug, clock())

    @app.post("/api/notes/{slug}/verify")
    def verify_note(slug: str) -> Any:
        return change(Op("verify_note", {"slug": slug}))

    @app.post("/api/changes/{change_id}/undo")
    def undo(change_id: str) -> Any:
        return {"change": store.undo(change_id)}

    def require_photos() -> PhotoStore:
        if photos is None:
            raise HTTPException(503, "Photo storage isn't configured.")
        return photos

    @app.post("/api/photos", status_code=201)
    def upload_photo(file: UploadFile = File(...)) -> dict[str, str]:
        key = store_photo(require_photos(), file.content_type or "", file.file.read())
        return {"key": key}

    @app.get("/api/photos/{key}")
    def get_photo(key: str) -> Response:
        data = require_photos().get(key)
        return Response(data, media_type=media_type_of(key), headers={"Cache-Control": "private, max-age=31536000"})

    @app.post("/api/tasks/{slug}/photos", status_code=201)
    def add_task_photo(slug: str, file: UploadFile = File(...), caption: str = Form("")) -> Any:
        require_task(slug)
        key = store_photo(require_photos(), file.content_type or "", file.file.read())
        return change(Op("attach_photo", {"slug": slug, "key": key, "caption": caption}))

    @app.get("/api/features")
    def features() -> dict[str, bool]:
        return {"chat": chat is not None, "voice": transcriber is not None}

    @app.post("/api/transcribe")
    def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
        if transcriber is None:
            raise HTTPException(503, "Voice isn't configured.")
        return {"text": transcriber.transcribe(file.content_type or "", file.file.read())}

    def require_chat() -> Chat:
        if chat is None:
            raise HTTPException(503, "The AI isn't configured. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.")
        return chat

    @app.get("/api/sessions")
    def get_sessions() -> Any:
        return [
            {"id": session.id, "title": session.title, "updated_at": session.updated_at, "focus": session.focus}
            for session in require_chat().sessions.list()
        ]

    @app.post("/api/sessions", status_code=201)
    def create_session(body: NewSession) -> Any:
        return require_chat().sessions.create(body.focus)

    @app.get("/api/sessions/{session_id}")
    def get_session(session_id: str) -> Any:
        active = require_chat()
        session = active.sessions.get(session_id)
        display = [
            {**item, "status": active.proposals.get(item["id"]).status} if item["type"] == "proposal" else item
            for item in session.display
        ]
        return {"id": session.id, "title": session.title, "focus": session.focus, "display": display}

    @app.post("/api/sessions/{session_id}/messages")
    def send_message(session_id: str, body: NewMessage) -> StreamingResponse:
        active = require_chat()
        active.sessions.get(session_id)
        if not body.text.strip() and not body.photos:
            raise HTTPException(422, "Say something or add a photo")
        images = [(key, require_photos().get(key)) for key in body.photos]
        return StreamingResponse(_sse(active.send(session_id, body.text, images)), media_type="text/event-stream")

    @app.get("/api/proposals")
    def get_proposals() -> Any:
        return require_chat().proposals.pending()

    @app.post("/api/proposals/{proposal_id}/approve")
    def approve(proposal_id: str) -> Any:
        return require_chat().decide(proposal_id, approved=True)

    @app.post("/api/proposals/{proposal_id}/reject")
    def reject(proposal_id: str) -> Any:
        return require_chat().decide(proposal_id, approved=False)

    if static_root is not None and (static_root / "index.html").exists():
        root = static_root.resolve()

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str) -> FileResponse:
            """Serves the built app. Unknown paths get index.html, so that links to screens work."""
            if path == "api" or path.startswith("api/"):
                raise HTTPException(404)
            target = (root / path).resolve()
            if target.is_file() and target.is_relative_to(root):
                return FileResponse(target)
            return FileResponse(root / "index.html")

    return app
