# 039: A compact rail

**Depends on**: 038

038 put the plan behind a switch at the top of each of the three views, so that the rail held only the places you actually go. But the switch was in the way: it took the top-right corner of every screen for something that was not the screen, and the plan — the one view that reads as a tree of work — became a tab rather than a place.

And the rail itself was doing two jobs. On a phone it was a strip of icons down the left. On a laptop it widened into a 224px sidebar with the wordmark and the names of the screens, which was a different navigation on a different device for no good reason — the screen names were taking a third of the width to say what the icons already said.

So:

- **The rail is a compact strip of icons at every screen size.** 68px, icons only, the wordmark at the top. The names of the screens are still in the markup, for screen readers and as tooltips, but you read them from the icons.
- **The plan goes back in the rail**, next to the map and What now. It is a place you go, like the rest.
- **The switch is gone.** Nothing at the top of the screen but the screen itself.
- **The More screen loses its menu**, since the rail is now the whole of the navigation. It keeps what is left: the problems in the project files.

The screens get the width back: the map has more room for the project, and the plan has more room for its columns.

**Done when**: the navigation looks the same on a phone and on a laptop, and the plan is in the rail with the other screens.
