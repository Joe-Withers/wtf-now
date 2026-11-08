# 046: Drop the plan screen

**Depends on**: 045

The plan was the project as a tree of cards. Since the map shows the shape, the state and the dependencies of the work, and What now shows what to do next, it had nothing left to say that they don't.

Now:

- The Plan screen, its route (`/plan`), its icon in the rail, its layout code and its styles are gone.
- The rail is six places: the map, What now, Shopping, Docs, Log and More.
- The backend `/api/tree` endpoint is left alone, since nothing in the frontend asks for it but the AI tools and other readers still might.

**Done when**: there is no way to reach the plan, and nothing in the app links to it.
