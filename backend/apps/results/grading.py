"""
apps/results/grading.py
Centralized grading logic parsed directly from Top Ridge School report cards.
"""

def detect_grade_level(school_class) -> str:
    """
    Determines the grading tier based on the class name.
    Supported tiers: 'nursery', 'primary', or 'basic_7_9'.
    """
    if not school_class:
        return "primary"
        
    name = school_class.name.strip().upper()
    
    # JHS / Basic 7-9 Check
    if any(x in name for x in ["JHS", "BASIC 7", "BASIC 8", "BASIC 9", "SEVEN", "EIGHT", "NINE"]):
        return "basic_7_9"
        
    # Nursery / KG Check
    if any(x in name for x in ["NURSERY", "KG", "KINDERGOLD", "KINDERGARTEN"]):
        return "nursery"
        
    # Default fallback for Basic 1 to 6
    return "primary"


def get_grade_and_remark(score: float, level: str) -> tuple[str, str]:
    """
    Returns a (Grade, Remark) tuple based on the raw score and school tier.
    """
    score = round(float(score or 0), 2)
    
    # ─── TIER 1: JHS / BASIC 7-9 (Uses Numeric Grades 1-9) ───────────────────
    if level == "basic_7_9":
        if 90.00 <= score <= 100.00: return ("1", "EXCELLENT")
        if 80.00 <= score < 90.00:   return ("2", "VERY GOOD")
        if 70.00 <= score < 80.00:   return ("3", "GOOD")
        if 60.00 <= score < 70.00:   return ("4", "HIGH AVERAGE")
        if 55.00 <= score < 60.00:   return ("5", "AVERAGE")
        if 50.00 <= score < 55.00:   return ("6", "LOW AVERAGE")
        if 45.00 <= score < 50.00:   return ("7", "LOW")
        if 40.00 <= score < 45.00:   return ("8", "LOWER")
        return ("9", "LOWEST")

    # ─── TIER 2: PRIMARY (Basic 1-6) (Uses Alphabetical Grades with Subdivisions) ───
    elif level == "primary":
        if 90.00 <= score <= 100.00: return ("A", "EXCELLENT")
        if 80.00 <= score < 90.00:   return ("B1", "VERY GOOD")
        if 70.00 <= score < 80.00:   return ("B2", "GOOD")
        if 60.00 <= score < 70.00:   return ("C1", "HIGH AVERAGE")
        if 55.00 <= score < 60.00:   return ("C2", "AVERAGE")
        if 50.00 <= score < 55.00:   return ("D1", "LOW AVERAGE")
        if 45.00 <= score < 50.00:   return ("D2", "LOW")
        if 40.00 <= score < 45.00:   return ("E1", "LOWER")
        return ("E2", "LOWEST")

    # ─── TIER 3: NURSERY / KG (Matches Primary Structure but adapted to early development) ───
    else:
        if 90.00 <= score <= 100.00: return ("A", "EXCELLENT")
        if 80.00 <= score < 90.00:   return ("B1", "VERY GOOD")
        if 70.00 <= score < 80.00:   return ("B2", "GOOD")
        if 60.00 <= score < 70.00:   return ("C1", "HIGH AVERAGE")
        if 55.00 <= score < 60.00:   return ("C2", "AVERAGE")
        if 50.00 <= score < 55.00:   return ("D1", "LOW AVERAGE")
        if 44.00 <= score < 50.00:   return ("D2", "LOW")
        if 40.00 <= score < 44.00:   return ("E1", "LOWER")
        return ("E2", "LOWEST")


def get_overall_grade(average: float, level: str) -> str:
    """
    Determines the overall letter/number grade calculated from a student's average.
    """
    grade, _ = get_grade_and_remark(average, level)
    return grade


def fmt_position(pos: int | None) -> str:
    """
    Appends the proper ordinal suffix (st, nd, rd, th) to a placement rank.
    """
    if pos is None:
        return "—"
    if 11 <= (pos % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(pos % 10, "th")
    return f"{pos}{suffix}"


def get_thresholds(level: str) -> list[dict[str, str]]:
    """
    Returns a programmatic breakdown of the threshold dictionary array map.
    Useful for generating report card UI legends automatically.
    """
    scales = {
        "basic_7_9": [
            {"range": "90-100", "grade": "1", "remark": "Excellent"},
            {"range": "80-89",  "grade": "2", "remark": "V. Good"},
            {"range": "70-79",  "grade": "3", "remark": "Good"},
            {"range": "60-69",  "grade": "4", "remark": "High Average"},
            {"range": "55-59",  "grade": "5", "remark": "Average"},
            {"range": "50-54",  "grade": "6", "remark": "Low Average"},
            {"range": "45-49",  "grade": "7", "remark": "Low"},
            {"range": "40-44",  "grade": "8", "remark": "Lower"},
            {"range": "0-39",   "grade": "9", "remark": "Lowest"},
        ],
        "primary": [
            {"range": "90-100", "grade": "A",  "remark": "Excellent"},
            {"range": "80-89",  "grade": "B1", "remark": "V. Good"},
            {"range": "70-79",  "grade": "B2", "remark": "Good"},
            {"range": "60-69",  "grade": "C1", "remark": "High Average"},
            {"range": "55-59",  "grade": "C2", "remark": "Average"},
            {"range": "50-54",  "grade": "D1", "remark": "Low Average"},
            {"range": "45-49",  "grade": "D2", "remark": "Low"},
            {"range": "40-44",  "grade": "E1", "remark": "Lower"},
            {"range": "0-39",   "grade": "E2", "remark": "Lowest"},
        ]
    }
    return scales.get(level, scales["primary"])
