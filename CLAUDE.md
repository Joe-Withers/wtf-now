# CLAUDE.md

## Project

wtf-now: an AI-centred planner for long-running physical builds (first user: a van conversion). A mobile-first web app whose tasks, dependencies, progress and docs are stored as an Open Knowledge Format (OKF) v0.2 bundle of markdown files.

## Where things are

- `README.md` — the pitch.
- `docs/SPEC.md` — the current design. **Read this first.**
- `docs/tickets/` — the work, in order. Each ticket lists what it depends on.
- `docs/conceptualisation/SPEC.md` — the original conversation, kept for history. Superseded.

## Current phase

Tickets 001 to 023 are built and merged, and so are 028 to 050. The app runs end to end: tasks, dependencies, progress, the docs, chat with the AI, photos, voice, the drawings and the project map. The screens read the plan; the chat records the work.

The last few tickets were a redesign of the interface: the navigation is a rail down the left, the chat comes out of the side, the project is a map, What now is a run of jobs, the drawings and notes are one thing called the docs, the layout fills the screen instead of floating in it, the rail is a compact strip of icons at every screen size, and the map is a tree you can read that shows the state of the work, with a job's dependencies drawn when you pick it.

The rest of the work needs something from the owner, and is written up in `docs/tickets/024-*.md` onwards:

- a VPS to deploy to, and a private remote for the bundle
- the owner's own brain dump, to replace the made-up van in the seed script
- a transcription provider, so voice notes work
- an Anthropic API key, to swap away from MiniMax

We're building the full product, ticket by ticket, not an MVP.

## Principles to hold to

- Files are the source of truth. There is no database.
- The AI writes only through validated tools, never raw file edits.
- The AI tools and the REST API share one write path.
- The screens read the project; the chat records the work. No button changes a task's state, progress or current state — the owner says what happened and the AI updates the plan.
- Graph integrity (cycles, blocking, roll-ups, suggestions) is code, not LLM judgement.
- Progress and effort are stored AI estimates that change only when something happens, with a reason. Parent values are always calculated.
- Task state lives in `state`. Never use OKF's reserved `status` for it.
- Keep the LLM provider swappable: nothing provider-specific outside the LLM module.
- Don't make anything van-specific.

## LLM credentials

Development uses a MiniMax key through its Anthropic-compatible endpoint. Anthropic's API key is the supported swap.

Don't wire Claude subscription credentials (`claude setup-token`, OAuth tokens) into this app. Anthropic's docs direct developers to API keys, and enforcement can happen without notice.

Keys live in `.env`, which must never be committed.
