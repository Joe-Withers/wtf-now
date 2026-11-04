# wtf-now — design spec (draft)

> **Superseded by [`docs/SPEC.md`](../SPEC.md).** Kept as a record of the original conversation.

This captures the initial design conversation. Items are marked **Decided**, **Leaning** or **Open**. Anything not marked Decided is up for discussion.

---

## 1. Goals

1. Make it cheap to resume a stalled physical project after weeks or months away.
2. Always be able to answer "what can I do next?" given what's blocked.
3. Turn "I'm stuck because I need to buy/research/decide something" into visible, actionable tasks rather than silent blockers.
4. Keep a durable, human-readable record of the project (decisions, measurements, research) that outlives any chat session — and outlives the app.

## 2. Non-goals (for now)

- Multi-user collaboration.
- Gantt charts, scheduling against dates, resource levelling. This is a dependency map, not MS Project.
- Being van-specific. The first user is a van conversion, but nothing in the model should assume vans.

---

## 3. Core concepts

### 3.1 Tasks (Decided: nested, any depth)

- Tasks form a tree. Parents group children; there's no fixed depth.
- A parent's completion is derived from its children, never set directly.

### 3.2 Task kinds (Leaning)

First-class kinds, because "need to buy/research/decide" is where the project stalls:

| Kind | Example |
|---|---|
| `build` | Fit rear-left wall insulation |
| `purchase` | Order 50mm PIR board |
| `research` | How do other people vent the fridge? |
| `decision` | Lithium vs AGM leisure battery |

The "what next" view can then split unblocked work into:
- **Can do now** — build tasks with everything they need
- **Need to order first** — purchase tasks gating build tasks
- **Need to decide/research first**

Purchase tasks also give a shopping list and running budget for free.

### 3.3 Dependencies (Decided: graph, AI-proposed, user-correctable)

