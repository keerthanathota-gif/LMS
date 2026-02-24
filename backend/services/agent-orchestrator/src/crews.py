"""
LMS Crew Configurations
========================
Intent detection (direct LLM call, not a CrewAI agent) + 10 crew factories.

Workflow types:
  single_course     → course_architect → quiz_expert → badge_specialist → engagement_coordinator
  weekly_schedule   → curriculum_designer → quiz_expert → badge_specialist → engagement_coordinator
  sub_courses       → curriculum_designer → quiz_expert → badge_specialist → engagement_coordinator
  multiple_courses  → course_architect → quiz_expert → badge_specialist
  quiz_only         → quiz_expert
  badge_only        → badge_specialist
  youtube_course    → content_ingestion_specialist → quiz_expert → badge_specialist → engagement_coordinator
  podcast_course    → content_ingestion_specialist → quiz_expert → badge_specialist → engagement_coordinator
  drip_schedule     → drip_curriculum_designer → quiz_expert → badge_specialist → engagement_coordinator
  learning_path     → path_curriculum_designer → quiz_expert → badge_specialist → engagement_coordinator
"""

import json
from pydantic import BaseModel, Field
from crewai import Task, Crew, Process


# ── Intent Schema ─────────────────────────────────────────────────────────────

class WorkflowIntent(BaseModel):
    workflow:            str   = "single_course"
    topic:               str   = "General"
    num_items:           int   = Field(default=1, ge=1, le=12)   # weeks or courses
    level:               str   = "beginner"
    modules_per_course:  int   = Field(default=3, ge=1, le=10)
    quizzes_per_module:  int   = Field(default=5, ge=1, le=20)
    existing_course_id:  str   = ""
    notes:               str   = ""
    # Content ingestion fields
    urls:                list  = Field(default_factory=list)  # YouTube URLs or RSS feed URLs
    content_source:      str   = ""   # "youtube_urls" | "rss_feed" | "video_upload" | ""
    drip_days_interval:  int   = 7    # days between drip releases (default weekly)


_INTENT_PROMPT = """Analyze this LMS admin request and return ONLY valid JSON (no markdown, no code fences).

Request: "{message}"
Detected URLs: {urls}
Content source type: {content_source}
Conversation history (previous turns):
{history}

Return JSON with these exact fields:
{{
  "workflow": "<one of: needs_clarification | clarify_quiz | clarify_badge | clarify_certificate | single_course | weekly_schedule | multiple_courses | sub_courses | quiz_only | badge_only | youtube_course | podcast_course | drip_schedule | learning_path | add_module | edit_course | general_chat>",
  "topic": "<main subject, e.g. Python or Data Science>",
  "num_items": <integer: number of weeks, courses, or episodes, default 1>,
  "level": "<beginner | intermediate | advanced, default beginner>",
  "modules_per_course": <integer 1-10, default 3>,
  "quizzes_per_module": <integer 1-20, default 5>,
  "existing_course_id": "<UUID if admin mentioned a specific course ID, else empty string>",
  "notes": "<any extra instructions>",
  "urls": [],
  "content_source": "{content_source}",
  "drip_days_interval": <integer days between drip releases, default 7>
}}

=== STAGE ROUTING (evaluated FIRST — check before all other rules) ===

Look at the LAST ASSISTANT MESSAGE in the conversation history to detect which stage we are in:

S0. If the last assistant message discussed course structure topics (audience / single-vs-weekly /
    category / number of modules) AND the admin just replied with their answers → "clarify_quiz"

S1. If the last assistant message discussed quiz design (quiz placement / module positions /
    custom vs AI questions / quiz topics) AND the admin just replied → "clarify_badge"

S2. If the last assistant message discussed badge design (badge names / badge tiers / criteria)
    AND the admin just replied → "clarify_certificate"

S3. If the last assistant message discussed certificate / asked "say YES to build" / asked for
    final confirmation AND the admin just confirmed (yes / go ahead / build it / sure) →
    DETECT the original content type from the FIRST user message in history:
    - First message had youtube.com or youtu.be URLs → "youtube_course"
    - First message had RSS/podcast/feed URL or "podcast" keyword → "podcast_course"
    - First message had "learning path" or "track" → "learning_path"
    - First message had "weekly" or "N weeks" or "drip" → "weekly_schedule"
    - Otherwise → "single_course"

S4. If admin replied to Stage 3 (certificate stage) but said NO to certificate → same as S3
    (still build the course, just without certificate — note it in "notes" field)

=== STANDARD RULES (evaluated after stage routing, in priority order) ===

RULE 0 — FIRST-CONTACT INTERACTIVE INTAKE (highest priority standard rule):
Use "needs_clarification" if BOTH conditions are true:
  A. The conversation history is "(no previous conversation)" OR has fewer than 2 messages
  B. The request is about creating a course (ANY type: text topic, YouTube URL, podcast, video)

This includes ALL of these examples → needs_clarification:
  "I want to create a Python course"
  "make a sales training"
  "create a JavaScript course"
  "build a course from https://youtube.com/watch?v=abc"
  "I have a podcast at https://feed.example.com/rss"
  "create a beginner Python course"
  "make a 4-week data science series"

Only SKIP needs_clarification (rule 0) for these special cases:
  - quiz_only: "add quizzes to course abc-123"
  - badge_only: "create badges for course xyz"
  - Adding modules to an existing course (mentions a specific course ID)
  - Admin is clearly answering a previous question (stage routing rules S0-S3 already handled this above)

RULE 1 — CONTENT INGESTION (only when history shows admin has ALREADY completed Q&A intake):
  content_source="youtube_urls" OR detected YouTube URLs AND history shows multi-turn Q&A → "youtube_course"

RULE 2 — PODCAST (only when history shows completed Q&A):
  content_source="rss_feed" OR "podcast" in message AND history shows multi-turn Q&A → "podcast_course"

RULE 3 — DRIP: "drip" OR "auto-publish" OR "schedule week" explicitly requested → "drip_schedule"

RULE 4 — LEARNING PATH: "learning path" OR "learning track" OR "course bundle" → "learning_path"

RULE 5 — SUB-COURSES: "beginner" AND ("intermediate" OR "advanced") OR "sub-course" → "sub_courses"

RULE 6 — WEEKLY: "weekly series" OR "per week" explicitly requested → "weekly_schedule"

RULE 7 — MULTIPLE: "multiple courses" OR "N courses" (N>1) explicitly requested → "multiple_courses"

RULE 8 — QUIZ ONLY: Admin wants quizzes only for existing content → "quiz_only"

RULE 9 — BADGE ONLY: Admin wants badges only, no new course → "badge_only"

RULE 9.5 — ADD MODULE: Admin wants to add module(s)/lesson(s) to an EXISTING course.
  Keywords: "add module", "add lesson", "append module", "add a video to", "add more modules"
  Must reference an existing course by name or UUID → "add_module"
  Set existing_course_id if a UUID is mentioned.
  Set topic to the module topic described.
  Set notes with the course name if mentioned by name (for fuzzy title search).

RULE 9.6 — EDIT COURSE: Admin wants to edit/modify/delete parts of an EXISTING course.
  Keywords: "edit course", "update course", "delete module", "remove module", "change title",
  "rename course", "reorder modules", "modify quiz", "update description"
  Must reference an existing course by name or UUID → "edit_course"
  Set existing_course_id if UUID mentioned. Set notes with course name and what to edit.

RULE 10 — DEFAULT: Admin confirmed build after full Q&A (history has 4+ turns) → "single_course"

RULE 11 — GENERAL CHAT: Admin is asking a general question, requesting information, or having
  a conversation that doesn't fit any other workflow → "general_chat"
  Examples: "how many learners?", "show analytics", "what badges exist?", "help me understand X",
  "what can you do?", "thanks", or any general question/statement.

For youtube_course: set num_items to the number of YouTube URLs detected.
For podcast_course: set num_items to the max_episodes the admin wants (default 10).
For drip_schedule: set drip_days_interval from the message (e.g. "every 7 days" → 7, "every 2 weeks" → 14).
Extract level/modules_per_course/quizzes_per_module from the Q&A conversation history when available.
"""


