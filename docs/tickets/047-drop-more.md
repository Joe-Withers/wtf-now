# 047: Drop the More tab

**Depends on**: 046

More was where the menu used to live. Everything in it has moved to a place of its own, and what was left was a list of problems found in the project files, which only ever appears when something is wrong.

Now the tab, its route (`/more`) and its screen are gone, and the rail is five places: the map, What now, Shopping, Docs and Log.

The backend still finds those problems and serves them at `/api/problems`; nothing in the app shows them yet.

**Done when**: there is no More tab and nothing links to it.
