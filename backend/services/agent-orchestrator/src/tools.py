"""
LMS Agent Tools
===============
All CrewAI tool functions grouped by domain.
Thread-local context (set_ctx / _ctx) injects org_id, user_id, is_schedule
per request so tools know which org they're acting on.
"""

import os
import threading
import httpx
from crewai.tools import tool

# ── Service URLs ──────────────────────────────────────────────────────────────

COURSE_SVC  = os.getenv("COURSE_SERVICE_URL",         "http://localhost:3002")
QUIZ_SVC    = os.getenv("QUIZ_SERVICE_URL",            "http://localhost:3004")
BADGE_SVC   = os.getenv("BADGE_SERVICE_URL",           "http://localhost:3005")
NOTIFY_SVC  = os.getenv("NOTIFICATION_SERVICE_URL",    "http://localhost:3007")
USER_SVC    = os.getenv("USER_SERVICE_URL",            "http://localhost:3001")
CONTENT_SVC = os.getenv("CONTENT_SERVICE_URL",         "http://localhost:3003")

# ── Thread-local request context ─────────────────────────────────────────────

_local = threading.local()


def set_ctx(ctx: dict) -> None:
    """Called by orchestrator before each crew run to inject org/user context."""
    _local.ctx = ctx


def _ctx() -> dict:
    return getattr(_local, "ctx", {})


# ══════════════════════════════════════════════════════════════════════════════
# COURSE TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@tool("Create Course")
def create_course(title: str, description: str = "", skill_tags: str = "") -> str:
    """
    Create a new LMS course draft.
    Returns the course ID — pass it to add_module and publish_course.
    skill_tags: comma-separated string e.g. "Python, OOP, Testing"
    """
    tags = [t.strip() for t in skill_tags.split(",") if t.strip()]
    # Pass ?schedule=true for multi-course workflows to bypass weekly limit
    params = {"schedule": "true"} if _ctx().get("is_schedule") else {}
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/courses",
                json={
                    "title":        title,
                    "description":  description,
                    "skillTags":    tags,
                    "orgId":        _ctx().get("org_id"),
                    "instructorId": _ctx().get("user_id"),
                },
                params=params,
            )
        if res.status_code == 429:
            return f"⚠️ Weekly course limit reached: {res.json().get('message', '')}"
        d = res.json().get("data", {})
        return f"✅ Course created: '{d.get('title')}' (ID: {d.get('id')})"
    except Exception as e:
        return f"❌ create_course failed: {e}"


@tool("Add Module")
def add_module(
    course_id:    str,
    title:        str,
    content_type: str = "text",
    content_url:  str = "",
) -> str:
    """
    Add a lesson module to an existing course.
    content_type: video | text | pdf | youtube_embed
    content_url: hosted URL (optional for text modules).
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/courses/{course_id}/modules",
                json={
                    "title":       title,
                    "contentType": content_type,
                    "contentUrl":  content_url or None,
                    "sourceType":  content_type,
                },
            )
        d = res.json().get("data", {})
        return f"✅ Module added: '{d.get('title')}' (ID: {d.get('id')})"
    except Exception as e:
        return f"❌ add_module failed: {e}"


@tool("Publish Course")
def publish_course(course_id: str) -> str:
    """
    Publish a course so it appears in the learner catalog.
    Always call this after all modules are added.
    For weekly schedules: only publish week 1 — leave the rest as drafts.
    """
    try:
        with httpx.Client(timeout=30) as c:
            c.patch(f"{COURSE_SVC}/courses/{course_id}/publish")
        return f"✅ Course {course_id} published — visible to learners"
    except Exception as e:
        return f"❌ publish_course failed: {e}"


@tool("Get Course Details")
def get_course(course_id: str) -> str:
    """
    Get course title and list of all modules (with IDs).
    Use before generating quizzes or creating badges.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.get(f"{COURSE_SVC}/courses/{course_id}")
        d = res.json().get("data", {})
        modules = d.get("modules", [])
        mod_list = " | ".join(
            f"'{m.get('title')}' ({m.get('id')})" for m in modules
        )
        return f"Course: '{d.get('title')}' | Status: {d.get('status')} | Modules: {mod_list or 'none yet'}"
    except Exception as e:
        return f"❌ get_course failed: {e}"


