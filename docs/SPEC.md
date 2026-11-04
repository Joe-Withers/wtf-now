# wtf-now — spec

The current design. It supersedes `docs/conceptualisation/SPEC.md`, which is kept as a record of the original conversation.

Everything here is decided unless it's marked **Default** (a choice made on the owner's behalf, still easy to change) or **Open**.

---

## 1. Goals

1. Make it cheap to resume a stalled physical project after weeks or months away.
2. Always answer "what should I do now?", given what's blocked and how much time there is.
3. Turn "I need to buy/research/decide something" into visible tasks rather than silent blockers.
4. Keep a durable, human-readable record of the project that outlives any chat session and the app itself.

## 2. Non-goals

- Multi-user collaboration. One owner per deployment.
- Date scheduling, Gantt charts, resource levelling.
- Offline mode. The app assumes a phone signal.
- Anything specific to vans. A van conversion is the first project, not the model.

---

## 3. Product

A mobile-first web app, installable as a PWA, with an AI chat built in. You talk to it about the project, and it maintains the tasks and wiki. The screens let you see the state of things and make quick changes by tapping.

### 3.1 Screens

| Screen | Purpose |
|---|---|
| **Home** | The re-entry view: what you last did, where you left off, what's arrived, and three suggestions. Opens instantly, with no LLM call. |
| **What now?** | All available work, grouped (§5.3), filtered by time available and whether you have a helper. |
| **Chat** | Conversation with the AI, with approve/reject cards for structural changes. |
| **Task tree** | Expandable tree with roll-up progress bars. |
| **Task detail** | Current state, notes, dependencies, photos, quick actions. |
| **Shopping** | Purchases to order, on order and arrived, with running cost. |
| **Floor plan** | Zones coloured by progress. |
| **Dependency graph** | The task graph. |
| **Wiki** | Browse and search notes. |
| **Log** | Project history, newest first. |

---

## 4. Storage

### 4.1 Bundle

Project data is an Open Knowledge Format (OKF) v0.2 bundle: a directory of markdown files with YAML frontmatter. It lives on the server's persistent disk in **its own git repository**, separate from the app code. The app creates the repo on first run, commits every write and pushes to a private remote. The remote is the off-site backup: a new server clones it and carries on. The owner never has to manage the repo.

```
<bundle>/
  index.md             generated; declares okf_version: "0.2"
  log.md               the project journal
  tasks/<slug>.md      one per task, flat
  notes/<slug>.md      research, decisions, parts, measurements, inventory
  layouts/<slug>.md    type: Layout, references the SVG alongside it
  layouts/<slug>.svg
```

Photos don't go in the bundle or in git. They're stored in S3-compatible object storage, and notes and tasks reference them by key.

Facts about OKF that shape this design:

- A concept's id is its file path, so files must not move. This is why tasks are flat, with the tree held in `parent`.
- `index.md` and `log.md` are reserved filenames.
- `status` is reserved for document lifecycle (`draft`/`stable`/`deprecated`). Never use it for task state.
- Broken links are not errors in OKF, and links are untyped. wtf-now's validator enforces its own integrity.
- Unknown frontmatter keys must be preserved when rewriting a file.

The app does not depend on OKF tooling. Rust and Dart libraries exist, so Python gets a thin layer of its own.

### 4.2 Task

```markdown
---
type: Task
title: Connect the battery to the electronics board
description: Run and terminate the 35mm² cables from the battery to the board.
parent: electrics-board
kind: build
state: doing
progress: 40
progress_reason: Cables cut and crimped, not yet routed
effort_hours: 3
zone: rear-right-cabinet
needs_helper: false
depends_on:
  - task: battery-install
    strength: hard
---

## Current state

Cables are cut and crimped. They're in the blue box under the bed.

## Notes

Torque settings are in [the battery manual notes](/notes/battery-manual).
```

| Field | Applies to | Meaning |
|---|---|---|
| `title`, `description` | all | Title may change. The slug never does. |
| `parent` | all | Parent's slug. Absent means top level. |
| `kind` | all | `build`, `purchase`, `research` or `decision`. |
| `state` | leaves | `todo`, `doing` or `done`. |
| `progress` | leaves | 0–100, an AI estimate. `done` implies 100, `todo` implies 0. |
| `progress_reason` | leaves | Why the estimate is what it is. |
| `effort_hours` | leaves | Rough AI estimate. Drives roll-ups and the time filter. |
| `zone` | optional | A zone id from a Layout. |
| `closes_zone` | optional | A zone id this task makes inaccessible (§5.4). |
| `needs_helper` | leaves, optional | Needs a second person. |
| `cost` | purchases, optional | Expected or actual cost. |
| `depends_on` | all | List of `{task, strength}`, where strength is `hard` or `soft`. |

For a `purchase`, `todo` means to order, `doing` means on order, and `done` means arrived.

A task with children is a parent. Parents don't store `state`, `progress` or `effort_hours`; those are derived. Adding a child to a leaf clears those fields from it.

