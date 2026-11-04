# 004: Task model and validation

**Depends on:** 003

Implement the Task schema from SPEC §4.2 and the loader.

- Load all tasks into an in-memory tree.
- Report problems without crashing: bad parent or dependency references, cycles, leaf fields on parents, invalid values.

**Done when:** a fixture bundle with deliberate faults produces the right report and the valid parts still load.
