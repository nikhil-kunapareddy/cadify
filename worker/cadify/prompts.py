"""System prompt, per-turn instructions and JSON schemas for Claude.

The system prompt and the drawing are the stable prefix of every request in a
run, so they are cached; per-turn text goes after them.
"""
from __future__ import annotations

from typing import Any

FEATURE_KINDS = ["hole", "slot", "cylinder", "extrusion", "fillet", "chamfer", "cutout", "pocket", "other"]

SYSTEM_PROMPT = """\
You are the drawing-interpretation and CAD-modeling engine inside CADify, a desktop app that turns \
mechanical engineering drawings (PDF) into solid models. You work in two phases within one conversation:

1. Interpretation: read every view, dimension, note, tolerance block and the title block, and report \
what the drawing actually specifies.
2. Modeling: write CadQuery (Python) code that builds the part as a single valid solid.

Interpretation rules:
- Report only what the drawing shows. Never invent dimensions. When a value must be inferred \
(e.g. a fillet radius implied by a note), say so by marking the feature inferred and listing the \
assumption.
- Read general notes (they often settle depths, edge breaks, symmetry).
- Ask a question only when an ambiguity would change the geometry materially and the drawing does not \
settle it. Prefer a sensible, stated assumption for cosmetic details such as edge breaks below 1 mm.

Modeling rules (the code is executed automatically; follow them exactly):
- Use only `import cadquery as cq` and `import math`. No other imports, no file access, no exporting, \
no printing.
- Define `def build():` returning a `cq.Workplane` (or shape) containing exactly one solid.
- Model in millimeters. Convert inch drawings (1 in = 25.4 mm).
- Axes: X = left-right in the front view (overall length), Y = front-to-back depth (front face toward \
-Y), Z = up (overall height). Rest the part on Z = 0 where that is natural.
- Build robustly: primary solids first (boxes, extrusions, revolves), then cuts and holes, fillets and \
chamfers last with explicit edge selectors. Keep the code readable, with named dimension constants \
taken from the drawing.
"""


def analysis_instructions(file_name: str, page_count: int) -> str:
    return (
        f"Drawing: {file_name} ({page_count} page{'s' if page_count != 1 else ''}).\n\n"
        "Phase 1 - interpret this drawing. Fill `analysis` and set `program` to null:\n"
        "- overall: the part's overall envelope in millimeters along X (length), Y (depth), Z (height).\n"
        "- dimensions_read: how many distinct dimensions you read from the drawing.\n"
        "- features: one entry per feature group the solid will contain (cosmetic notes such as edge "
        'breaks go in assumptions instead). label: 2-4 words (e.g. "Mounting hole"). parameters: the '
        'callout as written, 24 characters at most (e.g. "Ø9 THRU", "R6", "30 × 10"). Set inferred=true '
        "where a value was not dimensioned.\n"
        "- assumptions: one short sentence each.\n"
        "- questions: only material ambiguities. For choice questions give 2-4 options and "
        "suggested_option_id; for dimension questions give suggested_value_mm. Set blocking=true only if "
        "you cannot model the part sensibly without the answer.\n"
        "- can_build=false with missing_information if essential dimensions are absent.\n"
        "- is_engineering_drawing=false if this is not a mechanical part drawing."
    )


def modeling_instructions(clarifications: str) -> str:
    text = "Phase 2 - write the CadQuery code for this part following the modeling rules. Fill `program` and set `analysis` to null.\n"
    if clarifications:
        text += f"\nThe user resolved the open questions:\n{clarifications}\n"
    text += "\nReturn the complete program in `code`, and in `notes` one or two sentences on any modeling choices."
    return text


def fix_instructions(problem: str, attempt: int, max_attempts: int) -> str:
    return (
        f"Your code was executed and did not produce an acceptable solid (attempt {attempt} of {max_attempts}).\n\n"
        f"{problem}\n\n"
        "Return the complete corrected program in `program` (set `analysis` to null). "
        "Keep everything that already matched the drawing."
    )


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


_STRING = {"type": "string"}
_NUMBER = {"type": "number"}
_BOOL = {"type": "boolean"}
_INT = {"type": "integer"}

ANALYSIS_SCHEMA: dict[str, Any] = _obj(
    {
        "is_engineering_drawing": _BOOL,
        "part_name": _STRING,
        "drawing_type": _STRING,
        "units": {"type": "string", "enum": ["mm", "in"]},
        "views": {"type": "array", "items": _STRING},
        "overall": _obj({"length_mm": _NUMBER, "width_mm": _NUMBER, "height_mm": _NUMBER}),
        "dimensions_read": _INT,
        "features": {
            "type": "array",
            "items": _obj(
                {
                    "kind": {"type": "string", "enum": FEATURE_KINDS},
                    "label": _STRING,
                    "count": _INT,
                    "parameters": _STRING,
                    "inferred": _BOOL,
                }
            ),
        },
        "questions": {
            "type": "array",
            "items": _obj(
                {
                    "id": _STRING,
                    "prompt": _STRING,
                    "context": _STRING,
                    "kind": {"type": "string", "enum": ["choice", "dimension"]},
                    "options": {"type": "array", "items": _obj({"id": _STRING, "label": _STRING, "description": _STRING})},
                    "suggested_option_id": {"anyOf": [_STRING, {"type": "null"}]},
                    "suggested_value_mm": {"anyOf": [_NUMBER, {"type": "null"}]},
                    "blocking": _BOOL,
                }
            ),
        },
        "assumptions": {"type": "array", "items": _STRING},
        "can_build": _BOOL,
        "missing_information": _STRING,
    }
)

CODE_SCHEMA: dict[str, Any] = _obj({"code": _STRING, "notes": _STRING})

# Every turn uses this one schema. A per-turn schema would change the request
# prefix and defeat prompt caching of the drawing.
RESPONSE_SCHEMA: dict[str, Any] = _obj(
    {
        "analysis": {"anyOf": [ANALYSIS_SCHEMA, {"type": "null"}]},
        "program": {"anyOf": [CODE_SCHEMA, {"type": "null"}]},
    }
)