_SKIP_CLARIFICATION_KEYWORDS = [
    "add quiz", "add quizzes", "generate quiz", "quiz only",
    "add badge", "create badge", "badge only",
    "add module", "add lesson",
    "edit course", "update course", "delete module", "remove module",
    "change title", "rename", "reorder", "modify",
]


def _is_first_contact(messages: list) -> bool:
    """True if there are no prior assistant messages in the conversation."""
    return not any(m.get("role") == "assistant" for m in messages[:-1])


def _is_direct_action(message: str) -> bool:
    """True if the request is a direct action that skips the intake Q&A."""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in _SKIP_CLARIFICATION_KEYWORDS)


def _get_stage_from_history(messages: list) -> str | None:
    """
    Content-based stage routing — checks WHAT has been discussed, not message count.
    A stage is "complete" when the assistant has covered that topic AND the user responded.
    Stages progress in order: structure → quiz → badge → certificate → build.
    If the user asks a question, the agent stays and answers it.
    """
    if not messages or len(messages) < 2:
        return None

    # Collect all text by role
    all_assistant = " ".join(m.get("content", "").lower() for m in messages[:-1] if m.get("role") == "assistant")
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user = m.get("content", "").lower().strip()
            break

    # Check which topics the assistant has covered
    covered_structure = any(k in all_assistant for k in ['module', 'audience', 'learner', 'category', 'course name'])
    covered_quiz = any(k in all_assistant for k in ['quiz', 'assessment', 'question', 'auto-generate'])
    covered_badge = any(k in all_assistant for k in ['badge', 'completion badge', 'excellence'])
    covered_cert = any(k in all_assistant for k in ['certificate', 'build summary', 'say yes', 'start building'])

    # Is user asking a question? → stay in current stage
    is_question = '?' in last_user and last_user not in ('ok?', 'yes?', 'sure?', 'right?')
    if not is_question:
        is_question = any(s in last_user for s in ['where should', 'how do', 'how can', 'what if',
                                                     'can i', 'tell me', 'what about', 'how to'])

    # Is user confirming build?
    build_confirm = any(s in last_user for s in ['yes', 'build', 'go ahead', 'start', 'do it', 'create it',
                                                   "let's go", 'proceed', 'make it'])

    # If all 4 stages covered AND user confirms → build
    if covered_structure and covered_quiz and covered_badge and covered_cert and build_confirm:
        return None

    # If user is asking a question → stay in the relevant stage
    if is_question:
        if any(k in last_user for k in ['module', 'upload', 'add', 'content', 'video', 'structure', 'course']):
            return 'needs_clarification'
        if any(k in last_user for k in ['quiz', 'question', 'test']):
            return 'clarify_quiz'
        if any(k in last_user for k in ['badge', 'achievement']):
            return 'clarify_badge'
        if any(k in last_user for k in ['certificate', 'cert']):
            return 'clarify_certificate'
        # Stay in the current uncompleted stage
        if not covered_structure: return 'needs_clarification'
        if not covered_quiz: return 'clarify_quiz'
        if not covered_badge: return 'clarify_badge'
        return 'clarify_certificate'

    # Normal progression: advance to next uncompleted stage
    if not covered_structure: return 'needs_clarification'
    if not covered_quiz: return 'clarify_quiz'
    if not covered_badge: return 'clarify_badge'
    if not covered_cert: return 'clarify_certificate'

    # All covered but no build confirm yet → stay on certificate/confirm stage
    return 'clarify_certificate'


