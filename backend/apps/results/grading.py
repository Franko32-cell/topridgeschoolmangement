"""
apps/results/grading.py
Centralized grading logic for the school system.
"""

def detect_grade_level(school_class):
    """
    Determines if a class is 'nursery', 'primary', or 'basic_7_9' (JHS).
    Used to select the correct grading scale.
    """
    if not school_class:
        return "primary"
    name = school_class.name.lower()
    if "jhs" in name or "basic 7" in name or "basic 8" in name or "basic 9" in name:
        return "basic_7_9"
    elif "nursery" in name or "kg" in name:
        return "nursery"
    return "primary"

def get_grade_and_remark(score, level):
    """
    Returns (Grade, Remark) based on score and school level.
    """
    score = float(score or 0)
    
    # Example logic for Basic 7-9 (JHS)
    if level == "basic_7_9":
        if score >= 80: return ("A", "Excellent")
        if score >= 70: return ("B", "Very Good")
        if score >= 60: return ("C", "Good")
        if score >= 50: return ("D", "Credit")
        return ("E", "Fail")
    
    # Default/Primary logic
    if score >= 80: return ("1", "Excellent")
    if score >= 70: return ("2", "Very Good")
    # ... add the rest of your school's specific scale
    return ("4", "Pass")

def get_overall_grade(average, level):
    """Calculates final grade based on the average score."""
    grade, _ = get_grade_and_remark(average, level)
    return grade

def fmt_position(pos):
    """Converts 1 to 1st, 2 to 2nd, etc."""
    if pos is None: return "—"
    suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(pos % 10 if pos % 100 not in [11, 12, 13] else 0, 'th')
    return f"{pos}{suffix}"

def get_thresholds(level):
    """Returns the full grading scale for UI/Legend purposes."""
    # Useful if you want to display the 'Grade Key' on the report card
    return {}
