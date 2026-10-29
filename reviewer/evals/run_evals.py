"""Runs the reviewer graph over labelled fixtures and reports how it did.

Usage: python evals/run_evals.py [--no-llm]

Prints accuracy, a confusion matrix and the false negatives (SUSPICIOUS judged SAFE_COSMETIC,
the worst possible error). Exits 1 if there is a false negative on any fixture not marked
"known_gap".
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.graph import default_chat_model, review  # noqa: E402
from app.models import VERDICT_ORDER, ReviewRequest  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
SHORT = {"SAFE_COSMETIC": "SAFE", "NEW_CAPABILITY": "NEW_CAP", "SUSPICIOUS": "SUSP"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-llm", action="store_true", help="deterministic rules only, even if an API key is set")
    args = parser.parse_args()

    llm = None if args.no_llm else default_chat_model()
    mode = "heuristics only" if llm is None else f"heuristics + LLM ({type(llm).__name__})"
    fixtures = [json.loads(p.read_text()) for p in sorted(FIXTURES.glob("*.json"))]

    results = []
    for f in fixtures:
        req = ReviewRequest(serverId=f["serverId"], toolName=f["toolName"], oldDefinition=f["oldDefinition"], newDefinition=f["newDefinition"])
        got = review(req, llm)
        results.append((f, got))

    matrix = {e: {g: 0 for g in VERDICT_ORDER} for e in VERDICT_ORDER}
    for f, got in results:
        matrix[f["expected"]][got.verdict] += 1
    correct = sum(matrix[v][v] for v in VERDICT_ORDER)

    print(f"Mode: {mode}")
    print(f"Fixtures: {len(results)}   Accuracy: {correct}/{len(results)} = {correct / len(results):.0%}\n")
    print("Confusion matrix (rows = expected, columns = got)")
    print(f"{'':>10}" + "".join(f"{SHORT[g]:>9}" for g in VERDICT_ORDER))
    for e in VERDICT_ORDER:
        print(f"{SHORT[e]:>10}" + "".join(f"{matrix[e][g]:>9}" for g in VERDICT_ORDER))

    false_negatives = [(f, g) for f, g in results if f["expected"] == "SUSPICIOUS" and g.verdict == "SAFE_COSMETIC"]
    blocking = [(f, g) for f, g in false_negatives if not f.get("known_gap")]
    print(f"\nFalse negatives (SUSPICIOUS judged SAFE_COSMETIC): {len(false_negatives)}")
    for f, g in false_negatives:
        tag = " [known gap]" if f.get("known_gap") else ""
        print(f"  - {f['name']}{tag}: {f['note']}")

    other = [(f, g) for f, g in results if f["expected"] != g.verdict and (f, g) not in false_negatives]
    if other:
        print("\nOther misclassifications:")
        for f, g in other:
            direction = "stricter" if VERDICT_ORDER.index(g.verdict) > VERDICT_ORDER.index(f["expected"]) else "looser"
            print(f"  - {f['name']}: expected {f['expected']}, got {g.verdict} ({direction})")

    if blocking:
        print(f"\nFAIL: {len(blocking)} false negative(s) outside the known gaps.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
