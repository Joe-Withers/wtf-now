# 040: A map you can read

**Depends on**: 039

The map was a scatter. Each group's work was dropped round its group at angles that came out of a formula rather than out of the project, every task hung off its group rather than off the task it belongs to, and every dependency was drawn as a straight line between two dots — so a dependency that crossed the project was a line through the middle of everything else. There were about sixty lines, and no way to tell which of them were structure.

And hiding the done work redrew the map from what was left, so every dot moved to make room for the ones that went away.

Now the map is a tree, drawn round:

- The groups are in a ring, each given a slice of the circle in proportion to how much work is in it, so a big group gets more room than a small one.
- All the jobs sit on the outer ring, in the order the tree puts them, so a group and the group under it sit next to each other and the lines between them never cross.
- The groups sit inside the ring, a ring further in for each level of nesting, and fan out to their work. A group inside a group shows as a hollow dot, so the shape of the project is the shape of the drawing.
- A dependency inside a group is a short curve. A dependency that crosses between two groups is drawn round the outside of the map, in a halo of dashed arcs with a band for each pair of groups, where it crosses nothing.
- Only the direct dependencies between jobs are drawn. A group carries the sum of its children's, so drawing those too drew half the dependencies twice.
- Hiding the done work moves nothing. The map is laid out from the whole project, and the done work is taken out of the drawing rather than out of the layout.

On a phone there is not room to call out the next task of every group, so only the group being looked at is called out.

**Done when**: the map can be read without tracing lines, and hiding the done work leaves the rest of the map where it was.
