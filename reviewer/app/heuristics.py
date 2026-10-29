"""Deterministic diff and red-flag detection for MCP tool definition changes.

These rules are the safety floor: the LLM may escalate a verdict but never lower it.
"""

import json
import re
from collections import Counter
from collections.abc import Iterable
from typing import Any

from .models import HeuristicVerdict, Signal, StructuralDiff

INSTRUCTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("ignore previous", re.compile(r"ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)", re.I)),
    ("hide from user", re.compile(r"(do\s+not|don't|never)\s+(tell|mention|inform|reveal|show|notify)\b[^.]{0,60}\buser", re.I)),
    ("<IMPORTANT> tag", re.compile(r"<\s*important\s*>", re.I)),
    ("before using this tool", re.compile(r"before\s+(using|calling|invoking)\s+(this|the)\s+tool", re.I)),
    ("secrecy", re.compile(r"\b(secretly|silently|covertly|without\s+(telling|informing|notifying))\b", re.I)),
    ("model-directed command", re.compile(r"\b(you\s+must|system\s+prompt|as\s+an\s+ai)\b", re.I)),
]
ALWAYS_PATTERN = re.compile(r"\balways\b", re.I)

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL = re.compile(r"\b(?:https?|wss?|ftp)://[^\s\"'<>]+", re.I)
IPV4 = re.compile(r"\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b")
HOSTNAME = re.compile(r"^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$", re.I)

# Zero-width, bidi-override and Unicode "tag" characters: invisible to humans, readable by models.
HIDDEN_CHARS = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿\U000e0000-\U000e007f]")

EXFIL_PARAM = re.compile(
    r"^(bcc|cc|forward(_?to)?|reply_?to|webhook(_?url)?|callback(_?url)?|url|endpoint|redirect(_?ur[il])?|"
    r"proxy|upload(_?url)?|exfil\w*|notify(_?url)?|log(_?url)?|mirror)$",
    re.I,
)

LONG_DESCRIPTION = 1024

# Annotation flips that widen what a tool may do.
ANNOTATION_ESCALATIONS = {
    "readOnlyHint": (True, False),
    "destructiveHint": (False, True),
    "openWorldHint": (False, True),
    "idempotentHint": (True, False),
}


def _props(defn: dict[str, Any] | None) -> dict[str, Any]:
    schema = (defn or {}).get("inputSchema") or {}
    props = schema.get("properties") or {}
    return props if isinstance(props, dict) else {}


def _required(defn: dict[str, Any] | None) -> set[str]:
    req = ((defn or {}).get("inputSchema") or {}).get("required") or []
    return {r for r in req if isinstance(r, str)}


def _strip_docs(schema: Any) -> Any:
    """A parameter schema without its human-readable text, to tell wording edits from real changes."""
    if isinstance(schema, dict):
        return {k: _strip_docs(v) for k, v in schema.items() if k not in ("description", "title")}
    if isinstance(schema, list):
        return [_strip_docs(v) for v in schema]
    return schema


