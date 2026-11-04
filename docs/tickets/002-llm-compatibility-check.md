# 002: LLM compatibility check

**Depends on:** 001

Prove the Anthropic Python SDK works against MiniMax's Anthropic-compatible endpoint for what we need, before building on it. Build the small LLM module all later calls go through.

Check with a real key: streaming text, tool calls, streamed tool calls, multi-step tool loops, and image input for ticket 020.

**Done when:** a script runs a streamed multi-tool conversation using only environment config, and any gaps are written down in `docs/llm-compatibility.md`.