@tool("List Org Courses")
def list_courses(limit: int = 10) -> str:
    """
    List recent courses in this organization.
    Use to find existing course IDs for quiz or badge operations.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.get(
                f"{COURSE_SVC}/courses",
                params={"orgId": _ctx().get("org_id"), "limit": limit},
            )
        rows = res.json().get("data", [])
        if not rows:
            return "No courses found in this organization."
        items = " | ".join(
            f"'{r.get('title')}' ({r.get('id')}, {r.get('status')})" for r in rows
        )
        return f"Found {len(rows)} courses: {items}"
    except Exception as e:
        return f"❌ list_courses failed: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# QUIZ TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@tool("Generate Quiz Questions")
def generate_quiz(
    course_id:     str,
    content_text:  str,
    module_id:     str = "",
    num_questions: int = 5,
    difficulty:    str = "medium",
) -> str:
    """
    Generate AI quiz questions for a course module.
    content_text: the topic or module title to generate questions about.
    difficulty: easy | medium | hard
    num_questions: how many questions to generate (default 5).
    """
    try:
        with httpx.Client(timeout=60) as c:
            res = c.post(
                f"{QUIZ_SVC}/quiz/generate",
                json={
                    "courseId":     course_id,
                    "moduleId":     module_id or None,
                    "contentText":  content_text,
                    "numQuestions": num_questions,
                },
            )
        count = res.json().get("count", 0)
        return f"✅ Generated {count} {difficulty} quiz questions for module '{module_id or 'course-level'}'"
    except Exception as e:
        return f"❌ generate_quiz failed: {e}"


@tool("List Course Modules")
def list_modules(course_id: str) -> str:
    """
    Get all modules for a course.
    Always call this before generate_quiz to discover which modules exist.
    Returns module IDs and titles.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.get(f"{COURSE_SVC}/courses/{course_id}")
        modules = res.json().get("data", {}).get("modules", [])
        if not modules:
            return f"No modules found for course {course_id}"
        items = "\n".join(
            f"  - '{m.get('title')}' (ID: {m.get('id')})" for m in modules
        )
        return f"Modules for course {course_id} ({len(modules)} total):\n{items}"
    except Exception as e:
        return f"❌ list_modules failed: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# BADGE TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@tool("Create Badge")
def create_badge(
    course_id:   str,
    name:        str,
    description: str = "",
    criteria:    str = "",
    tier:        str = "completion",
) -> str:
    """
    Create an achievement badge for a course.
    tier: completion | excellence | series
      - completion: awarded for completing all modules (70%+ quiz pass)
      - excellence: awarded for outstanding performance (90%+)
      - series: awarded for completing a multi-week/multi-level series
    criteria: human-readable requirement e.g. 'Pass all quizzes with 70%+'
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{BADGE_SVC}/badges",
                json={
                    "name":        name,
                    "description": description or f"Awarded for: {criteria or name}",
                    "courseId":    course_id,
                    "orgId":       _ctx().get("org_id"),
                    "criteria":    criteria or f"Complete all modules in '{name}'",
                    "skillTags":   [tier],
                },
            )
        d = res.json().get("data", {})
        return f"✅ Badge '{d.get('name')}' created (ID: {d.get('id')}, tier: {tier})"
    except Exception as e:
        return f"❌ create_badge failed: {e}"


@tool("List Org Badges")
def list_badges() -> str:
    """
    List all existing badges in the organization.
    Always call this before creating badges to avoid duplicates.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.get(
                f"{BADGE_SVC}/badges",
                params={"orgId": _ctx().get("org_id")},
            )
        rows = res.json().get("data", [])
        if not rows:
            return "No badges exist yet in this organization."
        items = " | ".join(f"'{r.get('name')}' ({r.get('id')})" for r in rows)
        return f"Existing badges ({len(rows)}): {items}"
    except Exception as e:
        return f"❌ list_badges failed: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# ENGAGEMENT TOOLS
# ══════════════════════════════════════════════════════════════════════════════

@tool("Enroll Learners")
def enroll_learners(course_id: str, user_ids: str) -> str:
    """
    Enroll one or more learners in a course.
    user_ids: comma-separated UUID list.
    Only call this if the admin explicitly mentioned specific users to enroll.
    """
    ids = [uid.strip() for uid in user_ids.split(",") if uid.strip()]
    if not ids:
        return "⚠️ No user IDs provided — enrollment skipped"
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{USER_SVC}/enrollments",
                json={
                    "courseId": course_id,
                    "userIds":  ids,
                    "orgId":    _ctx().get("org_id"),
                },
            )
        d = res.json().get("data", {})
        return f"✅ Enrolled {d.get('enrolled', 0)} learner(s) (skipped {d.get('skipped', 0)} already enrolled)"
    except Exception as e:
        return f"❌ enroll_learners failed: {e}"