def detect_intent(message: str, llm, urls: list = None, content_source: str = "", messages: list = None) -> WorkflowIntent:
    """
    Classifies the admin's intent into a structured WorkflowIntent.

    Programmatic stage routing (more reliable than LLM for multi-turn Q&A):
    - 0 prior assistant messages → needs_clarification (Stage 1)
    - 1 prior assistant message  → clarify_quiz        (Stage 2)
    - 2 prior assistant messages → clarify_badge       (Stage 3)
    - 3 prior assistant messages → clarify_certificate (Stage 4)
    - 4+ prior assistant messages → LLM detects final workflow (single_course, etc.)

    Exception: quiz_only / badge_only / direct actions bypass the Q&A flow entirely.
    """
    if urls is None:
        urls = []
    if messages is None:
        messages = []

    # ── Programmatic Rule 0: First-contact always asks clarification ───────────
    if _is_first_contact(messages) and not _is_direct_action(message):
        return WorkflowIntent(
            workflow="needs_clarification",
            topic=message[:80],
            urls=urls,
            content_source=content_source,
        )

    # ── Programmatic Stage Routing: Count assistant messages to advance stages ──
    if not _is_direct_action(message):
        stage = _get_stage_from_history(messages)
        if stage:
            return WorkflowIntent(
                workflow=stage,
                topic=message[:80],
                urls=urls,
                content_source=content_source,
            )

    # ── LLM-based detection: Q&A is complete (4+ assistant turns) or direct action
    # Build a readable history string from prior turns (exclude the current message)
    history_lines = []
    for msg in messages[:-1]:   # skip the current (last) user message
        role = "Admin" if msg.get("role") == "user" else "Assistant"
        history_lines.append(f"{role}: {msg.get('content', '')[:600]}")
    history = "\n".join(history_lines) if history_lines else "(no previous conversation)"

    prompt = _INTENT_PROMPT.format(
        message=message,
        urls=urls,
        content_source=content_source,
        history=history,
    )
    # Count how many Q&A rounds have completed (for safeguard below)
    local_assistant_count = sum(1 for m in messages[:-1] if m.get("role") == "assistant")

    try:
        result = llm.call([{"role": "user", "content": prompt}])
        text = result if isinstance(result, str) else getattr(result, "content", str(result))
        # Strip any accidental markdown fences
        text = (
            text.strip()
            .removeprefix("```json").removeprefix("```")
            .removesuffix("```").strip()
        )
        data = json.loads(text)
        intent = WorkflowIntent(**data)
        # Ensure pre-extracted URLs are always injected (LLM may not have echoed them)
        if urls and not intent.urls:
            intent.urls = urls
        if content_source and not intent.content_source:
            intent.content_source = content_source

        # ── Safeguard: after 4 Q&A rounds, never return a clarification workflow ──
        # The LLM occasionally mis-classifies "Yes, build it" as another stage.
        # If we've already done all 4 stages, force the actual build workflow.
        _clarification_workflows = {"needs_clarification", "clarify_quiz", "clarify_badge", "clarify_certificate"}
        if local_assistant_count >= 4 and intent.workflow in _clarification_workflows:
            print(f"[detect_intent] Stage-5 safeguard: overriding '{intent.workflow}' → detecting build workflow")
            # Detect build type from the original first user message + URL signals
            first_user_content = next(
                (m.get("content", "") for m in messages if m.get("role") == "user"), ""
            )
            all_content = first_user_content + " " + " ".join(str(u) for u in urls)
            if content_source == "youtube_urls" or any(
                "youtube.com" in c or "youtu.be" in c for c in [first_user_content] + [str(u) for u in urls]
            ):
                intent.workflow = "youtube_course"
            elif content_source == "rss_feed" or "podcast" in first_user_content.lower():
                intent.workflow = "podcast_course"
            elif "learning path" in first_user_content.lower() or "learning track" in first_user_content.lower():
                intent.workflow = "learning_path"
            elif "weekly" in first_user_content.lower() or "drip" in first_user_content.lower():
                intent.workflow = "weekly_schedule"
            else:
                intent.workflow = "single_course"
            print(f"[detect_intent] Stage-5 safeguard: resolved to '{intent.workflow}'")

        return intent
    except Exception as e:
        import traceback
        print(f"[detect_intent ERROR] {type(e).__name__}: {e}")
        print(traceback.format_exc())
        # Safe fallback — treat as single_course
        return WorkflowIntent(
            workflow="single_course",
            topic=message[:80],
            urls=urls,
            content_source=content_source,
        )


# ── Crew Router ───────────────────────────────────────────────────────────────

def route_to_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    """Select the appropriate crew based on detected intent."""
    dispatch = {
        "quiz_only":        _quiz_only_crew,
        "badge_only":       _badge_only_crew,
        "weekly_schedule":  _weekly_schedule_crew,
        "sub_courses":      _sub_courses_crew,
        "multiple_courses": _multiple_courses_crew,
        "youtube_course":   _youtube_course_crew,
        "podcast_course":   _podcast_course_crew,
        "drip_schedule":    _drip_schedule_crew,
        "learning_path":    _learning_path_crew,
    }
    fn = dispatch.get(intent.workflow, _single_course_crew)
    return fn(intent, agents, message)


# ══════════════════════════════════════════════════════════════════════════════
# CREW 1 — Single Course (default)
# ══════════════════════════════════════════════════════════════════════════════

