# 053: One recommended next

**Depends on**: 052

Every group had a job it would do next, so the map sparkled in six places and said nothing about where to start.

Now there is one recommended next job, and up to three more worth doing beside it.

- **On the map**, the next job sparkles and the others glow steadily. **In What now**, the next job shimmers and has a twinkling star, and the others have a steady glow.
- **The AI keeps it up to date.** It has a `set_recommended` tool, and is told to call it after it records work, changes tasks, or learns how much time the owner has, who can help, or what they have on hand. The picks are stored on the tasks themselves (`recommended: next` or `also`), so they live in the files, are committed, and can be undone.
- **Code keeps it honest.** Only unfinished work that nothing is holding up can be picked, and at most three more beside the next one. If the AI's picks stop being possible, because they got done or got blocked, the fixed ranking (already underway, then what fits the time, then what unlocks the most) takes over until the AI sets them again. So there is always an answer, and a stale pick can't mislead.
- A change to the recommendation isn't written to the log, since it would bury the real work.

Which job is recommended is the AI's judgement. Which jobs *can* be is the graph's, and that stays code.

**Done when**: one job sparkles on the map and in What now, and the AI can change which one.
