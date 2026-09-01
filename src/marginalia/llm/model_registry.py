"""Resolved model transport metadata.

Public settings describe provider identity, endpoint, model, and genuine model
capabilities. Request-shape quirks are resolved here so profiles do not expose
dialect, tokenizer, or provider token-limit field names.
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True, slots=True)
class ResolvedModelMetadata:
    """Internal request adapter and conservative token-counting strategy."""

    adapter_id: str
    token_counter_id: str


def resolve_model_metadata(
    *,
    provider: str,
    base_url: str | None,
    model: str,
) -> ResolvedModelMetadata:
    return ResolvedModelMetadata(
        adapter_id=resolve_adapter_id(provider=provider, base_url=base_url),
        token_counter_id=resolve_token_counter_id(provider=provider, model=model),
    )


def resolve_adapter_id(*, provider: str, base_url: str | None) -> str:
    """Resolve a native or OpenAI-compatible request adapter."""

    provider_id = str(provider or "").strip().lower()
    if provider_id == "anthropic":
        return "anthropic"
    if provider_id == "openai":
        return "openai"

    host, port, normalized_url = _endpoint_parts(base_url)
    if "openrouter.ai" in host:
        return "openrouter"
    if "dashscope.aliyuncs.com" in host or "bailian" in host:
        return "bailian"
    if "siliconflow" in host:
        return "siliconflow"
    if "together.ai" in host or "together.xyz" in host:
        return "together"
    if "nvidia.com" in host:
        return "nvidia"
    if "minimax" in host:
        return "minimax"
    if "generativelanguage.googleapis.com" in host:
        return "gemini"
    if "deepseek.com" in host:
        return "deepseek"
    if any(
        marker in host
        for marker in (
            "moonshot.cn",
            "moonshot.ai",
            "xiaomimimo.com",
            "volces.com",
            "bytepluses.com",
        )
    ):
        return "thinking-type"
    if "ollama" in host or port == 11434 or "localhost:11434" in normalized_url:
        return "ollama"
    return "openai-compatible"


def resolve_token_counter_id(*, provider: str, model: str) -> str:
    """Use a known OpenAI tokenizer or a safe UTF-8 upper bound."""

    candidate = _openai_model_id(model)
    if not candidate:
        return "utf8_upper_bound"
    try:
        import tiktoken

        return str(tiktoken.encoding_for_model(candidate).name)
    except Exception:
        pass

    provider_id = str(provider or "").strip().lower()
    model_l = candidate.lower()
    if provider_id == "openai" or model_l.startswith(
        ("gpt-4o", "gpt-4.1", "gpt-5", "o1", "o3", "o4")
    ):
        return "o200k_base"
    return "utf8_upper_bound"


def openai_output_token_limit_field(*, adapter_id: str, model: str) -> str:
    """Return the OpenAI-chat field for a provider-neutral output limit."""

    adapter = str(adapter_id or "").strip().lower()
    model_l = _openai_model_id(model).lower()
    if adapter == "openai" and model_l.startswith(("gpt-5", "o1", "o3", "o4")):
        return "max_completion_tokens"
    return "max_tokens"


def _openai_model_id(model: str) -> str:
    value = str(model or "").strip()
    if value.lower().startswith("openai/"):
        return value.split("/", 1)[1]
    return value


def _endpoint_parts(base_url: str | None) -> tuple[str, int | None, str]:
    normalized = str(base_url or "").strip().lower().rstrip("/")
    if not normalized:
        return "", None, ""
    parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")
    try:
        port = parsed.port
    except ValueError:
        port = None
    return (parsed.hostname or "").lower(), port, normalized


__all__ = [
    "ResolvedModelMetadata",
    "openai_output_token_limit_field",
    "resolve_adapter_id",
    "resolve_model_metadata",
    "resolve_token_counter_id",
]
