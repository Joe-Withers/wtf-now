# 043: No panel on the map

**Depends on**: 042

Picking a job on the map used to pop a panel up from the bottom of the screen, with its steps, what it needs and a way into the chat. With the dependencies now drawn on the map itself, the panel was repeating the map and covering it.

Now:

- Picking a job draws its dependencies (042) and rings it, and nothing else happens. The map is the whole screen.
- Picking the same job again lets it go, and the lines go with it.
- The picked job stays in the address (`?task=`), so a link can still point at it.

The task screen, and the chat with a task in focus, are still reached from the plan and What now.

**Done when**: picking a job shows its dependencies and no panel, and picking it again clears them.