def _single_course_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:

    difficulty = {
        "beginner":     "easy",
        "intermediate": "medium",
        "advanced":     "hard",
    }.get(intent.level, "medium")

    design = Task(
        description=(
            f"Admin request: {message}\n\n"
            f"Topic: {intent.topic} | Level: {intent.level} | Modules: {intent.modules_per_course}\n\n"
            "Your steps:\n"
            "1. create_course(title, description, skill_tags)\n"
            f"2. add_module — repeat {intent.modules_per_course} times with meaningful, progressive titles\n"
            "3. publish_course(course_id)\n\n"
            "IMPORTANT: Include the course_id and all module IDs in your final output."
        ),
        expected_output=(
            "Course ID, course title, list of module titles with IDs, published confirmation."
        ),
        agent=agents["course_architect"],
    )

    quiz = Task(
        description=(
            "Generate quiz questions for the course just created by the Course Architect.\n\n"
            "Your steps:\n"
            "1. Extract the course_id from the Course Architect's output\n"
            "2. Call list_modules(course_id) to get all module IDs\n"
            f"3. For EACH module: call generate_quiz with num_questions={intent.quizzes_per_module}, "
            f"difficulty='{difficulty}', content_text=module_title\n\n"
            "Do NOT skip any module. Generate quizzes for ALL modules."
        ),
        expected_output="Number of questions generated per module, total question count.",
        agent=agents["quiz_expert"],
        context=[design],
    )

    badge = Task(
        description=(
            "Create achievement badge(s) for the course.\n\n"
            "Your steps:\n"
            "1. Call list_badges() — check for existing badges to avoid duplicates\n"
            "2. Call get_course(course_id) to get the exact course title\n"
            f"3. create_badge(\n"
            f"     course_id=<from Course Architect>,\n"
            f"     name='{intent.topic} Graduate',\n"
            f"     tier='completion',\n"
            f"     criteria='Pass all {intent.modules_per_course} modules with 70%+'\n"
            f"   )\n"
            + (
                f"4. Also create an excellence badge: name='{intent.topic} Excellence Award', "
                f"tier='excellence', criteria='Score 90%+ on all quizzes'\n"
                if intent.level == "advanced" else ""
            )
        ),
        expected_output="Badge name(s), badge ID(s), criteria summary.",
        agent=agents["badge_specialist"],
        context=[design],
    )

    engage = Task(
        description=(
            "Handle enrollment and launch notification for the new course.\n\n"
            "Your steps:\n"
            "1. Only enroll users if the admin explicitly named specific user IDs in the request\n"
            "2. Send a launch notification:\n"
            f"   - Subject: 'New Course Live: {intent.topic}'\n"
            "   - Recipient: admin@lms.local\n"
            "   - Message: announce the course is live, what learners will learn, "
            "and what badge they can earn\n\n"
            "Use the course_id from the Course Architect's output."
        ),
        expected_output="Enrollment count (if any), notification sent confirmation.",
        agent=agents["engagement_coordinator"],
        context=[design],
    )

    return Crew(
        agents=[
            agents["course_architect"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[design, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 2 — Weekly Schedule
# ══════════════════════════════════════════════════════════════════════════════

def _weekly_schedule_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    n = intent.num_items

    curriculum = Task(
        description=(
            f"Create a {n}-week course series on: {intent.topic}\n\n"
            f"For EACH of the {n} weeks, do this complete flow:\n"
            f"  1. create_course(title='{intent.topic} - Week N: [Specific Subtopic]', "
            f"description='Week N of the {intent.topic} series', skill_tags='{intent.topic}')\n"
            f"  2. add_module — repeat {intent.modules_per_course} times with week-appropriate titles\n"
            "  3. publish_course — ONLY for Week 1. For weeks 2-N: do NOT publish (leave as draft).\n\n"
            f"Subtopic progression: Week 1=Foundations, Week 2=Core Concepts, "
            f"Week 3+=Advanced Topics (adjust for {n} weeks).\n\n"
            f"IMPORTANT: Return ALL {n} course IDs with their week numbers in your final output."
        ),
        expected_output=(
            f"List of {n} course IDs with week numbers. "
            f"Week 1 published. Weeks 2-{n} as drafts."
        ),
        agent=agents["curriculum_designer"],
    )

    quiz = Task(
        description=(
            f"Generate quizzes for ALL {n} courses in the series.\n\n"
            "For EACH course ID from the Curriculum Designer's output:\n"
            "  1. Call list_modules(course_id)\n"
            f"  2. For each module: call generate_quiz with num_questions={intent.quizzes_per_module}\n\n"
            "Difficulty progression:\n"
            "  - Weeks 1-2: difficulty='easy'\n"
            f"  - Weeks 3-{max(3, n-1)}: difficulty='medium'\n"
            f"  - Week {n} (final): difficulty='hard'\n\n"
            "Cover ALL courses and ALL modules."
        ),
        expected_output=f"Quiz counts per week/course, total questions generated across all {n} courses.",
        agent=agents["quiz_expert"],
        context=[curriculum],
    )

    badge = Task(
        description=(
            f"Create badge progression for the {n}-week series.\n\n"
            "1. Call list_badges() to check for existing badges\n"
            f"2. For each week 1 through {n}: create_badge(\n"
            f"     course_id=<week N course_id>,\n"
            f"     name='{intent.topic} - Week N Scholar',\n"
            f"     tier='completion',\n"
            f"     criteria='Complete Week N of the {intent.topic} series'\n"
            f"   )\n"
            f"3. Create series graduation badge using week 1's course_id:\n"
            f"   create_badge(\n"
            f"     course_id=<week 1 course_id>,\n"
            f"     name='{intent.topic} Series Graduate',\n"
            f"     tier='series',\n"
            f"     criteria='Complete all {n} weeks of the {intent.topic} series'\n"
            f"   )\n"
        ),
        expected_output=f"{n} weekly badges + 1 series graduation badge, all IDs returned.",
        agent=agents["badge_specialist"],
        context=[curriculum],
    )

    engage = Task(
        description=(
            f"Send a series launch notification.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: '🎓 {intent.topic} {n}-Week Learning Series Starts Now!'\n"
            f"Message should include:\n"
            f"  - Week 1 is live now\n"
            f"  - New weeks unlock weekly (weeks 2-{n} coming soon)\n"
            f"  - Describe the '{intent.topic} Series Graduate' badge for completing all {n} weeks\n"
            f"  - Encourage learners to start today"
        ),
        expected_output="Notification sent confirmation with recipient count.",
        agent=agents["engagement_coordinator"],
        context=[curriculum],
    )

    return Crew(
        agents=[
            agents["curriculum_designer"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[curriculum, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 3 — Sub-Courses (Beginner / Intermediate / Advanced)
# ══════════════════════════════════════════════════════════════════════════════

def _sub_courses_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:

    curriculum = Task(
        description=(
            f"Create a 3-level sub-course hierarchy for: {intent.topic}\n\n"
            "Create these 3 courses in order:\n\n"
            f"Course 1 — BEGINNER:\n"
            f"  1. create_course(title='{intent.topic} - Beginner Foundations', "
            f"description='Introduction to {intent.topic} for complete beginners')\n"
            f"  2. add_module × {intent.modules_per_course} — intro-level topics\n"
            "  3. publish_course — PUBLISH this one\n\n"
            f"Course 2 — INTERMEDIATE:\n"
            f"  1. create_course(title='{intent.topic} - Intermediate Skills', "
            f"description='Build on {intent.topic} fundamentals')\n"
            f"  2. add_module × {intent.modules_per_course} — core/intermediate topics\n"
            "  3. Do NOT publish — leave as draft\n\n"
            f"Course 3 — ADVANCED:\n"
            f"  1. create_course(title='{intent.topic} - Advanced Mastery', "
            f"description='Master {intent.topic} with advanced techniques')\n"
            f"  2. add_module × {intent.modules_per_course} — advanced topics\n"
            "  3. Do NOT publish — leave as draft\n\n"
            "IMPORTANT: Return all 3 course IDs with their level labels."
        ),
        expected_output=(
            "3 course IDs labeled beginner/intermediate/advanced. "
            "Beginner published. Intermediate and Advanced as drafts."
        ),
        agent=agents["curriculum_designer"],
    )

    quiz = Task(
        description=(
            "Generate leveled quizzes for all 3 sub-courses.\n\n"
            "For each course from the Curriculum Designer:\n"
            "  1. Call list_modules(course_id)\n"
            "  2. For each module call generate_quiz\n\n"
            "Difficulty per level:\n"
            f"  Beginner:     difficulty='easy',   num_questions={intent.quizzes_per_module}\n"
            f"  Intermediate: difficulty='medium',  num_questions={intent.quizzes_per_module}\n"
            f"  Advanced:     difficulty='hard',    num_questions={intent.quizzes_per_module}\n"
        ),
        expected_output="Quiz counts per level (beginner/intermediate/advanced), total questions.",
        agent=agents["quiz_expert"],
        context=[curriculum],
    )

    badge = Task(
        description=(
            f"Create 4 tier badges for the {intent.topic} sub-course hierarchy.\n\n"
            "1. Call list_badges() first\n"
            f"2. create_badge(course_id=<beginner_id>,     name='{intent.topic} Bronze',  "
            f"tier='completion', criteria='Complete {intent.topic} Beginner course')\n"
            f"3. create_badge(course_id=<intermediate_id>, name='{intent.topic} Silver',  "
            f"tier='completion', criteria='Complete {intent.topic} Intermediate course')\n"
            f"4. create_badge(course_id=<advanced_id>,     name='{intent.topic} Gold',    "
            f"tier='excellence', criteria='Complete {intent.topic} Advanced with 85%+')\n"
            f"5. create_badge(course_id=<beginner_id>,     name='{intent.topic} Master',  "
            f"tier='series',     criteria='Complete all 3 {intent.topic} levels')\n"
        ),
        expected_output="4 badges: Bronze, Silver, Gold, Master — all IDs returned.",
        agent=agents["badge_specialist"],
        context=[curriculum],
    )

    engage = Task(
        description=(
            f"Send learning path launch notification.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: '🎓 {intent.topic} Learning Path: 3 Levels Now Available'\n"
            f"Message: Explain the Beginner→Intermediate→Advanced progression, "
            f"describe the Bronze/Silver/Gold/Master badge tier system, "
            f"note that Beginner is live now and other levels unlock progressively."
        ),
        expected_output="Notification sent confirmation.",
        agent=agents["engagement_coordinator"],
        context=[curriculum],
    )

    return Crew(
        agents=[
            agents["curriculum_designer"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[curriculum, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 4 — Multiple Independent Courses
# ══════════════════════════════════════════════════════════════════════════════

def _multiple_courses_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    n = intent.num_items

    design = Task(
        description=(
            f"Create {n} independent courses based on: {message}\n\n"
            f"For EACH of the {n} courses, complete this full flow:\n"
            "  1. create_course(unique title, description, skill_tags)\n"
            f"  2. add_module × {intent.modules_per_course} with relevant titles\n"
            "  3. publish_course\n\n"
            f"Each course should be on a distinct but related topic "
            f"(all related to: {intent.topic}).\n\n"
            f"IMPORTANT: Return ALL {n} course IDs in your final output."
        ),
        expected_output=f"List of {n} course IDs, all published, with titles.",
        agent=agents["course_architect"],
    )

    quiz = Task(
        description=(
            f"Generate quizzes for ALL {n} courses.\n\n"
            "For each course ID from the Course Architect:\n"
            "  1. Call list_modules(course_id)\n"
            f"  2. For each module: generate_quiz with num_questions={intent.quizzes_per_module}, "
            f"difficulty='medium'\n"
            "Cover all courses and all modules."
        ),
        expected_output=f"Total questions generated across {n} courses.",
        agent=agents["quiz_expert"],
        context=[design],
    )

    badge = Task(
        description=(
            f"Create 1 completion badge per course ({n} badges total).\n\n"
            "1. Call list_badges() first\n"
            f"2. For each course_id: create_badge(name='[CourseTitle] Graduate', "
            f"tier='completion', criteria='Complete all modules with 70%+')\n"
        ),
        expected_output=f"{n} completion badges created with IDs.",
        agent=agents["badge_specialist"],
        context=[design],
    )

    return Crew(
        agents=[
            agents["course_architect"],
            agents["quiz_expert"],
            agents["badge_specialist"],
        ],
        tasks=[design, quiz, badge],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 5 — Quiz Only
# ══════════════════════════════════════════════════════════════════════════════

def _quiz_only_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:

    course_ref = (
        f"Use course_id: {intent.existing_course_id}"
        if intent.existing_course_id
        else "Call list_courses() to find the relevant course first."
    )

    quiz = Task(
        description=(
            f"Generate quiz questions based on: {message}\n\n"
            f"{course_ref}\n\n"
            "Your steps:\n"
            "1. Get or find the course_id\n"
            "2. Call list_modules(course_id) to get all modules\n"
            f"3. For EACH module: call generate_quiz with "
            f"num_questions={intent.quizzes_per_module}\n\n"
            "Cover every module."
        ),
        expected_output="Questions generated per module, total count.",
        agent=agents["quiz_expert"],
    )

    return Crew(
        agents=[agents["quiz_expert"]],
        tasks=[quiz],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 6 — Badge Only
# ══════════════════════════════════════════════════════════════════════════════

def _badge_only_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:

    course_ref = (
        f"Use course_id: {intent.existing_course_id}"
        if intent.existing_course_id
        else "Call list_courses() to find the relevant courses first."
    )

    badge = Task(
        description=(
            f"Design badges based on: {message}\n\n"
            "Your steps:\n"
            "1. Call list_badges() to see existing badges\n"
            f"2. {course_ref}\n"
            "3. Create meaningful badges with clear criteria and appropriate tiers\n"
            "4. Use get_course() to read the exact course title before naming badges"
        ),
        expected_output="Badges created with names, IDs, and criteria.",
        agent=agents["badge_specialist"],
    )

    return Crew(
        agents=[agents["badge_specialist"]],
        tasks=[badge],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 7 — YouTube Course (ingests YouTube URLs → real video titles)
# ══════════════════════════════════════════════════════════════════════════════

def _youtube_course_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    urls_block = "\n".join(f"  {i+1}. {u}" for i, u in enumerate(intent.urls))
    num_urls   = len(intent.urls)

    # ── Task 1: Course Architect creates the empty course shell ────────────────
    # Splitting course creation from module ingestion ensures create_course
    # is always called before any YouTube metadata fetch.
    create = Task(
        description=(
            f"Create an empty course shell for the YouTube-based '{intent.topic}' content.\n\n"
            f"Admin request: {message}\n\n"
            "Your ONLY job here — call create_course immediately:\n\n"
            "  create_course(\n"
            f"    title='<creative title based on \"{intent.topic}\" from the admin conversation>',\n"
            f"    description='A video course about {intent.topic} built from curated YouTube content.',\n"
            f"    skill_tags='{intent.topic}'\n"
            "  )\n\n"
            "DO NOT call publish_course. DO NOT add any modules. DO NOT call fetch_youtube_metadata.\n"
            "Just create_course and return the course_id."
        ),
        expected_output=(
            "Course ID (UUID) and course title. Example: \"Course ID: abc-123, Title: Python Mastery\""
        ),
        agent=agents["course_architect"],
    )

    # ── Task 2: Content Ingestion Specialist adds modules from YouTube URLs ────
    ingest = Task(
        description=(
            f"Add {num_urls} YouTube video module(s) to the course created above.\n\n"
            f"YouTube URLs to process:\n{urls_block}\n\n"
            "Step 1 — Get the course_id from the Course Architect's output above.\n\n"
            "Step 2 — For EACH YouTube URL listed above:\n"
            "   a. Call fetch_youtube_metadata(url) → get real title, embed_url, duration_secs\n"
            "   b. Call add_module_with_content(\n"
            "        course_id=<course_id from Step 1>,\n"
            "        title=<real YouTube title from fetch result>,\n"
            "        content_type='youtube_embed',\n"
            "        content_url=<embed_url from fetch result>,\n"
            "        duration_secs=<duration from fetch result>\n"
            "      )\n"
            "   NEVER invent titles. Use the real title returned by fetch_youtube_metadata.\n\n"
            "Step 3 — Call publish_course(course_id)\n\n"
            "Your Final Answer MUST include:\n"
            "  Course ID: <uuid>\n"
            "  Modules added: <count>\n"
            "  Titles: <list of real YouTube titles>\n"
            "  Published: yes"
        ),
        expected_output=(
            f"Course ID, {num_urls} modules with real YouTube titles and durations, published confirmation."
        ),
        agent=agents["content_ingestion_specialist"],
        context=[create],
    )

    quiz = Task(
        description=(
            "Generate quiz questions for the YouTube course.\n\n"
            "1. Get the course_id from the previous tasks' output\n"
            "2. Call list_modules(course_id) to get all module IDs\n"
            f"3. For EACH module: call generate_quiz with "
            f"num_questions={intent.quizzes_per_module}, difficulty='medium', "
            f"content_text=<module title>\n"
            "Cover ALL modules."
        ),
        expected_output="Quiz questions per module, total count.",
        agent=agents["quiz_expert"],
        context=[ingest],
    )

    badge = Task(
        description=(
            "Create achievement badge for the YouTube course.\n\n"
            "1. Call list_badges() to check for duplicates\n"
            "2. Call get_course(course_id) for the exact title\n"
            f"3. create_badge(course_id, name='{intent.topic} Video Course Graduate', "
            f"tier='completion', criteria='Watch all {num_urls} video modules and pass quizzes')\n"
        ),
        expected_output="Badge name, ID, criteria.",
        agent=agents["badge_specialist"],
        context=[ingest],
    )

    engage = Task(
        description=(
            f"Send launch notification for the new YouTube-based '{intent.topic}' course.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: 'New Video Course Live: {intent.topic}'\n"
            f"Mention: {num_urls} curated YouTube videos, quizzes after each video, badge on completion."
        ),
        expected_output="Notification sent confirmation.",
        agent=agents["engagement_coordinator"],
        context=[ingest],
    )

    return Crew(
        agents=[
            agents["course_architect"],
            agents["content_ingestion_specialist"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[create, ingest, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 8 — Podcast Course (ingests RSS feed → episode per module)
# ══════════════════════════════════════════════════════════════════════════════

def _podcast_course_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    rss_url  = intent.urls[0] if intent.urls else ""
    max_eps  = max(intent.num_items, intent.modules_per_course)

    ingest = Task(
        description=(
            f"Create a course from a podcast RSS feed.\n\n"
            f"Admin request: {message}\n"
            f"RSS Feed URL: {rss_url}\n"
            f"Max episodes to include: {max_eps}\n\n"
            "Your STRICT workflow — follow exactly:\n"
            f"1. Call fetch_rss_episodes('{rss_url}', max_episodes={max_eps})\n"
            "   This returns: feed title + list of episodes with title, audio_url, duration_secs\n\n"
            "2. Call create_course(\n"
            "     title=<podcast feed title from step 1>,\n"
            "     description=<podcast description>,\n"
            f"     skill_tags='{intent.topic}'\n"
            "   )\n\n"
            "3. For EACH episode returned in step 1:\n"
            "   Call add_module_with_content(\n"
            "     course_id=<from step 2>,\n"
            "     title=<episode title>,\n"
            "     content_type='audio',\n"
            "     content_url=<episode audio_url>,\n"
            "     duration_secs=<episode duration_secs>\n"
            "   )\n\n"
            "4. publish_course(course_id)\n\n"
            "IMPORTANT: Use real podcast/episode titles. Return course_id and all module IDs."
        ),
        expected_output=(
            f"Course ID, {max_eps} audio modules with real podcast episode titles, published."
        ),
        agent=agents["content_ingestion_specialist"],
    )

    quiz = Task(
        description=(
            "Generate quiz questions for the podcast course based on episode titles.\n\n"
            "1. Extract course_id from Content Ingestion Specialist's output\n"
            "2. Call list_modules(course_id)\n"
            f"3. For EACH module: generate_quiz(content_text=<episode_title>, "
            f"num_questions={intent.quizzes_per_module}, difficulty='medium')\n"
        ),
        expected_output="Quiz counts per episode module.",
        agent=agents["quiz_expert"],
        context=[ingest],
    )

    badge = Task(
        description=(
            "Create completion badge for the podcast course.\n\n"
            "1. list_badges() — check for duplicates\n"
            "2. get_course(course_id) — get the exact podcast title\n"
            f"3. create_badge(course_id, name='{intent.topic} Podcast Graduate', "
            f"tier='completion', criteria='Listen to all {max_eps} episodes')\n"
        ),
        expected_output="Badge created with name and ID.",
        agent=agents["badge_specialist"],
        context=[ingest],
    )

    engage = Task(
        description=(
            f"Send launch notification for the podcast course.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: 'New Podcast Course Live: {intent.topic}'\n"
            f"Mention: {max_eps} podcast episodes as audio modules with quizzes, badge on completion."
        ),
        expected_output="Notification sent.",
        agent=agents["engagement_coordinator"],
        context=[ingest],
    )

    return Crew(
        agents=[
            agents["content_ingestion_specialist"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[ingest, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 9 — Drip Schedule (auto-publish at intervals, Week 1 live immediately)
# ══════════════════════════════════════════════════════════════════════════════

def _drip_schedule_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:
    n    = intent.num_items
    days = intent.drip_days_interval

    curriculum = Task(
        description=(
            f"Create a {n}-week drip course series on: {intent.topic}\n\n"
            f"Admin request: {message}\n"
            f"Release interval: every {days} days\n\n"
            f"For EACH of the {n} weeks, do this complete flow:\n\n"
            "WEEK 1 (publish immediately):\n"
            f"  1. create_course(title='{intent.topic} - Week 1: [Subtopic]', "
            f"description='Week 1 of {n}', skill_tags='{intent.topic}')\n"
            f"  2. add_module × {intent.modules_per_course} with week 1 topics\n"
            "  3. publish_course(course_id)  ← publish week 1 immediately\n\n"
            f"WEEKS 2 through {n} (drip schedule — DO NOT publish):\n"
            f"  For Week N (N=2 to {n}):\n"
            f"  1. create_course(title='{intent.topic} - Week N: [Subtopic]', ...)\n"
            f"  2. add_module × {intent.modules_per_course}\n"
            "  3. schedule_course_release(course_id, release_days_from_now=(N-1)*{days})\n"
            "     — NEVER call publish_course for weeks 2+. Use schedule_course_release only.\n\n"
            "Release schedule:\n"
            + "\n".join(
                f"  - Week {i+1}: {'NOW (published)' if i == 0 else f'in {i*days} days'}"
                for i in range(n)
            )
            + f"\n\nIMPORTANT: Return ALL {n} course IDs with their release dates."
        ),
        expected_output=(
            f"Week 1 published immediately. "
            f"Weeks 2-{n} scheduled at {days}-day intervals. "
            f"All {n} course IDs with scheduled release dates."
        ),
        agent=agents["drip_curriculum_designer"],
    )

    quiz = Task(
        description=(
            f"Generate quizzes for all {n} drip courses.\n\n"
            "For each course ID from the Drip Curriculum Designer:\n"
            "  1. list_modules(course_id)\n"
            f"  2. For each module: generate_quiz with num_questions={intent.quizzes_per_module}\n\n"
            "Difficulty progression:\n"
            "  - Weeks 1-2: 'easy'\n"
            f"  - Middle weeks: 'medium'\n"
            f"  - Final week {n}: 'hard'\n"
        ),
        expected_output=f"Quiz counts per week, total across all {n} courses.",
        agent=agents["quiz_expert"],
        context=[curriculum],
    )

    badge = Task(
        description=(
            f"Create weekly badges + series graduation badge for {n}-week drip series.\n\n"
            "1. list_badges() first\n"
            f"2. For each week 1-{n}: create_badge(name='{intent.topic} Week N Scholar', "
            f"tier='completion', criteria='Complete Week N')\n"
            f"3. Series graduation: create_badge(name='{intent.topic} Drip Series Graduate', "
            f"tier='series', criteria='Complete all {n} weeks')\n"
        ),
        expected_output=f"{n} weekly badges + 1 series badge.",
        agent=agents["badge_specialist"],
        context=[curriculum],
    )

    engage = Task(
        description=(
            f"Send drip series launch notification.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: '{intent.topic} {n}-Week Learning Series — Week 1 Live!'\n"
            f"Message: Week 1 is live now. Weeks 2-{n} will auto-release every {days} days. "
            f"No admin action needed. Describe the graduation badge for completing all {n} weeks."
        ),
        expected_output="Notification sent with drip schedule summary.",
        agent=agents["engagement_coordinator"],
        context=[curriculum],
    )

    return Crew(
        agents=[
            agents["drip_curriculum_designer"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[curriculum, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CREW 10 — Learning Path (Beginner→Intermediate→Advanced with prerequisites)
# ══════════════════════════════════════════════════════════════════════════════

def _learning_path_crew(intent: WorkflowIntent, agents: dict, message: str) -> Crew:

    curriculum = Task(
        description=(
            f"Create a full Learning Path for: {intent.topic}\n\n"
            f"Admin request: {message}\n\n"
            "Your STRICT workflow:\n\n"
            "STEP 1 — Create 3 leveled courses:\n\n"
            f"Course A (BEGINNER):\n"
            f"  1. create_course(title='{intent.topic} - Beginner Foundations', "
            f"description='Introduction to {intent.topic} for beginners')\n"
            f"  2. add_module × {intent.modules_per_course} — beginner-friendly topics\n"
            "  3. publish_course(beginner_course_id)  ← PUBLISH this one\n\n"
            f"Course B (INTERMEDIATE):\n"
            f"  1. create_course(title='{intent.topic} - Intermediate Skills', ...)\n"
            f"  2. add_module × {intent.modules_per_course} — intermediate topics\n"
            "  3. Do NOT publish — leave as draft\n\n"
            f"Course C (ADVANCED):\n"
            f"  1. create_course(title='{intent.topic} - Advanced Mastery', ...)\n"
            f"  2. add_module × {intent.modules_per_course} — advanced topics\n"
            "  3. Do NOT publish — leave as draft\n\n"
            "STEP 2 — Create the Learning Path:\n"
            "  create_learning_path(\n"
            f"    title='{intent.topic} Complete Learning Path',\n"
            f"    description='Progressive {intent.topic} track from beginner to advanced',\n"
            "    course_ids='<beginner_id>,<intermediate_id>,<advanced_id>',\n"
            f"    skill_tags='{intent.topic}'\n"
            "  )\n"
            "  This auto-wires prerequisites: Beginner→Intermediate→Advanced.\n\n"
            "IMPORTANT: Return learning path ID, all 3 course IDs with level labels."
        ),
        expected_output=(
            "Learning path ID. 3 courses: Beginner (published), "
            "Intermediate (draft, requires Beginner), Advanced (draft, requires Intermediate). "
            "Prerequisite chain confirmed."
        ),
        agent=agents["path_curriculum_designer"],
    )

    quiz = Task(
        description=(
            "Generate leveled quizzes for all 3 courses in the learning path.\n\n"
            "For each course from the Learning Path Architect:\n"
            "  1. list_modules(course_id)\n"
            "  2. For each module: generate_quiz with appropriate difficulty\n\n"
            "Difficulty by level:\n"
            f"  Beginner:     difficulty='easy',   num_questions={intent.quizzes_per_module}\n"
            f"  Intermediate: difficulty='medium',  num_questions={intent.quizzes_per_module}\n"
            f"  Advanced:     difficulty='hard',    num_questions={intent.quizzes_per_module}\n"
        ),
        expected_output="Quiz counts per level (beginner/intermediate/advanced), total questions.",
        agent=agents["quiz_expert"],
        context=[curriculum],
    )

    badge = Task(
        description=(
            f"Create 4-tier badge system for {intent.topic} Learning Path.\n\n"
            "1. list_badges() — check for duplicates\n"
            f"2. create_badge(beginner_id,     '{intent.topic} Bronze',  'completion', 'Complete Beginner')\n"
            f"3. create_badge(intermediate_id, '{intent.topic} Silver',  'completion', 'Complete Intermediate')\n"
            f"4. create_badge(advanced_id,     '{intent.topic} Gold',    'excellence', 'Complete Advanced with 85%+')\n"
            f"5. create_badge(beginner_id,     '{intent.topic} Master',  'series',     'Complete all 3 levels')\n"
        ),
        expected_output="4 badges: Bronze, Silver, Gold, Master — all IDs.",
        agent=agents["badge_specialist"],
        context=[curriculum],
    )

    engage = Task(
        description=(
            f"Send learning path launch notification.\n\n"
            "Recipient: admin@lms.local\n"
            f"Subject: '{intent.topic} Learning Path: Beginner to Advanced'\n"
            f"Message: Explain the 3-level progression (Beginner→Intermediate→Advanced). "
            f"Mention prerequisite gating — learners unlock each level after completing the previous. "
            f"Describe the Bronze/Silver/Gold/Master badge tier system. "
            f"Beginner is live now."
        ),
        expected_output="Notification sent.",
        agent=agents["engagement_coordinator"],
        context=[curriculum],
    )

    return Crew(
        agents=[
            agents["path_curriculum_designer"],
            agents["quiz_expert"],
            agents["badge_specialist"],
            agents["engagement_coordinator"],
        ],
        tasks=[curriculum, quiz, badge, engage],
        process=Process.sequential,
        verbose=True,
    )
