# 036: What now as a run of jobs

**Depends on**: 035

What now was a flow of cards: the last few things you did, then the work you could start, then the shopping and the deciding. It read well down a column, but it didn't show the shape of the run — which job came after which, and how far away the rest of the work was.

Now it is a run of jobs, drawn from the design in `docs/conceptualisation/design/`:

- Four columns: **DONE**, **READY NOW**, **UP NEXT** and **LATER**, each with a count.
- **DONE** is the last few things the log says you finished.
- **READY NOW** is the work you could start now, with the job underway in it showing how far it has got.
- **UP NEXT** is the work one step away: waiting on one job, and that job is itself ready.
- **LATER** is everything else that is still to do.
- A line runs from a job to the job it holds up, so the run can be read as a run. The lines touching the job you've picked are lit.
- The chips along the top filter by kind — Build, Buy, Decide, Research — and the jobs of other kinds fade rather than vanish, so the shape of the run stays.
- Picking a job opens the panel below: its steps, what it needs, what it unblocks, and where it is.

The screen keeps the same left-hand panel as the map, so the project and the run of jobs are read together.

Nothing on the screen changes a job. The panel's action is to open the chat about that job, because the chat is where the work is recorded.

One thing changed underneath: `GET /api/map` now also carries the last few finished steps, so What now is one read rather than two.

**Done when**: What now shows the work as a run of jobs, and picking any job tells you what it is and what it holds up.
