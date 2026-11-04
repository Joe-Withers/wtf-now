from .api import create_app
from .config import bundle_path
from .store import Store

store = Store(bundle_path())
store.initialise()
app = create_app(store)
