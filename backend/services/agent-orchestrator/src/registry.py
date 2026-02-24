"""
Tool Registry Self-Registration
================================
On startup, the agent orchestrator registers all its tools in the
Tool Registry service (port 3009). This gives admins visibility into
which tools are available and allows enabling/disabling them without
code changes.

Non-fatal: if the Tool Registry is down, startup continues normally.
"""

import os
import httpx

TOOL_REGISTRY_SVC = os.getenv("TOOL_REGISTRY_URL",          "http://localhost:3009")
COURSE_SVC        = os.getenv("COURSE_SERVICE_URL",          "http://localhost:3002")
QUIZ_SVC          = os.getenv("QUIZ_SERVICE_URL",            "http://localhost:3004")
BADGE_SVC         = os.getenv("BADGE_SERVICE_URL",           "http://localhost:3005")
NOTIFY_SVC        = os.getenv("NOTIFICATION_SERVICE_URL",    "http://localhost:3007")
USER_SVC          = os.getenv("USER_SERVICE_URL",            "http://localhost:3001")
CONTENT_SVC       = os.getenv("CONTENT_SERVICE_URL",         "http://localhost:3003")

TOOL_DEFINITIONS = [
    {
        "name":         "create_course",
        "display_name": "Create Course",
        "description":  "Creates a new LMS course draft (title, description, skill tags)",
        "endpoint":     f"{COURSE_SVC}/courses",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "add_module",
        "display_name": "Add Module",
        "description":  "Adds a lesson module to an existing course",
        "endpoint":     f"{COURSE_SVC}/courses/:id/modules",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "publish_course",
        "display_name": "Publish Course",
        "description":  "Changes course status from draft to published",
        "endpoint":     f"{COURSE_SVC}/courses/:id/publish",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "get_course",
        "display_name": "Get Course Details",
        "description":  "Fetches course title and module list by ID",
        "endpoint":     f"{COURSE_SVC}/courses/:id",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "list_courses",
        "display_name": "List Org Courses",
        "description":  "Lists recent courses in the organization",
        "endpoint":     f"{COURSE_SVC}/courses",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "generate_quiz",
        "display_name": "Generate Quiz Questions",
        "description":  "AI-generates multiple-choice quiz questions for a module",
        "endpoint":     f"{QUIZ_SVC}/quiz/generate",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "list_modules",
        "display_name": "List Course Modules",
        "description":  "Returns all modules for a given course ID",
        "endpoint":     f"{COURSE_SVC}/courses/:id",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "create_badge",
        "display_name": "Create Badge",
        "description":  "Creates a gamification achievement badge with criteria",
        "endpoint":     f"{BADGE_SVC}/badges",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "list_badges",
        "display_name": "List Org Badges",
        "description":  "Lists all existing badges in the organization",
        "endpoint":     f"{BADGE_SVC}/badges",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "enroll_learners",
        "display_name": "Enroll Learners",
        "description":  "Enrolls one or more users in a course",
        "endpoint":     f"{USER_SVC}/enrollments",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "send_notification",
        "display_name": "Send Notification",
        "description":  "Sends an email notification via the notification service",
        "endpoint":     f"{NOTIFY_SVC}/notifications/email",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    # ── Content Ingestion Tools ──────────────────────────────────────────────
    {
        "name":         "fetch_youtube_metadata",
        "display_name": "Fetch YouTube Metadata",
        "description":  "Extracts real title, duration, embed URL from a YouTube video URL",
        "endpoint":     f"{CONTENT_SVC}/content/youtube",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "fetch_rss_episodes",
        "display_name": "Fetch RSS Feed Episodes",
        "description":  "Parses a podcast RSS feed and returns episode list with audio URLs",
        "endpoint":     f"{CONTENT_SVC}/content/rss",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "add_module_with_content",
        "display_name": "Add Module With Content",
        "description":  "Adds a course module with rich metadata: URL, duration, source info",
        "endpoint":     f"{COURSE_SVC}/courses/:id/modules",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "schedule_course_release",
        "display_name": "Schedule Course Release",
        "description":  "Schedules a draft course to auto-publish in N days (drip delivery)",
        "endpoint":     f"{COURSE_SVC}/courses/:id/schedule",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "create_learning_path",
        "display_name": "Create Learning Path",
        "description":  "Groups courses into a sequential learning path with auto-prerequisites",
        "endpoint":     f"{COURSE_SVC}/learning-paths",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
    {
        "name":         "set_prerequisite",
        "display_name": "Set Course Prerequisite",
        "description":  "Gates a course behind completing another course first",
        "endpoint":     f"{COURSE_SVC}/courses/:id/prerequisite",
        "version":      "1.0.0",
        "auth_type":    "none",
        "enabled":      True,
    },
]


async def register_all_tools() -> None:
    """
    Upserts all tool definitions into the Tool Registry.
    Called once at app startup. Silently skips if registry is unavailable.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            for tool_def in TOOL_DEFINITIONS:
                await client.post(f"{TOOL_REGISTRY_SVC}/tools", json=tool_def)
        print(
            f"[registry] OK Registered {len(TOOL_DEFINITIONS)} tools "
            f"in Tool Registry at {TOOL_REGISTRY_SVC}"
        )
    except Exception as exc:
        print(f"[registry] WARN Tool Registry unavailable (non-fatal): {exc}")
