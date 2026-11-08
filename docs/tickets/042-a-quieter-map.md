# 042: A quieter map

**Depends on**: 041

The flow map drew every dependency at once, and with sixty of them the map was confusing: the lines were the loudest thing on it, and they said little about any one job. What an owner wants from the map at a glance is the state of the work, and what a single job is held up by only once they ask.

Now:

- **Done** work is outlined in green, with a near-white middle.
- **Available** work (not done, and not held up) keeps the colour of its group.
- **Waiting** work (not done, and waiting on work that isn't either) is the colour of its group, darkened.
- **No dependency lines** are drawn until a job is picked. Picking a job draws a line to each job it waits on, in red, and to each job that waits on it, in green. The tree lines stay.
- The picked job is ringed, and the legend explains each of these.

The inside-to-out order and the pull towards the group a job waits on (041) are unchanged, so the placement still says how far in the work you are.

**Done when**: an unpicked map shows only the state of the work, and picking a job shows what it needs and what it unlocks.
