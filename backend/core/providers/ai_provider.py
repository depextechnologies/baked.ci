"""AI provider abstraction. EmergentLlmProvider wraps emergentintegrations LlmChat with Claude Sonnet 4.6."""
from __future__ import annotations
import os
import logging
from abc import ABC, abstractmethod
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


class AiProvider(ABC):
    @abstractmethod
    async def complete(self, system: str, user: str, session_id: str) -> str: ...


class EmergentLlmProvider(AiProvider):
    """Claude Sonnet 4.6 via Emergent Universal LLM Key."""

    def __init__(self, model: str = "claude-sonnet-4-6", provider: str = "anthropic"):
        self.model = model
        self.provider = provider

    async def complete(self, system: str, user: str, session_id: str) -> str:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system,
        ).with_model(self.provider, self.model)
        response = await chat.send_message(UserMessage(text=user))
        # emergentintegrations returns a string for send_message
        return response if isinstance(response, str) else str(response)


def get_ai_provider() -> AiProvider:
    return EmergentLlmProvider()
