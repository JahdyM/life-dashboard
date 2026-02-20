DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
DAY_TO_INDEX = {label: idx for idx, label in enumerate(DAY_LABELS)}

JAHDY_EMAIL = "jahdy.moreno@gmail.com"
GUILHERME_EMAIL = "guilherme.m.rods@gmail.com"
USER_PROFILES = {
    JAHDY_EMAIL: {
        "name": "Jahdy",
    },
    GUILHERME_EMAIL: {
        "name": "Guilherme",
    },
}
SHARED_USER_EMAILS = set(USER_PROFILES.keys())

HABITS = [
    ("bible_reading", "Bible reading"),
    ("bible_study", "Bible study"),
    ("dissertation_work", "Dissertation work"),
    ("workout", "Workout"),
    ("general_reading", "General reading (books)"),
    ("shower", "Shower"),
    ("daily_text", "Texto Diario"),
    ("meeting_attended", "Meeting attended"),
    ("prepare_meeting", "Prepare meeting"),
    ("family_worship", "Adoracao em familia"),
    ("writing", "Writing"),
    ("scientific_writing", "Scientific Writing"),
]
MEETING_HABIT_KEYS = {"meeting_attended", "prepare_meeting"}
FAMILY_WORSHIP_HABIT_KEYS = {"family_worship"}
FIXED_COUPLE_HABIT_KEYS = {
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
    "daily_text",
    "family_worship",
}
DEFAULT_HABIT_LABELS = {key: label for key, label in HABITS}
CUSTOMIZABLE_HABIT_KEYS = [
    key for key, _ in HABITS if key not in FIXED_COUPLE_HABIT_KEYS
]
CUSTOM_HABITS_SETTING_KEY = "custom_habits"
CUSTOM_HABIT_DONE_PREFIX = "custom_habit_done::"

ENTRY_DATA_COLUMNS = [h[0] for h in HABITS] + [
    "sleep_hours",
    "anxiety_level",
    "work_hours",
    "boredom_minutes",
    "mood_category",
    "priority_label",
    "priority_done",
]
ENTRY_COLUMNS = ["date"] + ENTRY_DATA_COLUMNS
ENTRIES_TABLE = "daily_entries_user"
LEGACY_ENTRIES_TABLE = "daily_entries"
TASKS_TABLE = "todo_tasks"
SUBTASKS_TABLE = "todo_subtasks"
CALENDAR_STATUS_TABLE = "calendar_event_status"
PROMPT_CARDS_TABLE = "partner_prompt_cards"
PROMPT_ANSWERS_TABLE = "partner_prompt_answers"
GOOGLE_TOKENS_TABLE = "google_calendar_tokens"

MOODS = ["Paz", "Felicidade", "Ansiedade", "Medo", "Raiva", "Neutro"]
MOOD_COLORS = {
    "Paz": "#3772A6",
    "Felicidade": "#8FB6D9",
    "Ansiedade": "#D6D979",
    "Medo": "#D9C979",
    "Raiva": "#D95252",
    "Neutro": "#B8B8B8",
}
MOOD_TO_INT = {m: i for i, m in enumerate(MOODS)}

PRIORITY_TAGS = ["High", "Medium", "Low"]
PRIORITY_META = {
    "High": {"weight": 3, "color": "#D95252"},
    "Medium": {"weight": 2, "color": "#D9C979"},
    "Low": {"weight": 1, "color": "#8FB6D9"},
}

PINTEREST_MOOD_LINKS = [
    "https://pin.it/663z0YrI0",
    "https://pin.it/6X1bivk29",
    "https://pin.it/72wKVio1I",
    "https://pin.it/3NXG9cSQ4",
    "https://pin.it/DPWzlzuoR",
    "https://pin.it/1719yUkPi",
    "https://pin.it/3F61d82Z0",
]
