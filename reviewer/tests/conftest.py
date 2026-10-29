import copy

import pytest

CLEAN = {
    "name": "send_email",
    "description": "Send an email to a recipient.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Subject line"},
            "body": {"type": "string", "description": "Plain-text body"},
        },
        "required": ["to", "subject", "body"],
    },
}


@pytest.fixture
def clean() -> dict:
    return copy.deepcopy(CLEAN)


@pytest.fixture(autouse=True)
def no_llm_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never call a real LLM."""
    for var in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(var, raising=False)
