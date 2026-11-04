"""Checks the configured LLM endpoint supports what wtf-now needs.

Run from backend/ with: uv run python scripts/check_llm.py
"""

import base64
import struct
import traceback
import zlib
from collections import Counter

from wtf_now.llm import LLM, load_config

TASK_TOOL = {
    "name": "get_task",
    "description": "Look up a task by its slug.",
    "input_schema": {
        "type": "object",
        "properties": {"slug": {"type": "string"}},
        "required": ["slug"],
    },
}
PROGRESS_TOOL = {
    "name": "set_progress",
    "description": "Set a task's progress from 0 to 100, with a reason.",
    "input_schema": {
        "type": "object",
        "properties": {
            "slug": {"type": "string"},
            "progress": {"type": "integer"},
            "reason": {"type": "string"},
        },
        "required": ["slug", "progress", "reason"],
    },
}


def solid_png(rgb: tuple[int, int, int], size: int = 64) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    row = b"\x00" + bytes(rgb) * size
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(row * size)) + chunk(b"IEND", b"")


def collect(llm: LLM, messages: list, **options):
    events: Counter = Counter()
    with llm.stream(messages, **options) as stream:
        for event in stream:
            delta = getattr(event, "delta", None)
            events[f"{event.type}:{getattr(delta, 'type', '')}".rstrip(":")] += 1
        return stream.get_final_message(), events


def block_types(message) -> list[str]:
    return [block.type for block in message.content]


def check_streaming_text(llm: LLM) -> str:
    message, events = collect(llm, [{"role": "user", "content": "Write three short sentences about plywood."}])
    text_deltas = events["content_block_delta:text_delta"]
    assert text_deltas > 1, f"text arrived in {text_deltas} delta(s): {dict(events)}"
    return f"{text_deltas} text deltas, blocks {block_types(message)}, stop {message.stop_reason}, usage {message.usage.input_tokens}/{message.usage.output_tokens}"


def check_system_prompt(llm: LLM) -> str:
    message, _ = collect(
        llm,
        [{"role": "user", "content": "What is the code word?"}],
        system="The code word is HALYARD. Answer with only the code word.",
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    assert "HALYARD" in text, text
    return "system prompt honoured"


def check_streamed_tool_call(llm: LLM) -> str:
    message, events = collect(
        llm,
        [{"role": "user", "content": "Look up the task with slug battery-install."}],
        tools=[TASK_TOOL],
    )
    calls = [block for block in message.content if block.type == "tool_use"]
    assert calls, f"no tool call: {block_types(message)}"
    assert calls[0].input == {"slug": "battery-install"}, calls[0].input
    assert message.stop_reason == "tool_use", message.stop_reason
    return f"{events['content_block_delta:input_json_delta']} input_json deltas, blocks {block_types(message)}"


def check_multi_step_loop(llm: LLM) -> str:
    """Each step depends on the last, with full history (including any thinking) replayed."""
    tasks = {"electrics-board": "Depends on battery-install, which is 60% done.", "battery-install": "60% done."}
    messages = [
        {
            "role": "user",
            "content": "Look up electrics-board, then look up the task it depends on, then set "
            "electrics-board to 25 with a reason. Do these one at a time.",
        }
    ]
    called: list[str] = []
    for _ in range(8):
        message, _events = collect(llm, messages, tools=[TASK_TOOL, PROGRESS_TOOL], system="You manage a task list.")
        messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in message.content]})
        calls = [block for block in message.content if block.type == "tool_use"]
        if not calls:
            break
        results = []
        for call in calls:
            called.append(call.name)
            output = tasks.get(call.input.get("slug"), "No such task.") if call.name == "get_task" else "Saved."
            results.append({"type": "tool_result", "tool_use_id": call.id, "content": output})
        messages.append({"role": "user", "content": results})
    assert called.count("get_task") >= 2 and "set_progress" in called, called
    return f"calls {called}, final blocks {block_types(message)}"


def check_parallel_tool_calls(llm: LLM) -> str:
    message, _ = collect(
        llm,
        [{"role": "user", "content": "Look up both battery-install and solar-panels at once, in parallel."}],
        tools=[TASK_TOOL],
    )
    count = block_types(message).count("tool_use")
    return f"{count} tool call(s) in one turn"


def check_image_input(llm: LLM) -> str:
    answers = []
    for colour, rgb in (("green", (20, 200, 20)), ("blue", (20, 20, 220))):
        image = base64.b64encode(solid_png(rgb)).decode()
        message, _ = collect(
            llm,
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image}},
                        {"type": "text", "text": "What single colour fills this image? Answer in one word."},
                    ],
                }
            ],
        )
        text = "".join(block.text for block in message.content if block.type == "text")
        assert colour in text.lower(), f"expected {colour}, got {text!r}"
        answers.append(text.strip())
    return f"answered {answers}"


def main() -> None:
    config = load_config()
    print(f"Endpoint {config.base_url}, model {config.model}\n")
    llm = LLM(config)
    failures = 0
    for check in (
        check_streaming_text,
        check_system_prompt,
        check_streamed_tool_call,
        check_multi_step_loop,
        check_parallel_tool_calls,
        check_image_input,
    ):
        name = check.__name__.removeprefix("check_")
        try:
            print(f"PASS {name}: {check(llm)}")
        except Exception as error:
            failures += 1
            print(f"FAIL {name}: {type(error).__name__}: {str(error)[:500]}")
            if not isinstance(error, AssertionError):
                print("     " + traceback.format_exc().strip().splitlines()[-1][:300])
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