There are no separate state lists. A multi-step task is simply a task with children, so dependencies can attach to the exact step they block.

### 4.3 Wiki

- Everything worth remembering goes in the wiki, written as it comes up and never saved for the end of a session.
- Each task page keeps a `## Current state` section, rewritten as things change, so where you left off is always in a predictable place.
- `log.md` is the history. Every progress change appends an entry.
- `notes/inventory.md` records tools and stock on hand. The AI uses it to judge whether you have what a task needs.
- Facts and research are separated with OKF trust fields. `generated` records who wrote a note, as `human:owner` or `<model>/<version>`. `verified` is added when the owner confirms it. `stale_after` goes on prices and availability.
- Measurements are shown as unverified until the owner confirms them with a tap, because a misheard number can mean a wrongly cut panel.

### 4.4 Source of truth

- Files are the source of truth. The graph is built in memory on load and refreshed after writes. There is no database.
- All writes go through one core library and hold a single write lock. The AI tools and the REST API both call it.
- Every write is a git commit in the bundle, which is what makes undo work. Pushing to the remote happens afterwards and is retried, so a failed push never fails a write.
- Files can be hand-edited, so the loader never assumes validity. It reports problems (bad references, cycles, parents with leaf fields) and carries on where it safely can.

---

## 5. Computed behaviour

All of this is code, never LLM judgement.

### 5.1 Blocking

A leaf is **blocked** if any `hard` dependency, its own or one inherited from an ancestor, isn't done. A dependency on a parent is satisfied when all that parent's leaves are done. `soft` dependencies never block; they produce a warning such as "easier after X". Cycles are rejected on write and reported on load.

### 5.2 Roll-up

Parent progress = sum(`effort_hours` × `progress`) ÷ sum(`effort_hours`) across its leaves. A leaf with no `effort_hours` counts as 1.

Bars can shrink when new work is discovered. That's accurate, and it's expected.

`progress` and `effort_hours` are stored, and only change when something has actually happened, with the reason recorded. They are not re-estimated at each session, so they don't jitter.

### 5.3 What now?

Unblocked, unfinished leaves are grouped as:

- **Can do now**: `build`
- **Order first**: `purchase` in `todo`
- **On its way**: `purchase` in `doing`
- **Decide or research first**: `decision`, `research`

Home shows three suggestions from **Can do now**, chosen by a fixed ranking: fits the time available, then already in progress, then unlocks the most downstream effort. Identical inputs give identical suggestions.

### 5.4 Preflight

Before a task with `closes_zone` is started, the app lists every unfinished task in that zone and warns about them. The AI then asks what else still needs to go behind it. This protects against the graph being incomplete, which it always will be.

---

## 6. The AI

### 6.1 Provider

Calls go through the Anthropic Python SDK, configured entirely by environment:

```
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
```

Development uses a MiniMax key through its Anthropic-compatible endpoint. Swapping to Anthropic's API is a config change, so no provider-specific logic is allowed outside the LLM module, and features beyond streaming and tool use must be optional.

Claude subscription tokens are not a supported credential; use an API key. See the note in `CLAUDE.md`.

### 6.2 Tools

| Tool | Effect |
|---|---|
| `query_tasks`, `get_task`, `what_now` | Read |
| `search_wiki`, `read_note`, `read_log` | Read |
| `set_progress` | Applies directly; logs and commits |
| `set_state` | Applies directly; logs and commits |
| `update_current_state` | Applies directly; commits |
| `write_note` | Applies directly; commits, with trust fields |
| `propose_create_task` | Needs approval |
| `propose_update_task` | Needs approval |
| `propose_move_task` | Needs approval |
| `propose_add_dependency`, `propose_remove_dependency` | Needs approval; cycles rejected before it's shown |

Direct changes appear in the chat with an undo button. Proposed changes appear as approve/reject cards, and related proposals can be grouped into one card so that setting up a new area of work isn't dozens of taps.

The one exception is onboarding. While the bundle is empty, the first interview can create tasks directly, and the owner reviews the result as a whole.

### 6.3 Sessions

- Each session starts with assembled context: project summary, recent log, in-progress tasks, and the task in focus with its neighbours and linked notes.
- The wiki is the memory, so nothing has to survive from one chat to the next.
- Transcripts are stored outside the bundle so a recent chat can be resumed. **Default:** kept for 30 days.

---

## 7. Stack

| Part | Choice |
|---|---|
| Backend | Python, FastAPI, Pydantic, uv, pytest |
| YAML | ruamel.yaml, for round-trip preservation |
| Streaming | Server-sent events |
| Frontend | React, Vite, TypeScript, TanStack Query, PWA plugin |
| Deployment | **Default:** small VPS with Docker Compose, behind Tailscale. Private access means no login to build. |
| Photos | S3-compatible object storage. **Default:** Cloudflare R2 or Backblaze B2. |
| Voice | **Open:** record in the browser, transcribe on the server. Provider to be chosen. |

---

## 8. Open questions

- Transcription provider for voice notes.
- Whether the owner keeps the Default deployment.
