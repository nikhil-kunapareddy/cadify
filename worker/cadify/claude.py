"""One conversation with Claude per generation run.

Turn 1 sends the PDF and asks for a structured interpretation; turn 2 asks
for CadQuery code; later turns feed execution errors back for a fix. The
conversation is append-only (assistant turns are passed back unchanged, as
preserved thinking requires), and the system prompt plus drawing form a
cached prefix shared by every turn.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from .prompts import RESPONSE_SCHEMA, SYSTEM_PROMPT, analysis_instructions, fix_instructions, modeling_instructions
from .protocol import WorkerError

DEFAULT_MODEL = "claude-opus-5-5"
# Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1", "claude-opus-5"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 32_000


@dataclass
class Usage:
    model: str
    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    served_by: set[str] = field(default_factory=set)

    def add(self, usage: Any, served_by: Optional[str]) -> None:
        self.requests += 1
        self.input_tokens += usage.input_tokens or 0
        self.output_tokens += usage.output_tokens or 0
        self.cache_read_tokens += usage.cache_read_input_tokens or 0
        self.cache_write_tokens += usage.cache_creation_input_tokens or 0
        if served_by:
            self.served_by.add(served_by)

    def to_json(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "servedBy": sorted(self.served_by),
            "requests": self.requests,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "cacheReadTokens": self.cache_read_tokens,
            "cacheWriteTokens": self.cache_write_tokens,
        }


class ModelSession(Protocol):
    usage: Usage

    def analyze(self, pdf: bytes, file_name: str, page_count: int) -> dict[str, Any]: ...
    def write_code(self, clarifications: str) -> dict[str, Any]: ...
    def fix_code(self, problem: str, attempt: int, max_attempts: int) -> dict[str, Any]: ...


class ClaudeSession:
    def __init__(self, client: Any, model: str = DEFAULT_MODEL, effort: str = "high"):
        self.client = client
        self.model = model
        # One effort level for the whole run: changing it between requests
        # would invalidate the cached prefix.
        self.effort = effort
        self.messages: list[dict[str, Any]] = []
        self.usage = Usage(model=model)

    def analyze(self, pdf: bytes, file_name: str, page_count: int) -> dict[str, Any]:
        self.messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "base64", "media_type": "application/pdf", "data": base64.b64encode(pdf).decode("ascii")},
                        "title": file_name,
                    },
                    {"type": "text", "text": analysis_instructions(file_name, page_count)},
                ],
            }
        )
        return self._request("analysis")

    def write_code(self, clarifications: str) -> dict[str, Any]:
        self.messages.append({"role": "user", "content": modeling_instructions(clarifications)})
        return self._request("program")

    def fix_code(self, problem: str, attempt: int, max_attempts: int) -> dict[str, Any]:
        self.messages.append({"role": "user", "content": fix_instructions(problem, attempt, max_attempts)})
        return self._request("program")

    def _request(self, expect: str) -> dict[str, Any]:
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": self.messages,
            "cache_control": {"type": "ephemeral"},
            "output_config": {"effort": self.effort, "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
        }
        if self.model in FALLBACK_MODELS:
            # A false-positive safety decline is retried on a fallback model
            # instead of failing the generation.
            params["betas"] = [FALLBACK_BETA]
            params["fallbacks"] = "default"

        # Streaming keeps long, thinking-heavy turns clear of HTTP timeouts.
        with self.client.beta.messages.stream(**params) as stream:
            message = stream.get_final_message()

        self.usage.add(message.usage, getattr(message, "model", None))
        # Append the assistant turn unchanged (thinking blocks included).
        self.messages.append({"role": "assistant", "content": message.content})

        if message.stop_reason == "refusal":
            details = getattr(message, "stop_details", None)
            category = getattr(details, "category", None) if details else None
            raise WorkerError("INTERPRETATION_FAILED", "Claude declined to process this drawing", f"refusal category: {category}")
        if message.stop_reason == "max_tokens":
            raise WorkerError("INTERPRETATION_FAILED", "Claude's response was cut off", "The response reached max_tokens.")

        text = next((b.text for b in message.content if getattr(b, "type", None) == "text"), None)
        if text is None:
            raise WorkerError("WORKER_PROTOCOL", "Claude returned no structured output")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise WorkerError("WORKER_PROTOCOL", "Claude returned malformed output", str(exc)) from exc
        part = data.get(expect) if isinstance(data, dict) else None
        if not isinstance(part, dict):
            raise WorkerError("WORKER_PROTOCOL", f"Claude returned no {expect}")
        return part


def map_api_error(exc: Exception) -> WorkerError:
    """Maps Anthropic SDK exceptions to CADify error codes (most specific first)."""
    import anthropic

    detail = getattr(exc, "message", None) or str(exc)
    if isinstance(exc, anthropic.AuthenticationError):
        return WorkerError("API_AUTH_FAILED", "Anthropic API authentication failed", detail)
    if isinstance(exc, anthropic.PermissionDeniedError):
        return WorkerError("API_PERMISSION_DENIED", "API key lacks permission", detail)
    if isinstance(exc, anthropic.RateLimitError):
        return WorkerError("API_RATE_LIMITED", "Anthropic API rate limit reached", detail)
    if isinstance(exc, anthropic.BadRequestError):
        return WorkerError("INTERPRETATION_FAILED", "The drawing could not be sent to Claude", detail)
    if isinstance(exc, anthropic.APIStatusError):
        return WorkerError("API_UNAVAILABLE", "Anthropic API unavailable", f"HTTP {exc.status_code}: {detail}")
    if isinstance(exc, anthropic.APIConnectionError):
        return WorkerError("NETWORK_OFFLINE", "Could not reach the Anthropic API", detail)
    return WorkerError("UNKNOWN", "Unexpected error while calling Claude", detail)
