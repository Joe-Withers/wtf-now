# 003: OKF bundle layer

**Depends on:** 001

Read and write OKF concepts in Python, per SPEC §4.1.

- Parse frontmatter and body with ruamel.yaml, preserving unknown keys and order.
- Read and append `log.md`: `YYYY-MM-DD` headings, newest first.
- Generate `index.md`, including `okf_version: "0.2"` at the root.

**Done when:** tests show a read-then-write round trip leaves a file unchanged, including unknown keys.
