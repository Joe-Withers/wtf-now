# 010: Agent loop and tools

**Depends on:** 002, 006

Implement the tools in SPEC §6.2 and the streaming agent loop.

- Direct tools apply and return an undo reference.
- `propose_*` tools create pending proposals, stored until approved or rejected. Related proposals can be grouped.
- Empty-bundle onboarding can create tasks directly.

**Done when:** a scripted conversation updates progress, creates a proposal, and applies it only after approval.
