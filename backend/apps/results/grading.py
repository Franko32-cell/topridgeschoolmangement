"""
apps/results/grading.py

Canonical grading logic for Top Ridge School.
Derived from actual printed report cards (Term 2, 2026).

Grade levels
────────────
basic_7_9   → numeric grades (1–9)   — Basic 7, 8, 9
basic_1_6   → letter grades (A–E2)   — Basic 1–6, KG 1–2, Kindergold
montessori  → rubric grades (MO/O/S/NA) — Montessori / Nursery

Confirmed from printed cards:
  Basic 7 (Ohemaa):    40–44 → grade "6" (Lower)  [NOT "8" — the PDF confirms this]
  Basic 3 (Janet):     letter grades A/B1 … E2
  KG 2    (Thywords):  letter grades A/B1 … E2
  Montessori:          MO / O / S / NA (non-numeric rubric)
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Grade level detection
# ---------------------------------------------------------------------------

_B79_MARKERS = ("basic 7", "basic 8", "basic 9", "b7", "b8", "b9",
                "jhs 1", "jhs 2", "jhs 3")

_MONTESSORI_MARKERS = ("montessori", "nursery", "creche", "toddler",
                       "playgroup", "play group")

# KG and Basic 1–6 both use the letter-grade scale; no extra marker needed —
# anything not matched by the above two falls through to basic_1_6.


def detect_grade_level(school_class) -> str:
    """
    Return one of: 'basic_7_9' | 'basic_1_6' | 'montessori'.
    Accepts a SchoolClass instance or None.
    """
    if not school_class:
        return "basic_1_6"
    name = school_class.name.lower()
    for marker in _MONTESSORI_MARKERS:
        if marker in name:
            return "montessori"
    for marker in _B79_MARKERS:
        if marker in name:
            return "basic_7_9"
    return "basic_1_6"


# ---------------------------------------------------------------------------
# Grade tables  (confirmed against printed cards)
# ---------------------------------------------------------------------------

# Basic 7–9: numeric grades.
# NOTE: 40–44 maps to grade "6" (Lower) — confirmed from Ohemaa's card grading key.
_GRADES_B79 = [
    (90, "1", "Excellent"),
    (80, "2", "Very Good"),
    (70, "3", "Good"),
    (60, "4", "High Average"),
    (55, "5", "Average"),
    (50, "6", "Low Average"),
    (45, "7", "Low"),
    (40, "6", "Lower"),    # ← confirmed from printed card: "40–44  6  Lower"
    (0,  "9", "Lowest"),
]

# Basic 1–6, KG, Kindergold: letter grades.
_GRADES_B16 = [
    (90, "A",  "Excellent"),
    (80, "B1", "Very Good"),
    (70, "B2", "Good"),
    (60, "C1", "High Average"),
    (55, "C2", "Average"),
    (50, "D1", "Low Average"),
    (45, "D2", "Low"),
    (40, "E1", "Lower"),
    (0,  "E2", "Lowest"),
]

# Montessori / Nursery: rubric grades (non-numeric, teacher-assessed).
# These are not computed from scores; they are entered directly as strings.
MONTESSORI_GRADES = ["MO", "O", "S", "NA"]
MONTESSORI_LABELS = {
    "MO": "Most Often",
    "O":  "Often",
    "S":  "Sometimes",
    "NA": "Needs Assistance",
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_grade_and_remark(score: float, level: str) -> tuple[str, str]:
    """Return (grade, remark) for a numeric score and grade level."""
    if level == "montessori":
        # Montessori grades are not score-derived; return neutral placeholder.
        return "—", "—"
    table = _GRADES_B79 if level == "basic_7_9" else _GRADES_B16
    for threshold, grade, remark in table:
        if score >= threshold:
            return grade, remark
    return table[-1][1], table[-1][2]


def get_overall_grade(average: float, level: str) -> str:
    """Return just the grade string for the overall average."""
    grade, _ = get_grade_and_remark(average, level)
    return grade


def get_thresholds(level: str) -> list[dict]:
    """Return the full grade table as a list of dicts (for API/frontend use)."""
    if level == "montessori":
        return [{"threshold": None, "grade": g, "remark": MONTESSORI_LABELS[g]}
                for g in MONTESSORI_GRADES]
    table = _GRADES_B79 if level == "basic_7_9" else _GRADES_B16
    return [{"threshold": t, "grade": g, "remark": r} for t, g, r in table]


def fmt_position(position: int | None) -> str | None:
    """Format an integer position as an ordinal string (1st, 2nd, 3rd…)."""
    if position is None:
        return None
    n = int(position)
    mod100 = n % 100
    mod10  = n % 10
    if mod100 in (11, 12, 13):
        suffix = "th"
    elif mod10 == 1:
        suffix = "st"
    elif mod10 == 2:
        suffix = "nd"
    elif mod10 == 3:
        suffix = "rd"
    else:
        suffix = "th"
    return f"{n}{suffix}"