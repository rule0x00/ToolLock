from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Verdict = Literal["SAFE_COSMETIC", "NEW_CAPABILITY", "SUSPICIOUS"]
Severity = Literal["low", "medium", "high"]

# Higher index = more severe. The final verdict is never less severe than the heuristic floor.
VERDICT_ORDER: tuple[Verdict, ...] = ("SAFE_COSMETIC", "NEW_CAPABILITY", "SUSPICIOUS")


class ReviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    server_id: str = Field(alias="serverId")
    tool_name: str = Field(alias="toolName")
    old_definition: dict[str, Any] | None = Field(alias="oldDefinition")
    new_definition: dict[str, Any] = Field(alias="newDefinition")


class ReviewResponse(BaseModel):
    verdict: Verdict
    risk: int = Field(ge=0, le=100)
    reasons: list[str]
    signals: list[str]


class Signal(BaseModel):
    code: str
    severity: Severity
    detail: str

    def __str__(self) -> str:
        return f"{self.code} ({self.severity}): {self.detail}"


class StructuralDiff(BaseModel):
    is_new_tool: bool = False
    name_changed: bool = False
    title_changed: bool = False
    description_changed: bool = False
    added_params: list[str] = []
    removed_params: list[str] = []
    changed_params: list[str] = []
    param_description_changes: list[str] = []
    required_added: list[str] = []
    required_removed: list[str] = []
    output_schema_changed: bool = False
    annotations_changed: bool = False

    def is_identical(self) -> bool:
        return not any(v for v in self.model_dump().values())


class HeuristicVerdict(BaseModel):
    verdict: Verdict
    risk: int = Field(ge=0, le=100)
    reasons: list[str]


class LlmVerdict(BaseModel):
    """Structured output the LLM must return."""

    verdict: Verdict = Field(description="SAFE_COSMETIC, NEW_CAPABILITY or SUSPICIOUS")
    risk: int = Field(ge=0, le=100, description="0 = harmless, 100 = clearly malicious")
    reasons: list[str] = Field(description="Short, concrete reasons for the verdict")
