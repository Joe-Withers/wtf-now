# 041: The flow of the work

**Depends on**: 040

The map was a tree, and a tree is a shape, not a story. It showed how the work is grouped, but not what waits on what — and the lines that did show that were the same grey as the lines that showed the tree, so the map had one voice, and it was quiet. In the dark theme they were almost gone: grey on near-black at a fifth of an opacity.

Three things were wanted:

- The order of the work, inside to out. A job that waits on nothing is the first thing you can do, and a job that waits on three things is the last.
- The side of a group that a job sits on follows the group that job is waiting on, so a dependency is a short line rather than one across the map.
- The lines to show a direction: drawn in the colour of the group they come from, fading to a tint of orange where they land on the job that waits on them.

Now the map is a flow, drawn round:

- The groups are in a ring, each given a slice of the circle in proportion to how much work is in it, and the work sits inside to out. Each job is a step deep: a job that waits on nothing is on the first ring, a job that waits on a job that waits on nothing is on the second, and so on out to the edge. The deeper a job is, the later it comes.
- Within a group's slice, a job is pulled to the side of the group that the work it waits on is on. A job in the interior that waits on the floor sits on the floor's side of the interior, and the line between them is short. A dependency on another group pulls harder than one inside the same group, because that is the line that would otherwise cross the whole map.
- Every dependency is a line in the colour of the group it comes from, running to a tint of orange where it lands on the job that waits on it. The colour says where the work comes from; the orange says where it is going. A dependency that crosses between two groups bows away from the middle of the map, so it goes round the work rather than through it.
- The lines are visible in the dark theme, where they were not before.
- The label of the next job of a group moves out of the way of the work, so a call-out never hides a job.

The tree is still there, in the faint lines from each group to the work under it, and a group inside a group still shows as a hollow dot.

**Done when**: the map shows the order of the work and the direction of every dependency, and a call-out never covers a job.
