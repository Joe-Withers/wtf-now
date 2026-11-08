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

A mobile-first web app, installable as a PWA, with an AI chat built in. You talk to it about the project, and it maintains the tasks and the docs. The screens show you the state of things; the chat is where the work gets recorded.

### 3.1 Screens

| Screen | Purpose |
|---|---|
| **Graph** | The home screen. The project as a flow drawn round: the groups in a ring, each given a slice of the circle in proportion to the work in it; the work inside to out, so a job that waits on nothing is on the first ring and a job that waits on three things is on the fourth; within a group's slice a job sits on the side of the group the work it waits on is on. Each group has its own colour, up to twelve, and a job with no group above it is tied to its own dot. Each group's dot has a ring round it that fills in green, clockwise from the top, by how much of the group is done. Done work is outlined in green with a near-white middle, available work keeps its group's colour, and work that is waiting on unfinished work is that colour darkened. No dependency lines are drawn until you pick a job: then a red line runs to each job it waits on and a green one to each job that waits on it. The next task of each group glows. The job you pick gets a label, clear of the work, and the label is a link to that task. Pick a group to focus it. Pick a job to see what it needs and what it unlocks, and pick it again to let it go. The map is the whole screen. |
| **What now?** | The work as a run of jobs: what you finished, what you could start now, what comes next, and what is further off. A line runs from each job to the job it holds up. |
| **Chat** | Conversation with the AI, with approve/reject cards for structural changes. It comes out of the side (§3.3). |
| **Task detail** | Current state, notes, dependencies, photos, and a way into the chat with that task in focus. |
| **Shopping** | Purchases to order, on order and arrived, with running cost. |
| **Docs** | The project's documentation: the drawings and the notes, with one search over both. |
| **Drawing** | One drawing full size: its zones coloured by progress, and the tasks in each zone. |
| **Log** | Project history, newest first. |

### 3.2 The screens read, the chat writes

There is no button anywhere in the app that changes a task's state, progress or current state. The screens show the plan; the chat records the work.

The owner says what happened in their own words — "I've ordered the PIR board", "it arrived", "I've got the floor down to the ribs" — and the AI works out what that means and updates the plan itself. For a purchase, to order is `todo`, on order is `doing`, and arrived is `done`.

Three taps survive, because each of them is the owner's judgement rather than a record of work:

- approving or rejecting a proposed change,
- undoing a change the AI made,
- confirming a measurement, which only the owner can do, or saying it's wrong, which removes the note so the right figures can be written down again.

Every screen keeps a way into the chat, and the task screen opens it with that task in focus, so reporting work is one tap from wherever you noticed it.

### 3.3 Look and feel

The app is one system, not a set of screens that happen to sit together.

- **A rail, not a bar.** The navigation runs down the left-hand side, so the bottom of the screen belongs to whatever you were reading. It is a compact strip of icons at every screen size: the rail holds the places you go, and each of them is a screen of its own.
- **A layout that fits the screen.** The app fills the window rather than floating in it. The rail is the same strip of icons on a phone and on a laptop, so the screen gets the width either way. Reading screens keep a comfortable measure, and card lists go two abreast when there is room. The screens that draw something use the whole width.
- **No page titles.** The rail says where you are, so the screens don't repeat it: Shopping, Docs, Log and What now open straight onto their content. A note or a drawing keeps its own title, because that is the thing itself rather than the name of the page.
- **One type scale.** Screen titles, section eyebrows, card titles and metadata each have a fixed size, so a card looks like a card wherever it appears.
- **One way of showing state.** A task's state is a pill — Not started, Underway, Done — and a purchase says To order, On order, Arrived. The same pill everywhere, never a stray word.
- **The chat comes out of the side.** One round button in the bottom-right corner pulls the chat out of the right-hand side, over whatever you were reading. It knows what you were looking at, so on a task screen it opens about that task. There is no chat tab, and no other way in.
- **Warm, high contrast, dark or light.** A workshop palette that stays readable in a dusty van.

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
  layouts/<slug>.svg   hand-drawn, or generated from zone rectangles by the AI
