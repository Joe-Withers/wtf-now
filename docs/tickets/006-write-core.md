# 006: Write core

**Depends on:** 005

The single write path from SPEC §4.4, used by both the AI tools and the REST API.

- Operations for each change in SPEC §6.2.
- Validate before writing; reject cycles.
- Hold a write lock, write the files, append to the log, commit to the bundle repo.
- Undo by reverting a change.

**Done when:** every operation is tested, a rejected write changes nothing, and undo restores the previous state.
