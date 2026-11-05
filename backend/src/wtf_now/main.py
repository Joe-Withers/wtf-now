from datetime import UTC, datetime

from .api import create_app
from .chat import Chat, SessionStore
from .config import app_data_path, bundle_path, bundle_remote, photo_store, web_root
from .llm import LLM, LLMConfigError, load_config
from .proposals import ProposalStore
from .store import Store
from .transcribe import load_transcriber


def _chat(store: Store) -> Chat | None:
    try:
        llm = LLM(load_config())
    except LLMConfigError:
        return None
    root = app_data_path()
    now = lambda: datetime.now(UTC)  # noqa: E731
    return Chat(llm, store, SessionStore(root / "sessions", now), ProposalStore(root / "proposals", store), now)


store = Store(bundle_path(), remote=bundle_remote())
store.initialise()
app = create_app(store, chat=_chat(store), static_root=web_root(), photos=photo_store(), transcriber=load_transcriber())