@tool("Send Notification")
def send_notification(to_emails: str, subject: str, message: str) -> str:
    """
    Send an email notification.
    to_emails: comma-separated email addresses.
    """
    emails = [e.strip() for e in to_emails.split(",") if e.strip()]
    if not emails:
        return "⚠️ No emails provided — notification skipped"
    try:
        with httpx.Client(timeout=30) as c:
            c.post(
                f"{NOTIFY_SVC}/notifications/email",
                json={
                    "to":       emails,
                    "subject":  subject,
                    "htmlBody": f"<p>{message}</p>",
                },
            )
        return f"✅ Notification sent to {len(emails)} recipient(s)"
    except Exception as e:
        return f"❌ send_notification failed: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# CONTENT INGESTION TOOLS  (YouTube, Podcasts, Rich Module Creation)
# ══════════════════════════════════════════════════════════════════════════════

@tool("Fetch YouTube Metadata")
def fetch_youtube_metadata(url: str) -> str:
    """
    Extract metadata from a YouTube URL before adding it as a module.
    Returns: title, description, duration_secs, embed_url, channel, video_id.

    IMPORTANT: Always call this BEFORE add_module_with_content when a YouTube URL
    is provided. Use the returned title as the module title and embed_url as content_url.
    Never invent a title — always use the real YouTube title from this response.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{CONTENT_SVC}/content/youtube",
                json={"url": url, "course_id": "preview"},
            )
        d = res.json().get("data", {})
        return (
            f"YouTube metadata fetched: "
            f"title='{d.get('title')}' | "
            f"duration={d.get('duration')}s | "
            f"channel='{d.get('channel')}' | "
            f"embed_url='{d.get('embed_url')}' | "
            f"video_id='{d.get('video_id')}'"
        )
    except Exception as e:
        return f"❌ fetch_youtube_metadata failed: {e}"


@tool("Fetch RSS Feed Episodes")
def fetch_rss_episodes(rss_url: str, max_episodes: int = 10) -> str:
    """
    Parse a podcast RSS feed and return a list of episodes for module creation.
    Returns episode titles, audio URLs, and durations.

    After calling this, use each episode title as the module title when calling
    add_module_with_content with content_type='audio'.
    max_episodes: how many recent episodes to include (default 10).
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{CONTENT_SVC}/content/rss",
                json={"url": rss_url, "max_episodes": max_episodes},
            )
        data = res.json().get("data", {})
        episodes = data.get("episodes", [])
        if not episodes:
            return f"No episodes found in RSS feed at {rss_url}"
        lines = [f"RSS feed: '{data.get('title', 'Unknown Podcast')}' — {len(episodes)} episodes:"]
        for ep in episodes:
            lines.append(
                f"  - title='{ep.get('title')}' | "
                f"audio_url='{ep.get('audio_url')}' | "
                f"duration={ep.get('duration_secs', 0)}s"
            )
        return "\n".join(lines)
    except Exception as e:
        return f"❌ fetch_rss_episodes failed: {e}"


@tool("Add Module With Content")
def add_module_with_content(
    course_id:       str,
    title:           str,
    content_type:    str,
    content_url:     str,
    duration_secs:   int = 0,
    source_metadata: str = "",
) -> str:
    """
    Add a module to a course with rich content metadata (URL, duration, source info).
    Use this instead of add_module when you have real URL-based content.

    content_type: youtube_embed | audio | video | pdf
    content_url: the embed URL (YouTube) or hosted audio/video URL.
    duration_secs: video/audio length in seconds (from fetch_youtube_metadata or RSS).
    source_metadata: optional JSON string with extra info (video_id, channel, rss_feed_url, etc.).
    """
    import json as _json
    meta: dict = {}
    if source_metadata:
        try:
            meta = _json.loads(source_metadata)
        except Exception:
            pass
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/courses/{course_id}/modules",
                json={
                    "title":           title,
                    "contentType":     content_type,
                    "contentUrl":      content_url or None,
                    "sourceType":      content_type,
                    "durationSecs":    duration_secs or None,
                    "sourceMetadata":  meta or None,
                    "processingStatus": "ready",
                },
            )
        d = res.json().get("data", {})
        return (
            f"✅ Module added: '{d.get('title')}' "
            f"(ID: {d.get('id')}, type: {content_type}, "
            f"duration: {duration_secs}s)"
        )
    except Exception as e:
        return f"❌ add_module_with_content failed: {e}"


