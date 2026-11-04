# ![wtf-now](artifacts/01%20Scribble%20to%20arrow@2x.png)

For when you open the van doors after three months and think "wtf now?"

An LLM-centred project planner for long-running physical builds: nested tasks, dependency tracking, progress state and a self-maintaining wiki that remembers where you got to.

## The problem

Big DIY projects (van conversions, renovations, restorations) stall. You put it down for a few weeks and when you come back you've lost track of:

- where you got to on each bit
- what the next thing to do is
- what's blocked, and on what (parts to buy, research to do, decisions to make)

So it's easier not to start, and the project sits.

## The idea

You talk to an AI about your project. From that conversation it builds and maintains:

- **A task tree**: tasks and sub-tasks that nest as deep as needed.
- **A dependency graph**: what has to happen before what. The AI makes sensible assumptions to start with, and you correct them as you go ("if I fit this cabinet now I can't insulate behind it").
- **Progress state**: not just done/not done, but where each task actually is ("electronics mounted on ply, not yet connected to battery or solar, not in the van"). Progress rolls up by effort, so wiring a circuit board counts for more than hammering in a nail.
- **A project wiki**: research, decisions, measurements and part numbers, organised around the tasks. AI sessions are throwaway; the wiki *is* the memory, and each new session uses it as context.

The headline feature is the answer to "what can I do right now?" — tasks that are unblocked, split into what you can do with what you have, what needs ordering first, and what needs deciding first.

## Development

Needs [uv](https://docs.astral.sh/uv/) and Node 18 or later. Copy `.env.example` to `.env` and fill it in.

| | Backend | Frontend |
|---|---|---|
| Install | `cd backend && uv sync` | `cd frontend && npm install` |
| Run | `cd backend && uv run uvicorn wtf_now.main:app --reload --port 8100` | `cd frontend && npm run dev` |
| Test | `cd backend && uv run pytest` | `cd frontend && npm test` |

To try it with a made-up van conversion, run `cd backend && uv run python scripts/seed_example.py`. It writes to `BUNDLE_PATH` and won't touch a project that already has tasks.

The frontend runs on http://localhost:5173 and proxies `/api` to the backend on port 8100.

## Status

In design. See [`docs/SPEC.md`](docs/SPEC.md) and [`docs/tickets/`](docs/tickets/).
