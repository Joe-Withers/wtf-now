# 001: Repo scaffold

**Depends on:** nothing

Set up the monorepo: `backend/` (FastAPI, uv, pytest) and `frontend/` (React, Vite, TypeScript).

- Add `.gitignore` covering `.env`, build output and local data.
- Add `.env.example` with `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `BUNDLE_PATH`.
- Add a health endpoint and one test on each side.

**Done when:** one documented command runs each app, the tests pass, and `.env` is ignored.
