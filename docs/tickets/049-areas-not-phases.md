# 049: Areas, not phases

**Depends on**: 048

The first real project showed three things going wrong.

- The AI gave a flat list, had to be asked to group it, and then grouped it into numbered phases. A build isn't strictly ordered, so a phase is the wrong shape for a group: order belongs in the dependencies.
- Three jobs had been left at the top level with no group, so each was a group of one. On the map that job's dot sat on its own, tied to nothing.
- There were nine groups and six colours, so three pairs of groups looked the same.

Now:

- The AI is told to shape the plan as areas (electrics, water, the kitchen), named with plain nouns, with no numbers and no "phase", from its first proposal. Every task goes under an area, nothing sits at the top level alone, and finished work is recorded as done tasks, not buried in a description.
- A job with no group above it is tied to its own dot on the map.
- There are twelve group colours instead of six, and no two groups share one until there are more than twelve.

The AI only follows the prompt for what it adds from now on. Jobs it has already left at the top level need moving under an area, which the owner can ask the chat to do.

**Done when**: a new project is grouped by area without being asked, and no job floats alone on the map.
