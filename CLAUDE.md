# CLAUDE.md

## Project

wtf-now: an AI-centred planner for long-running physical builds (first user: a van conversion). A mobile-first web app whose tasks, dependencies, progress and wiki are stored as an Open Knowledge Format (OKF) v0.2 bundle of markdown files.

## Where things are

- `README.md` — the pitch.
- `docs/SPEC.md` — the current design. **Read this first.**
- `docs/tickets/` — the work, in order. Each ticket lists what it depends on.
- `docs/conceptualisation/SPEC.md` — the original conversation, kept for history. Superseded.

## Current phase

Tickets 001 to 023 are built and merged. The app runs end to end: tasks, dependencies, progress, the wiki, chat with the AI, photos, voice, the floor plan and the dependency graph.

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
- Graph integrity (cycles, blocking, roll-ups, suggestions) is code, not LLM judgement.
- Progress and effort are stored AI estimates that change only when something happens, with a reason. Parent values are always calculated.
- Task state lives in `state`. Never use OKF's reserved `status` for it.
- Keep the LLM provider swappable: nothing provider-specific outside the LLM module.
- Don't make anything van-specific.

## LLM credentials

Development uses a MiniMax key through its Anthropic-compatible endpoint. Anthropic's API key is the supported swap.

Don't wire Claude subscription credentials (`claude setup-token`, OAuth tokens) into this app. Anthropic's docs direct developers to API keys, and enforcement can happen without notice.

Keys live in `.env`, which must never be committed.
