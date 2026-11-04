"""The only module that talks to the LLM provider.

Works with any Anthropic-compatible endpoint, configured by environment.
"""

import os
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic, APIError
from anthropic.lib.streaming import MessageStream
from anthropic.types import MessageParam, ToolParam

from .config import load_env

DEFAULT_MAX_TOKENS = 4096


class LLMConfigError(Exception):
    pass


LLMError = APIError


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str

    def __repr__(self) -> str:
        return f"LLMConfig(base_url={self.base_url!r}, model={self.model!r})"


def load_config() -> LLMConfig:
    load_env()
    values = {name: os.environ.get(name, "").strip() for name in ("LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL")}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise LLMConfigError(f"Missing environment variables: {', '.join(missing)}")
    return LLMConfig(values["LLM_BASE_URL"], values["LLM_API_KEY"], values["LLM_MODEL"])


@dataclass(frozen=True)
class Turn:
    """A finished model response, as content blocks ready to replay in the history."""

    content: list[dict[str, Any]]
    stop_reason: str | None


class LLM:
    def __init__(self, config: LLMConfig) -> None:
        self.model = config.model
        self._client = Anthropic(base_url=config.base_url, api_key=config.api_key)

    @contextmanager
    def stream(
        self,
        messages: Iterable[MessageParam],
        *,
        system: str = "",
        tools: Iterable[ToolParam] = (),
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> Iterator[MessageStream]:
        options: dict = {}
        if system:
            options["system"] = system
        if tools:
            options["tools"] = list(tools)
        with self._client.messages.stream(
            model=self.model, max_tokens=max_tokens, messages=list(messages), **options
        ) as stream:
            yield stream

    def turn(
        self, messages: Iterable[MessageParam], *, system: str = "", tools: Iterable[ToolParam] = ()
    ) -> Iterator[str | Turn]:
        """Yields text as it arrives, then the finished Turn."""
        with self.stream(messages, system=system, tools=tools) as stream:
            yield from stream.text_stream
            message = stream.get_final_message()
        yield Turn([block.model_dump(exclude_none=True) for block in message.content], message.stop_reason)
