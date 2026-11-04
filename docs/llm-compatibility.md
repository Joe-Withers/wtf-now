# LLM compatibility

Results of `scripts/check_llm.py`, run from `backend/` with `uv run python scripts/check_llm.py`. Run it again whenever the provider or model changes.

**Last run:** 2026-11-04 against `MiniMax-M3` at `https://api.minimax.io/anthropic`, using the Anthropic Python SDK 2.5.0. All checks passed on three consecutive runs. The image check was strengthened before the last two.

| Capability | Result |
|---|---|
| Streaming text | Works; text arrives in 17–20 deltas |
| System prompt | Honoured |
| Tool call, streamed | Works; arguments arrive as `input_json_delta` events and parse correctly |
| Multi-step tool loop | Works; each step used the previous result |
| Parallel tool calls | Works; two calls in one turn |
| Image input | Works on solid-colour test images |
| Usage reporting | Input and output token counts are returned |

## What the agent loop must handle

- A response can contain a `text` block before its `tool_use` block, so the UI should show text and tool activity in the same turn.
- One turn can contain several tool calls, and every one needs a result.
- Replay assistant content blocks unchanged in the history. No thinking blocks appeared in these runs, but other models may return them.

## Not tested

- Real photos. Solid colours show that images reach the model, not how well it reads a photo of a wiring job. Ticket 020 should test this.
- Prompt caching and extended thinking. We don't rely on either.
- Anthropic's API. The module uses nothing MiniMax-specific, but this script should be run against it before swapping.