@tool("Schedule Course Release")
def schedule_course_release(course_id: str, release_days_from_now: int) -> str:
    """
    Schedule a draft course to auto-publish in N days from today.
    The course-service drip scheduler checks hourly and publishes when the time comes.

    Use this for drip courses after creating draft courses:
      - Week 2: release_days_from_now=7
      - Week 3: release_days_from_now=14
      - Week N: release_days_from_now=(N-1)*7

    Do NOT call publish_course for drip weeks — schedule_course_release handles it automatically.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/courses/{course_id}/schedule",
                json={
                    "release_days_from_now": release_days_from_now,
                    "org_id": _ctx().get("org_id"),
                },
            )
        d = res.json().get("data", {})
        return (
            f"✅ Course {course_id} scheduled to auto-publish in {release_days_from_now} days "
            f"(at {d.get('scheduled_at', 'TBD')})"
        )
    except Exception as e:
        return f"❌ schedule_course_release failed: {e}"


@tool("Create Learning Path")
def create_learning_path(
    title:       str,
    description: str = "",
    course_ids:  str = "",
    skill_tags:  str = "",
) -> str:
    """
    Create a Learning Path that groups multiple courses under one umbrella with auto-prerequisites.
    The first course has no prerequisite. Each subsequent course requires completing the previous one.

    title: name of the learning path e.g. 'Data Science Mastery Path'
    course_ids: comma-separated course IDs IN ORDER (first=beginner, last=most advanced).
    skill_tags: comma-separated tags e.g. 'Python, Data Science'

    This automatically sets prerequisite_course_ids on each non-first course.
    """
    ids = [cid.strip() for cid in course_ids.split(",") if cid.strip()]
    tags = [t.strip() for t in skill_tags.split(",") if t.strip()]
    if not ids:
        return "❌ create_learning_path: course_ids is required (comma-separated list)"
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/learning-paths",
                json={
                    "title":       title,
                    "description": description,
                    "courseIds":   ids,
                    "skillTags":   tags,
                    "orgId":       _ctx().get("org_id"),
                    "createdBy":   _ctx().get("user_id"),
                },
            )
        d = res.json().get("data", {})
        return (
            f"✅ Learning Path '{d.get('title')}' created (ID: {d.get('id')}) "
            f"with {len(ids)} courses in sequence — prerequisites auto-wired."
        )
    except Exception as e:
        return f"❌ create_learning_path failed: {e}"


@tool("Research Topic")
def research_topic(topic: str) -> str:
    """
    Research a topic to discover key concepts, subtopics, and common curriculum structure.
    Use this BEFORE designing module titles — get real, specific subject knowledge.

    Returns a structured summary: key areas, subtopics, and example module ideas.
    Use the insights to write specific, professional module titles instead of generic ones.

    Examples:
    - research_topic("Python programming") → returns: variables, functions, OOP, file I/O,
      error handling, APIs, testing...
    - research_topic("Digital Marketing") → returns: SEO, PPC, social media, email campaigns...
    """
    try:
        import wikipediaapi
        wiki = wikipediaapi.Wikipedia(
            user_agent="LMS-CourseDesigner/1.0 (educational content generation)",
            language="en",
        )
        page = wiki.page(topic)
        if not page.exists():
            # Try capitalized version
            page = wiki.page(topic.title())
        if not page.exists():
            return f"No Wikipedia article found for '{topic}'. Use your knowledge to design modules."

        # Extract top-level sections as subtopic list
        sections = [s.title for s in page.sections if s.title and len(s.title) > 2][:15]
        summary = page.summary[:600].replace("\n", " ").strip()

        lines = [
            f"Topic: {page.title}",
            f"Overview: {summary}",
            "",
            "Key areas and subtopics (use these for specific, professional module titles):",
        ]
        for s in sections:
            lines.append(f"  - {s}")

        return "\n".join(lines)
    except Exception as e:
        return f"Research unavailable ({e}). Proceed with your knowledge of the topic."


@tool("Set Course Prerequisite")
def set_prerequisite(course_id: str, requires_course_id: str) -> str:
    """
    Gate a course behind completing another course first.
    course_id: the course to gate (e.g. Intermediate level course ID).
    requires_course_id: the course that must be completed first (e.g. Beginner level course ID).

    Learners who have not completed the prerequisite will see this course as locked.
    Use create_learning_path instead when linking a full series — it auto-wires prerequisites.
    Use set_prerequisite for one-off gating of a single course.
    """
    try:
        with httpx.Client(timeout=30) as c:
            res = c.post(
                f"{COURSE_SVC}/courses/{course_id}/prerequisite",
                json={"prerequisite_course_id": requires_course_id},
            )
        if res.status_code >= 400:
            return f"❌ set_prerequisite failed: {res.text}"
        return f"✅ Course {course_id} now requires completion of {requires_course_id} before enrolling."
    except Exception as e:
        return f"❌ set_prerequisite failed: {e}"