- Dependencies can point anywhere in the tree (across branches).
- Two strengths (Leaning):
  - `hard` — physically impossible after (can't insulate behind a fitted cabinet)
  - `soft` — much easier before
- The AI starts with reasonable assumptions. The user corrects them conversationally; the AI **proposes** the change and the user confirms.
- **Graph integrity is enforced in code, not by the LLM**: cycle detection, "is unblocked", roll-ups.

### 3.4 Progress state (Decided: derived, not guessed)

- The LLM should not free-estimate percentages — they'll jitter between sessions.
- Instead each task has an ordered list of concrete states, and the set of states reached. Percentage = reached / total (possibly weighted later).

  Example: electronics board
  `mounted-on-ply → wired-internally → battery-connected → solar-connected → installed`
  Currently: `mounted-on-ply`.
- The AI proposes the state breakdown; the user can edit it.

### 3.5 Zones / floor plan (Leaning)

- Many dependencies in physical builds are about *access* — what's behind what. Tagging tasks with a `zone` helps the AI spot these.
- The floor plan is its own concept (`type: Layout`) linking to an SVG or JSON file defining zones.
- Tasks reference a zone by id (`zone: rear-left-wall`).
- The coloured progress map is a join: zone geometry from the layout + completion from tasks in that zone.
- Geometry does **not** go in frontmatter (OKF frontmatter is meant to stay shallow).

### 3.6 Wiki (Decided: the wiki is the memory)

- Chat sessions are throwaway (with an option to resume a recent one — Open).
- Everything worth remembering is written into the wiki: research, decisions and *why*, measurements, part numbers, links.
- The wiki is structured like the task tree, so discussing a task mostly updates that task's area.
- The next session gets relevant wiki pages as context instead of old transcripts.
- Separate **facts/decisions** (verified, durable) from **research notes** (AI-generated, may go stale). See OKF trust fields below.

---

## 4. Storage

### 4.1 Format: Open Knowledge Format (OKF) v0.2 (Decided)

OKF is a spec for knowledge as a directory of markdown files with YAML frontmatter, designed for corpora continuously maintained by agents. Relevant features:

- A **bundle** is a directory tree of markdown files; a **concept** is one file (frontmatter + body).
- Only `type` is required in frontmatter; anything else is a producer extension, so we can add our own fields.
- Concepts cross-link with ordinary markdown links.
- **Trust/lifecycle fields** (`generated`, `verified`, `status`, `stale_after`) — use these for the facts-vs-research split, and `stale_after` for prices/availability.
- **Provenance** via a `sources` family and per-claim footnote attribution.
- **`log.md`** update history per directory.
- Existing tooling (Rust `okf`/`okf-core`, Dart `okf`) can validate, index, diff and export the link graph to JSON/DOT/Mermaid.

TODO: read the actual spec and confirm field names before building on them.

### 4.2 Tasks live in the bundle (Leaning — strong)

Rather than a separate task store, each task is an OKF concept with `type: Task`:

- **Frontmatter** = task data (kind, zone, dependencies, states, progress).
- **Body** = that task's wiki notes.
- **Directory nesting** = task nesting.
- **`log.md`** = progress history ("mounted electronics on ply" is both a log entry and a state change).
- Non-task concepts (research, decisions, layout, parts) sit alongside and link to tasks.

Benefits: one source of truth, the LLM reads and writes everything the same way, plain markdown in git, readable without the app. If the app dies the van's documentation doesn't.

Sketch (field names provisional):

```markdown
---
type: Task
id: electrics-board
title: Electronics board
kind: build
zone: rear-right-cabinet
depends_on:
  - id: battery-install
    strength: hard
  - id: rear-right-cabinet-frame
    strength: hard
states: [mounted-on-ply, wired-internally, battery-connected, solar-connected, installed]
reached: [mounted-on-ply]
---

Victron MPPT 100/30 + Multiplus... (notes, decisions, links to research)
```

### 4.3 Stable IDs (Decided in principle; mechanism Open)

The tree will be restructured as the project evolves ("solar belongs under roof work"). Dependencies must survive moves.

- Option A: every task has a stable `id`; dependencies reference ids, not paths.
- Option B: path-based links, with every move going through a refactor step that rewrites inbound links.

Leaning A. Check how this sits with OKF's path-based concept ids.

### 4.4 Files are the source of truth; the DB is a cache (Decided)

- On load, the app builds an index (SQLite or in-memory) for fast queries: unblocked tasks, cycle checks, roll-ups, floor-plan colouring.
- Nothing writes to the index directly. Index is rebuildable from files at any time.
- The bundle should live in git.

---

## 5. The AI

### 5.1 Write access via tools only (Decided)

The LLM never edits files freely. It gets a small set of tools; each validates before writing. Initial list (provisional):

| Tool | Notes |
|---|---|
| `create_task` | parent, title, kind, zone, initial states |
| `update_task` | title/kind/zone/state list |
| `set_progress` | mark states reached/unreached; appends to log |
| `add_dependency` / `remove_dependency` | rejects cycles |
| `move_task` | re-parent; keeps ids/links valid |
| `write_note` | create/update a wiki concept, with trust/provenance |
| `query` | unblocked tasks, task subtree, zone, search wiki |

Structural changes (dependencies, moves, state lists) are shown to the user as proposals/diffs to confirm. Progress updates and notes can probably apply directly with undo — Open.

### 5.2 Sessions (Decided: throwaway; Open: resume)

- Each session starts with context assembled from the bundle: project summary, the task(s) in focus, their neighbours/dependencies, and relevant wiki pages.
- At the end (or continuously) the AI writes anything worth keeping back into the wiki.
- Open: whether to keep recent transcripts for resuming, and for how long.

### 5.3 Model/provider (Open)

---

## 6. Capture (Leaning: make logging nearly free)

If logging progress feels like admin it won't happen, the state goes stale and the app stops being trusted. Priority input modes:

- Voice note from the van ("finished the ceiling panels, ran out of screws") → AI turns it into state changes, log entries, maybe a new purchase task.
- Photo attached to a task as evidence.

Implies a phone-friendly UI at some point. Open: how early.

---

## 7. Views

1. **What now?** — unblocked tasks grouped as can-do / order-first / decide-first. *The* main screen.
2. **Task tree** — expandable, with roll-up percentages.
3. **Dependency graph** — early version could just be OKF tooling's Mermaid export.
4. **Floor plan** — zones coloured by completion.
5. **Shopping list / budget** — from purchase tasks.
6. **Wiki** — browse/read concepts.

---

## 8. Suggested MVP

Deliberately small, so building the app doesn't replace working on the van:

1. OKF bundle on disk with `Task` concepts + notes.
2. Loader/index: tree, dependency graph, cycle check, unblocked query, roll-ups.
3. Chat with the AI wired to the tools in §5.1.
4. A "what now?" view and a task tree view.

Use it on the actual van for a few weeks before adding the floor plan, graph visuals, voice capture etc.

---

## 9. Open questions

- Tech stack (language, UI: web / desktop / mobile).
- LLM provider and how tool calls are wired.
- Stable id mechanism vs OKF concept ids (§4.3).
- Which changes need confirmation vs apply-with-undo (§5.1).
- State weighting — are all states equal?
- Session resume — keep transcripts or not.
- Relationship to [thenn](https://github.com/) (the author's Claude Code flow-orchestration plugin), if any.