```

Photos don't go in the bundle or in git. They're stored in S3-compatible object storage, and notes and tasks reference them by key.

The app calls what's in `layouts/` a drawing, and `notes/` and `layouts/` together the docs. The directories keep their names because a concept's id is its file path, so files must not move.

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

Torque settings are in [the battery manual notes](/notes/battery-manual.md).
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
| `zone` | optional | A zone id from a drawing. |
| `closes_zone` | optional | A zone id this task makes inaccessible (§5.4). |
| `needs_helper` | leaves, optional | Needs a second person. |
| `cost` | purchases, optional | Expected or actual cost. |
| `depends_on` | all | List of `{task, strength}`, where strength is `hard` or `soft`. |

For a `purchase`, `todo` means to order, `doing` means on order, and `done` means arrived.

A task with children is a parent. Parents don't store `state`, `progress` or `effort_hours`; those are derived. Adding a child to a leaf clears those fields from it.

There are no separate state lists. A multi-step task is simply a task with children, so dependencies can attach to the exact step they block.

### 4.3 Docs

The docs are the project's memory: the notes and the drawings. The app calls the whole thing Docs; the bundle keeps its directories, because a concept's id is its file path and files must not move.

- Everything worth remembering goes in a note, written as it comes up and never saved for the end of a session.
- A note can name the task it documents (`related`), so the map can show it beside that task and the AI can find it again.
- A drawing is a set of named zones with an SVG alongside it. The AI draws them from rectangles when the owner describes a shape; zones carry the progress of the work inside them, and a task can close a zone off.
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

What now draws the same groups as a run of jobs, in four columns:

- **Done**: the last few things the log says you finished, newest first.
- **Ready now**: the work you could start now, whether it is a build, a purchase, a decision or a piece of research.
- **Up next**: the work one step away — waiting on one job, and that job is itself ready.
- **Later**: everything else that is still to do.

A line runs from a job to the job it holds up. The chips along the top filter the run by kind, and the jobs of other kinds fade rather than vanish, so the shape of the run stays.

### 5.4 Preflight

Before a task with `closes_zone` is started, the app lists every unfinished task in that zone, except work that depends on the closing task, and warns about them. The AI's change is held until the owner has been asked what else still needs to go behind it. This protects against the graph being incomplete, which it always will be.

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
| `search_docs`, `read_note`, `list_notes`, `list_drawings`, `read_log` | Read |
| `set_progress` | Applies directly; logs and commits |
| `set_state` | Applies directly; logs and commits |
| `update_current_state` | Applies directly; commits |
| `write_note` | Applies directly; commits, with trust fields. A note with the same title is replaced, never copied |
| `propose_changes` | Needs approval. One grouped list of task creates, updates, moves, deletes and dependency changes, and the removal of a note that is wrong or a duplicate, validated before it's shown and applied as one commit |

The AI has no tool for verifying notes. Only the owner can confirm a measurement.

The direct tools are how work gets recorded. The screens have no controls of their own, so when the owner reports something, these are the only route from their words to the bundle.

The AI shapes the plan as areas, never phases: the top level is the systems or places the work belongs to (electrics, water, the kitchen), named with plain nouns, and the order of the work lives in the dependencies rather than the grouping. Every task sits under an area, and work already finished is recorded as done tasks, not buried in a description.

Direct changes appear in the chat with an undo button. Proposed changes appear as one approve/reject card per group, so setting up a new area of work isn't dozens of taps.

The one exception is onboarding. While the bundle is empty, the first interview can create tasks directly, and the owner reviews the result as a whole.

### 6.3 Sessions

- Each session starts with assembled context: project summary, recent log, in-progress tasks, and the task in focus with its neighbours and linked notes.
- The docs are the memory, so nothing has to survive from one chat to the next.
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
| Voice | Record in the browser, transcribe on the server through an OpenAI-style endpoint. **Open:** which provider. |

---

## 8. Open questions

- Transcription provider for voice notes. Voice stays hidden until one is configured.
- Whether the owner keeps the Default deployment. The files for it exist but haven't been run; see `docs/deployment.md`.
