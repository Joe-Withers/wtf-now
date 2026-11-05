# 033: The docs concept

**Depends on**: 032

"Floor plan" was too narrow a name for what the app had. A plan of the van is one drawing among others: a cabinet design, a wiring diagram, the shape of a shelf. And "wiki" was the other word for it, which hides the fact that most of this project's documentation is pictures rather than words.

So the app has one concept, **Docs**, made of two kinds of thing:

- **Drawings** — zones drawn as rectangles, coloured by how far the work in them has got. The AI draws them when you describe a shape, and can list them to find the zone a task belongs in.
- **Notes** — the written memory: research, decisions, measurements, inventory. Unverified measurements still need a tap to confirm.

One screen for both, with one search across tasks, drawings and notes. The old floor plan and wiki screens are gone; a drawing opens full size, where you can tap a zone and see the tasks in it.

The bundle keeps its `layouts/` and `notes/` directories: a concept's id is its file path, so files don't move. The app's word for what's in `layouts/` is now a drawing, everywhere — the endpoint, the tool the AI calls, the log entry, the screen.

**Done when**: Docs lists the drawings and the notes, searches across them, and opens a drawing with its zones and their tasks.
