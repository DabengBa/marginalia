"""Provider-agnostic LLM abstraction (OpenAI + Anthropic in V1).

Public API:
  - get_chat_client(profile) → ChatClient
  - get_audio_client()       → AudioClient (audio profile only, OpenAI)
  - ChatRequest / ChatResponse / ChatMessage / ToolDef / ToolCall ...
"""
from marginalia.llm.base import AudioClient, ChatClient
from marginalia.llm.factory import (
    get_audio_client,
    get_chat_client,
    reset_clients_cache,
)
from marginalia.llm.model_registry import (
    ResolvedModelMetadata,
    resolve_adapter_id,
    resolve_model_metadata,
    resolve_token_counter_id,
)
from marginalia.llm.prompt_cache import (
    CACHE_PREFIX_ACK,
    PromptPrefixObservation,
    PromptPrefixTracker,
    PromptPrefixViolation,
    cacheable_prefix_messages,
    cacheable_prompt_messages,
    canonical_prompt_fingerprint,
    serialize_chat_message,
)
from marginalia.llm.types import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ContentBlock,
    ImageBlock,
    StopReason,
    TextBlock,
    TokenUsage,
    ToolCall,
    ToolDef,
    ToolResultBlock,
    ToolUseBlock,
)

__all__ = [
    "AudioClient",
    "ChatClient",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "ContentBlock",
    "CACHE_PREFIX_ACK",
    "PromptPrefixObservation",
    "PromptPrefixTracker",
    "PromptPrefixViolation",
    "ResolvedModelMetadata",
    "ImageBlock",
    "StopReason",
    "TextBlock",
    "TokenUsage",
    "ToolCall",
    "ToolDef",
    "ToolResultBlock",
    "ToolUseBlock",
    "cacheable_prefix_messages",
    "cacheable_prompt_messages",
    "canonical_prompt_fingerprint",
    "get_audio_client",
    "get_chat_client",
    "reset_clients_cache",
    "resolve_adapter_id",
    "resolve_model_metadata",
    "resolve_token_counter_id",
    "serialize_chat_message",
]
