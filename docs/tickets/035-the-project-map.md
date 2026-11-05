# 035: The project as a map

**Depends on**: 034

The plan was a tree of cards. It showed the shape of the work, but not where the work sits relative to each other, and it made you read to find the one thing you could do next.

The home screen is now a map of the project, drawn from the design in `docs/conceptualisation/design/`:

- The top-level groups of the project sit in a ring, with the project itself at the centre.
- Each group is a cluster: its work as dots, grey where it's done and in the group's colour where it isn't. A dot hangs off its parent when the parent is in the same group.
- The next task of each group waits just outside its cluster, glowing, with a label saying what it is. That label is the one thing on the map that is asking for your attention.
- A dependency inside a group is a plain line; one that crosses between groups is dashed, so you can see where the groups lean on each other.
- A note about a task is a small dot beside it, and links to the note.
- Picking a group in the panel dims the rest, so you can read one part of the project without losing the shape of the whole.
- Picking a task opens a panel below the map: the steps of the job it belongs to, what it needs, what it unblocks, and where it is.

The map is the home screen now. The tree of cards is still there, as **Plan**, for when you want to read the project rather than see it.

Two things changed underneath to make this honest:

- `GET /api/map` replaces `GET /api/graph`. It returns the whole project in one read: the groups, the tasks, what each task waits on and blocks, and the notes.
- A note can name the task it documents (`related`), through the write path, the API and the AI's tool. That's what puts the small dots on the map.

**Done when**: the app opens on the map, the map shows the shape of the project, and picking anything on it tells you what it is.
