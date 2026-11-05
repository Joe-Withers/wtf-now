# 027: Swap to the Anthropic API

**Depends on:** 010

Development uses MiniMax through its Anthropic-compatible endpoint. Point the app at Anthropic's own API with an API key, and confirm the agent loop still works: streaming, tool use, grouped proposals and the preflight hold.

**Done when:** `scripts/check_llm.py` passes against Anthropic, and a conversation in the app behaves the same as it does now.

**Status:** nothing provider-specific lives outside the LLM module, so this should be a config change. It needs an Anthropic API key.