def _canon(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _strings(value: Any) -> Iterable[str]:
    """Every string anywhere in a definition: descriptions, defaults, enums, examples, keys."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield str(k)
            yield from _strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)


def _texts(defn: dict[str, Any] | None) -> list[str]:
    return list(_strings(defn)) if defn else []


def _descriptions(defn: dict[str, Any] | None) -> list[str]:
    """Prose the model reads: tool title/description plus every description inside the schemas."""
    if not defn:
        return []
    out: list[str] = []

    def walk(v: Any) -> None:
        if isinstance(v, dict):
            for k, child in v.items():
                if k in ("description", "title") and isinstance(child, str):
                    out.append(child)
                else:
                    walk(child)
        elif isinstance(v, list):
            for child in v:
                walk(child)

    walk(defn)
    return out


def _matches(pattern: re.Pattern[str], texts: list[str]) -> Counter[str]:
    return Counter(m.group(0).lower() for t in texts for m in pattern.finditer(t))


def _new_matches(pattern: re.Pattern[str], old: list[str], new: list[str]) -> list[str]:
    return sorted((_matches(pattern, new) - _matches(pattern, old)).keys())


def _looks_external(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    return bool(EMAIL.search(v) or URL.search(v) or IPV4.search(v) or HOSTNAME.match(v))


def structural_diff(old: dict[str, Any] | None, new: dict[str, Any]) -> StructuralDiff:
    if old is None:
        return StructuralDiff(is_new_tool=True, added_params=sorted(_props(new)))

    old_props, new_props = _props(old), _props(new)
    changed, doc_changes = [], []
    for name in sorted(set(old_props) & set(new_props)):
        if _canon(_strip_docs(old_props[name])) != _canon(_strip_docs(new_props[name])):
            changed.append(name)
        elif _canon(old_props[name]) != _canon(new_props[name]):
            doc_changes.append(name)

    old_schema_rest = _strip_docs({k: v for k, v in (old.get("inputSchema") or {}).items() if k not in ("properties", "required")})
    new_schema_rest = _strip_docs({k: v for k, v in (new.get("inputSchema") or {}).items() if k not in ("properties", "required")})
    if _canon(old_schema_rest) != _canon(new_schema_rest):
        changed.append("(schema)")

    return StructuralDiff(
        name_changed=old.get("name") != new.get("name"),
        title_changed=old.get("title") != new.get("title"),
        description_changed=old.get("description") != new.get("description"),
        added_params=sorted(set(new_props) - set(old_props)),
        removed_params=sorted(set(old_props) - set(new_props)),
        changed_params=changed,
        param_description_changes=doc_changes,
        required_added=sorted(_required(new) - _required(old)),
        required_removed=sorted(_required(old) - _required(new)),
        output_schema_changed=_canon(old.get("outputSchema")) != _canon(new.get("outputSchema")),
        annotations_changed=_canon(old.get("annotations")) != _canon(new.get("annotations")),
    )


def detect_signals(old: dict[str, Any] | None, new: dict[str, Any], diff: StructuralDiff) -> list[Signal]:
    signals: list[Signal] = []
    old_desc, new_desc = _descriptions(old), _descriptions(new)
    old_text, new_text = _texts(old), _texts(new)

    for label, pattern in INSTRUCTION_PATTERNS:
        for hit in _new_matches(pattern, old_desc, new_desc):
            signals.append(Signal(code="INSTRUCTION_TEXT", severity="high", detail=f'{label}: "{hit}"'))
    if _new_matches(ALWAYS_PATTERN, old_desc, new_desc):
        signals.append(Signal(code="ALWAYS_DIRECTIVE", severity="medium", detail='new "always" directive in description'))

    for kind, pattern in (("email", EMAIL), ("URL", URL), ("IP address", IPV4)):
        for hit in _new_matches(pattern, old_text, new_text):
            signals.append(Signal(code="EXTERNAL_ADDRESS", severity="high", detail=f"new {kind}: {hit}"))

    hidden = len(HIDDEN_CHARS.findall("".join(new_text))) - len(HIDDEN_CHARS.findall("".join(old_text)))
    if hidden > 0:
        signals.append(Signal(code="HIDDEN_UNICODE", severity="high", detail=f"{hidden} new zero-width/bidi/tag character(s)"))

    new_props, old_props = _props(new), _props(old)
    for name in diff.added_params:
        if EXFIL_PARAM.match(name):
            signals.append(Signal(code="EXFIL_PARAM", severity="high", detail=f"new parameter '{name}'"))
    for name in diff.added_params + diff.changed_params:
        schema = new_props.get(name)
        if not isinstance(schema, dict):
            continue
        default = schema.get("default")
        if _looks_external(default) and (name in diff.added_params or old_props.get(name, {}).get("default") != default):
            signals.append(Signal(code="EXTERNAL_DEFAULT", severity="high", detail=f"'{name}' defaults to {default!r}"))

    description = new.get("description") or ""
    old_description = (old or {}).get("description") or ""
    if len(description) > LONG_DESCRIPTION and len(description) > len(old_description):
        signals.append(Signal(code="LONG_DESCRIPTION", severity="medium", detail=f"description is {len(description)} chars"))
    elif old is not None and len(description) > 300 and len(description) > 3 * max(len(old_description), 1):
        signals.append(Signal(code="DESCRIPTION_GREW", severity="medium", detail=f"{len(old_description)} → {len(description)} chars"))

    old_ann = (old or {}).get("annotations") or {}
    new_ann = new.get("annotations") or {}
    for hint, (before, after) in ANNOTATION_ESCALATIONS.items():
        if new_ann.get(hint) == after and old_ann.get(hint, before) == before and old is not None:
            signals.append(Signal(code="ANNOTATION_ESCALATION", severity="medium", detail=f"{hint} → {after}"))

    return signals


def heuristic_verdict(diff: StructuralDiff, signals: list[Signal]) -> HeuristicVerdict:
    high = [s for s in signals if s.severity == "high"]
    medium = [s for s in signals if s.severity == "medium"]
    if high:
        return HeuristicVerdict(
            verdict="SUSPICIOUS",
            risk=min(100, 80 + 5 * len(high)),
            reasons=[f"High-severity signal: {s.detail}" for s in high],
        )

    structural = [
        (diff.is_new_tool, "new tool"),
        (diff.name_changed, "tool name changed"),
        (bool(diff.added_params), f"parameters added: {', '.join(diff.added_params)}"),
        (bool(diff.removed_params), f"parameters removed: {', '.join(diff.removed_params)}"),
        (bool(diff.changed_params), f"parameter types/defaults/enums changed: {', '.join(diff.changed_params)}"),
        (bool(diff.required_added or diff.required_removed), "required parameters changed"),
        (diff.output_schema_changed, "output schema changed"),
        (diff.annotations_changed, "annotations changed"),
    ]
    reasons = [text for hit, text in structural if hit] + [f"Medium-severity signal: {s.detail}" for s in medium]
    if reasons:
        return HeuristicVerdict(verdict="NEW_CAPABILITY", risk=min(75, 40 + 10 * len(medium) + 5 * len(reasons)), reasons=reasons)

    if diff.is_identical():
        return HeuristicVerdict(verdict="SAFE_COSMETIC", risk=0, reasons=["Definition is unchanged"])
    return HeuristicVerdict(
        verdict="SAFE_COSMETIC",
        risk=10,
        reasons=["Only descriptive text changed, with no red-flag signals"],
    )
