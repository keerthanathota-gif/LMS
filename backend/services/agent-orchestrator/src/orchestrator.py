"""
LMS Agent Orchestrator — Direct Build Edition
==============================================
Uses direct Azure OpenAI calls for Q&A stages, then builds courses
via direct httpx API calls (no CrewAI tool-calling — avoids Azure GPT hallucination).

Flow:
  1. detect_intent()   — classifies admin request
  2. Stages 1-4        — interactive Q&A via direct Azure LLM calls
  3. _build_directly() — creates course/quizzes/badges via direct httpx to services
"""

import os
import re
import json
import asyncio
from queue import Queue, Empty
from typing import AsyncIterator

from crewai import LLM

from .tools import set_ctx
from .agents import make_agents
from .crews import detect_intent, route_to_crew


# ── Service URLs (also used in direct-build path) ─────────────────────────────

_COURSE_SVC  = lambda: os.getenv("COURSE_SERVICE_URL",         "http://course-service:3002")
_QUIZ_SVC    = lambda: os.getenv("QUIZ_SERVICE_URL",           "http://quiz-engine:3004")
_BADGE_SVC   = lambda: os.getenv("BADGE_SERVICE_URL",         "http://badge-engine:3005")
_CERT_SVC    = lambda: os.getenv("CERT_SERVICE_URL",          "http://certificate-engine:3006")
_NOTIFY_SVC  = lambda: os.getenv("NOTIFICATION_SERVICE_URL",  "http://notification-service:3007")
_CONTENT_SVC = lambda: os.getenv("CONTENT_SERVICE_URL",       "http://content-service:3003")


def _fetch_youtube_info(url: str) -> dict:
    """Fetch real YouTube video metadata from the content-service."""
    import httpx
    try:
        r = httpx.post(
            f"{_CONTENT_SVC()}/content/youtube",
            json={"url": url, "course_id": "preview"},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json().get("data", r.json())
    except Exception:
        pass
    return {}


def extract_urls_from_message(message: str) -> tuple[list[str], str]:
    youtube_pattern = r'https?://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)[\w\-]+'
    rss_pattern     = r'https?://\S+(?:/rss|/feed|\.rss|\.xml)\S*'
    youtube_urls = re.findall(youtube_pattern, message)
    rss_urls     = re.findall(rss_pattern, message)
    if youtube_urls:
        return youtube_urls, "youtube_urls"
    if rss_urls:
        return rss_urls, "rss_feed"
    return [], ""


# ── Stage prompts (4-stage Q&A) ───────────────────────────────────────────────

_STAGE1_COURSE_STRUCTURE = """\
You are a friendly, interactive LMS course designer having a natural conversation.
Admin's request: "{request}"
{video_info}
Prior conversation:
{history}

IMPORTANT RULES:
- If the admin asked a QUESTION in their latest message, ANSWER IT FIRST before anything else.
  For example: "where should I upload modules?" → explain the module upload process clearly.
- If this is the FIRST message, introduce yourself and ask about their course vision.
- Be CONVERSATIONAL — like Claude or ChatGPT, not a form. Respond to what they actually said.
- Do NOT skip ahead to quizzes/badges/certificates. Stay focused on course structure.

If this is the first interaction (no prior conversation), respond warmly (max 200 words):
1. Show genuine excitement about their topic/video (1 sentence — name the actual content)
2. Suggest ONE creative course name
3. Ask these questions naturally in flowing paragraphs:
   - Who are the target learners? (suggest 2 options)
   - How many modules do you plan? (suggest a number based on content)
   - Will you upload all modules now, or add them over time? (weekly? monthly?)
   - What category/skill tags fit best? (suggest 2-3)
4. End with: "Tell me more and I'll help you plan the perfect structure!"

If continuing a conversation, RESPOND TO WHAT THEY SAID — answer their question, acknowledge their \
answer, ask a follow-up. Be genuinely helpful and interactive.

Tone: warm, natural, conversational — like talking to a knowledgeable friend. NOT a checklist."""

_STAGE2_QUIZ_DESIGN = """\
You are an expert LMS assessment designer having a natural conversation.
Conversation so far:
{history}

Admin's latest message: "{request}"

IMPORTANT: If the admin asked a QUESTION, ANSWER IT FIRST. Be helpful and conversational.
If they answered your previous questions, acknowledge and move forward.

Write a focused response (max 200 words):
1. If they asked something → answer it clearly and helpfully
2. Acknowledge their course structure in ONE specific sentence
3. Suggest 2–3 quiz placements tied to the module flow:
   - Name the module AND why that placement makes sense
   - Include a final mastery quiz
4. Ask: "Should I auto-generate questions or do you have custom ones?"
5. Ask: "Any specific concepts or common mistakes to test on?"
6. End with: "Tell me and we'll design the badge next!"

Be specific to THEIR topic. Sound genuine and conversational — like a helpful colleague."""

_STAGE3_BADGE_DESIGN = """\
You are a creative gamification designer having a natural conversation.
Conversation so far:
{history}

Admin's latest message: "{request}"

IMPORTANT: If the admin asked a QUESTION, ANSWER IT FIRST. Be helpful.

Write a creative response (max 180 words):
1. If they asked something → answer it first
2. Confirm quiz plan briefly
3. Suggest 3 badge options specific to their topic:
   - COMPLETION: Catchy name + criteria (complete all modules, 70%+ quiz)
   - EXCELLENCE: Elite name + criteria (90%+ all quizzes)
   - WILDCARD: Fun creative name
4. Ask: "Which badge name speaks to you?"
5. End: "One last thing — the certificate!"

Be conversational and responsive to what they actually said."""

_STAGE4_CERTIFICATE = """\
You are an LMS course designer about to build something amazing.
Conversation so far:
{history}

Admin's latest message: "{request}"

IMPORTANT: If the admin asked a QUESTION, ANSWER IT FIRST.

Write a confident response (max 220 words):
1. If they asked something → answer it first
2. Confirm badge choice enthusiastically
3. Give a FULL BUILD SUMMARY as a clean bullet list:
   • Course: [title], [structure], [# modules], [audience]
   • Quizzes: [placements], [AI/custom]
   • Badge(s): [name(s)] — [criteria]
   • Module plan: [how many now, future uploads if mentioned]
4. Ask about certificate: "Should I include a Certificate of Completion?"
5. End: "Say YES and I'll start building! You can always add more modules later through \
the chat — just say 'add a module to [course name]'."

Be specific, confident, and remind them about the add-module feature."""

DIRECT_LLM_STAGES = {
    "needs_clarification": _STAGE1_COURSE_STRUCTURE,
    "clarify_quiz":        _STAGE2_QUIZ_DESIGN,
    "clarify_badge":       _STAGE3_BADGE_DESIGN,
    "clarify_certificate": _STAGE4_CERTIFICATE,
}




def _find_course_by_name(org_id: str, name_hint: str) -> tuple[str, str]:
    """Find a course by fuzzy title match. Returns (course_id, course_title) or ('', '')."""
    import httpx
    from difflib import SequenceMatcher
    try:
        r = httpx.get(f"{_COURSE_SVC()}/courses", params={"orgId": org_id, "limit": "100"}, timeout=15)
        courses = r.json().get("data", [])
    except Exception:
        return ("", "")
    if not courses:
        return ("", "")
    hint_lower = name_hint.lower().strip()
    best_id, best_title, best_score = "", "", 0.0
    for c in courses:
        title = c.get("title", "")
        score = SequenceMatcher(None, hint_lower, title.lower()).ratio()
        if hint_lower in title.lower():
            score = max(score, 0.7)
        if score > best_score:
            best_id, best_title, best_score = c.get("id", ""), title, score
    return (best_id, best_title) if best_score >= 0.35 else ("", "")


def _add_module_directly(
    intent, enriched_request: str, org_id: str, user_id: str,
    urls: list[str], content_source: str, queue: Queue, az_client, az_deploy: str,
) -> None:
    """Add module(s) to an existing course via direct httpx calls."""
    import httpx

    # ── Find course ─────────────────────────────────────────────────────────
    _emit_tool(queue, "find_course", "Finding your course...", "running")
    course_id, course_title = "", ""

    if intent.existing_course_id:
        try:
            r = httpx.get(f"{_COURSE_SVC()}/courses/{intent.existing_course_id}", timeout=15)
            if r.status_code == 200:
                d = r.json().get("data", {})
                course_id, course_title = d.get("id", ""), d.get("title", "")
        except Exception:
            pass

    if not course_id and intent.notes:
        course_id, course_title = _find_course_by_name(org_id, intent.notes)
    if not course_id:
        course_id, course_title = _find_course_by_name(org_id, intent.topic)

    if not course_id:
        _emit_tool(queue, "find_course", "Course not found", "error", "")
        _emit_tokens(queue, "I couldn't find that course. Could you tell me the exact course name or paste its ID?")
        return

    _emit_tool(queue, "find_course", f"Found: '{course_title}'", "success", f"ID: {course_id}")

    # ── Add modules ─────────────────────────────────────────────────────────
    module_ids, module_names = [], []

    if content_source == "youtube_urls" and urls:
        for url in urls:
            _emit_tool(queue, "fetch_youtube", "Fetching video metadata...", "running")
            try:
                meta = httpx.post(f"{_CONTENT_SVC()}/content/youtube",
                                  json={"url": url, "course_id": "preview"}, timeout=30).json().get("data", {})
                yt_title  = meta.get("title") or f"Video: {url}"
                embed_url = meta.get("embed_url") or url
                duration  = meta.get("duration") or 0
                _emit_tool(queue, "fetch_youtube", f"Got: '{yt_title}'", "success", "")
                mod_r = httpx.post(f"{_COURSE_SVC()}/courses/{course_id}/modules", json={
                    "title": yt_title, "contentType": "youtube_embed", "contentUrl": embed_url,
                    "sourceType": "youtube_embed", "durationSecs": duration, "processingStatus": "ready",
                }, timeout=30)
                mod_id = mod_r.json().get("data", {}).get("id", "")
                if mod_id:
                    module_ids.append(mod_id); module_names.append(yt_title)
                    _emit_tool(queue, "add_module", f"Added: '{yt_title}'", "success", "")
            except Exception as e:
                _emit_tool(queue, "add_module", "Error adding video module", "error", str(e))
    else:
        _emit_tool(queue, "ai_planning", "Planning module details...", "running")
        try:
            resp = az_client.chat.completions.create(model=az_deploy, messages=[{"role": "user", "content":
                f'Return ONLY JSON: {{"module_title":"specific title"}}\nRequest: {enriched_request}\nCourse: {course_title}'}],
                max_tokens=200, temperature=0.5)
            raw = re.sub(r"```(?:json)?\s*|\s*```", "", (resp.choices[0].message.content or "{}")).strip()
            plan = json.loads(raw)
        except Exception:
            plan = {"module_title": intent.topic or "New Module"}
        mod_title = plan.get("module_title") or "New Module"
        _emit_tool(queue, "ai_planning", f"Module: '{mod_title}'", "success", "")
        try:
            mod_r = httpx.post(f"{_COURSE_SVC()}/courses/{course_id}/modules",
                               json={"title": mod_title, "contentType": "text", "sourceType": "text"}, timeout=30)
            mod_id = mod_r.json().get("data", {}).get("id", "")
            if mod_id:
                module_ids.append(mod_id); module_names.append(mod_title)
                _emit_tool(queue, "add_module", f"Module added: '{mod_title}'", "success", "")
        except Exception as e:
            _emit_tool(queue, "add_module", "Error adding module", "error", str(e))

    if not module_ids:
        _emit_tokens(queue, "Something went wrong adding the module. Please try again.")
        return

    # ── Generate quizzes ────────────────────────────────────────────────────
    for mod_id, mod_title in zip(module_ids, module_names):
        _emit_tool(queue, "generate_quiz", f"Generating quiz for '{mod_title[:40]}'...", "running")
        try:
            httpx.post(f"{_QUIZ_SVC()}/quiz/generate", json={
                "courseId": course_id, "moduleId": mod_id, "contentText": mod_title, "numQuestions": 5,
            }, timeout=60)
            _emit_tool(queue, "generate_quiz", f"Quiz ready for '{mod_title[:40]}'", "success", "")
        except Exception as e:
            _emit_tool(queue, "generate_quiz", "Quiz generation failed", "error", str(e))

    n = len(module_ids)
    summary = (
        f"✅ Added {n} module{'s' if n != 1 else ''} to **{course_title}**!\n\n"
        + "".join(f"• {name}\n" for name in module_names)
        + f"\nQuizzes generated for {'all' if n > 1 else 'the'} new module{'s' if n != 1 else ''}."
    )
    _emit_tokens(queue, summary)


def _edit_course_directly(
    intent, enriched_request: str, org_id: str, user_id: str,
    urls: list[str], content_source: str, queue: Queue, az_client, az_deploy: str,
) -> None:
    """Edit an existing course — context-aware, handles delete/edit/add operations."""
    import httpx

    # ── Find the course ─────────────────────────────────────────────────────
    _emit_tool(queue, "find_course", "Loading course details...", "running")
    course_id, course_title = "", ""

    if intent.existing_course_id:
        try:
            r = httpx.get(f"{_COURSE_SVC()}/courses/{intent.existing_course_id}", timeout=15)
            if r.status_code == 200:
                d = r.json().get("data", {})
                course_id, course_title = d.get("id", ""), d.get("title", "")
        except Exception:
            pass

    if not course_id and intent.notes:
        course_id, course_title = _find_course_by_name(org_id, intent.notes)
    if not course_id:
        course_id, course_title = _find_course_by_name(org_id, intent.topic)

    if not course_id:
        _emit_tool(queue, "find_course", "Course not found", "error", "")
        _emit_tokens(queue, "I couldn't find that course. Could you tell me the exact course name or paste its ID?")
        return

    # Fetch full course details
    try:
        detail_r = httpx.get(f"{_COURSE_SVC()}/courses/{course_id}", timeout=15)
        course_data = detail_r.json().get("data", {})
    except Exception:
        course_data = {}

    modules = course_data.get("modules", [])
    module_list = "\n".join(
        f"  {i+1}. [{m.get('id', '?')[:8]}] {m.get('title', 'Untitled')} ({m.get('contentType', 'text')})"
        for i, m in enumerate(modules)
    )

    _emit_tool(queue, "find_course", f"Loaded: '{course_title}' ({len(modules)} modules)", "success", "")

    # ── Ask AI what action to take ──────────────────────────────────────────
    _emit_tool(queue, "ai_planning", "Understanding your request...", "running")

    action_prompt = f"""You are an LMS course editor. The admin wants to modify an existing course.

Course: "{course_title}" (ID: {course_id})
Current modules:
{module_list or "  (no modules)"}
Description: {course_data.get('description', 'N/A')[:200]}
Status: {course_data.get('status', 'unknown')}

Admin's request: {enriched_request}

Determine what action to take. Return ONLY JSON (no fences):
{{
  "action": "<one of: delete_module | add_module | edit_title | edit_description | regenerate_quiz | reorder_modules | general_response>",
  "module_index": <0-based index of module to act on, or -1 if N/A>,
  "module_id": "<module UUID if acting on specific module, or empty>",
  "new_value": "<new title/description text if editing, or module title if adding>",
  "explanation": "<1-2 sentence explanation of what you'll do>"
}}

Rules:
- If user says "delete module 3" or "remove the second module" → action=delete_module, module_index=2 or 1
- If user says "change title to X" → action=edit_title, new_value=X
- If user says "add a module about Y" → action=add_module, new_value=Y
- If user says "regenerate quiz for module 2" → action=regenerate_quiz, module_index=1
- If you can't determine the action, use general_response and explain what options are available"""

    action = {}
    try:
        resp = az_client.chat.completions.create(
            model=az_deploy,
            messages=[{"role": "user", "content": action_prompt}],
            max_tokens=300, temperature=0.2,
        )
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", (resp.choices[0].message.content or "{}")).strip()
        action = json.loads(raw)
    except Exception:
        action = {"action": "general_response", "explanation": "I'll help you edit this course."}

    act = action.get("action", "general_response")
    explanation = action.get("explanation", "")
    _emit_tool(queue, "ai_planning", f"Action: {act}", "success", explanation)

    # ── Execute the action ──────────────────────────────────────────────────

    if act == "delete_module":
        mod_idx = action.get("module_index", -1)
        mod_id = action.get("module_id", "")
        if not mod_id and 0 <= mod_idx < len(modules):
            mod_id = modules[mod_idx].get("id", "")
        if mod_id:
            mod_title = next((m.get("title", "") for m in modules if m.get("id") == mod_id), "")
            _emit_tool(queue, "delete_module", f"Deleting '{mod_title[:40]}'...", "running")
            try:
                httpx.delete(f"{_COURSE_SVC()}/courses/{course_id}/modules/{mod_id}", timeout=15)
                _emit_tool(queue, "delete_module", f"Deleted: '{mod_title[:40]}'", "success", "")
                _emit_tokens(queue, f"✅ Deleted module **'{mod_title}'** from **{course_title}**.\n\nThe course now has {len(modules) - 1} modules.")
            except Exception as e:
                _emit_tool(queue, "delete_module", "Delete failed", "error", str(e))
                _emit_tokens(queue, f"Failed to delete the module: {e}")
        else:
            _emit_tokens(queue, "I couldn't identify which module to delete. Please specify the module number or name.")

    elif act == "edit_title":
        new_title = action.get("new_value", "")
        if new_title:
            _emit_tool(queue, "edit_course", f"Changing title to '{new_title[:40]}'...", "running")
            try:
                httpx.patch(f"{_COURSE_SVC()}/courses/{course_id}", json={"title": new_title}, timeout=15)
                _emit_tool(queue, "edit_course", "Title updated!", "success", "")
                _emit_tokens(queue, f"✅ Course title changed to **'{new_title}'**")
            except Exception as e:
                _emit_tokens(queue, f"Failed to update title: {e}")
        else:
            _emit_tokens(queue, "What would you like to change the title to?")

    elif act == "edit_description":
        new_desc = action.get("new_value", "")
        if new_desc:
            _emit_tool(queue, "edit_course", "Updating description...", "running")
            try:
                httpx.patch(f"{_COURSE_SVC()}/courses/{course_id}", json={"description": new_desc}, timeout=15)
                _emit_tool(queue, "edit_course", "Description updated!", "success", "")
                _emit_tokens(queue, f"✅ Course description updated for **{course_title}**")
            except Exception as e:
                _emit_tokens(queue, f"Failed to update description: {e}")

    elif act == "add_module":
        new_mod_title = action.get("new_value", "New Module")
        _emit_tool(queue, "add_module", f"Adding '{new_mod_title[:40]}'...", "running")
        try:
            mod_r = httpx.post(f"{_COURSE_SVC()}/courses/{course_id}/modules",
                               json={"title": new_mod_title, "contentType": "text", "sourceType": "text"}, timeout=30)
            mod_id = mod_r.json().get("data", {}).get("id", "")
            _emit_tool(queue, "add_module", f"Added: '{new_mod_title[:40]}'", "success", "")
            # Generate quiz
            if mod_id:
                try:
                    httpx.post(f"{_QUIZ_SVC()}/quiz/generate", json={
                        "courseId": course_id, "moduleId": mod_id, "contentText": new_mod_title, "numQuestions": 5,
                    }, timeout=60)
                except Exception:
                    pass
            _emit_tokens(queue, f"✅ Added module **'{new_mod_title}'** to **{course_title}** with quiz questions.")
        except Exception as e:
            _emit_tokens(queue, f"Failed to add module: {e}")

    elif act == "regenerate_quiz":
        mod_idx = action.get("module_index", -1)
        mod_id = action.get("module_id", "")
        if not mod_id and 0 <= mod_idx < len(modules):
            mod_id = modules[mod_idx].get("id", "")
        if mod_id:
            mod_title = next((m.get("title", "") for m in modules if m.get("id") == mod_id), "Module")
            _emit_tool(queue, "regenerate_quiz", f"Regenerating quiz for '{mod_title[:40]}'...", "running")
            try:
                httpx.post(f"{_QUIZ_SVC()}/quiz/generate", json={
                    "courseId": course_id, "moduleId": mod_id, "contentText": mod_title, "numQuestions": 5,
                }, timeout=60)
                _emit_tool(queue, "regenerate_quiz", "Quiz regenerated!", "success", "")
                _emit_tokens(queue, f"✅ Regenerated quiz for **'{mod_title}'** with 5 new questions.")
            except Exception as e:
                _emit_tokens(queue, f"Failed to regenerate quiz: {e}")
        else:
            _emit_tokens(queue, "Which module should I regenerate the quiz for? Please specify the module number.")

    else:  # general_response
        # Give a helpful overview of what can be done
        summary = (
            f"Here's what I can help you edit on **{course_title}**:\n\n"
            f"**Current modules ({len(modules)}):**\n{module_list or '  (none)'}\n\n"
            f"You can ask me to:\n"
            f"• **Delete a module**: \"delete module 2\"\n"
            f"• **Add a module**: \"add a module about React hooks\"\n"
            f"• **Change the title**: \"rename this course to Python Pro\"\n"
            f"• **Update description**: \"change the description to ...\"\n"
            f"• **Regenerate quizzes**: \"regenerate quiz for module 3\"\n\n"
            f"What would you like to change?"
        )
        _emit_tokens(queue, summary)


def _general_chat(
    enriched_request: str, org_id: str, queue: Queue, az_client, az_deploy: str,
) -> None:
    """Handle general questions/conversation — fetch platform context and answer."""
    import httpx

    # Fetch platform context to give the LLM useful data
    context_parts = []
    try:
        r = httpx.get(f"{_COURSE_SVC()}/courses", params={"orgId": org_id, "limit": "20"}, timeout=10)
        courses = r.json().get("data", [])
        if courses:
            course_list = "\n".join(f"  - {c.get('title', '?')} ({c.get('status', '?')}, {c.get('module_count', 0)} modules)" for c in courses[:10])
            context_parts.append(f"Published courses:\n{course_list}")
    except Exception:
        pass

    try:
        r = httpx.get(f"{_COURSE_SVC()}/courses/analytics/overview", params={"orgId": org_id}, timeout=10)
        stats = r.json().get("data", {})
        if stats:
            context_parts.append(
                f"Platform stats: {stats.get('total_courses', 0)} courses, "
                f"{stats.get('total_enrollments', 0)} enrollments, "
                f"{stats.get('total_completions', 0)} completions, "
                f"completion rate: {stats.get('completion_rate', 0)}%"
            )
    except Exception:
        pass

    platform_context = "\n".join(context_parts) if context_parts else "(no data available yet)"

    prompt = f"""You are a helpful LMS assistant. The admin is asking a question or having a conversation.
Answer their question naturally, helpfully, and conversationally — like Claude or ChatGPT.

Platform context:
{platform_context}

Admin's message: {enriched_request}

Rules:
- Be conversational, friendly, and helpful
- If they ask about data (enrollments, courses, etc.), use the platform context above
- If they ask what you can do, explain: create courses (from YouTube/text/podcast), add modules,
  edit courses, generate quizzes, create badges, view analytics, manage users
- If they're just chatting, respond naturally
- If they want to create a course, tell them to describe what they want or paste a YouTube link
- Keep responses concise but informative (max 200 words)"""

    try:
        resp = az_client.chat.completions.create(
            model=az_deploy,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400, temperature=0.7,
        )
        result_text = resp.choices[0].message.content or "I'm here to help! Try asking me to create a course or paste a YouTube link."
        for i in range(0, len(result_text), 80):
            queue.put({"event": "token", "data": result_text[i: i + 80]})
    except Exception as e:
        queue.put({"event": "token", "data": f"Sorry, I encountered an error: {e}"})


def _emit_tool(queue: Queue, name: str, display: str, status: str, result: str = "") -> None:
    queue.put({
        "event": "tool_call",
        "data": json.dumps({
            "id":          f"{name}-step",
            "name":        name,
            "displayName": display,
            "status":      status,
            "result":      result,
        }),
    })


def _emit_tokens(queue: Queue, text: str) -> None:
    for i in range(0, len(text), 80):
        queue.put({"event": "token", "data": text[i: i + 80]})


def _build_course_directly(
    intent,
    enriched_request: str,
    org_id: str,
    user_id: str,
    urls: list[str],
    content_source: str,
    queue: Queue,
    az_client,
    az_deploy: str,
) -> None:
    """
    Build a course by calling services directly via httpx.
    NO CrewAI tool-calling — avoids the Azure GPT hallucination bug.

    Steps:
      1. Ask AI to plan course details (title, modules, badge, notification)
      2. POST /courses to create course shell
      3. Add modules (YouTube metadata fetch, RSS episodes, or AI-generated titles)
      4. PATCH /courses/:id/publish
      5. POST /quiz/generate for each module
      6. POST /badges to create completion badge
      7. POST /notifications/email for launch announcement
    """
    import httpx

    # ── Step 0: AI planning ────────────────────────────────────────────────────
    _emit_tool(queue, "ai_planning", "Planning course details...", "running")

    plan_prompt = f"""You are a professional LMS course designer (think Udemy/Coursera quality).
Based on this conversation:
{enriched_request}

Return a JSON object (ONLY JSON, no markdown fences) with:
{{
  "title": "creative course title",
  "subtitle": "one-line subtitle expanding on the title (like Udemy subtitles)",
  "description": "2-3 sentence compelling description",
  "category": "<MUST be one of: Web Development, Data Science, Business, Design, Marketing, DevOps, Security, Mobile Development, Cloud Computing, AI & Machine Learning, Finance, Healthcare, Language Learning, Personal Development>",
  "skill_tags": "comma-separated specific tags e.g. Python, Flask, REST APIs",
  "level": "<beginner | intermediate | advanced>",
  "what_you_learn": ["Outcome 1", "Outcome 2", "Outcome 3", "Outcome 4"],
  "target_audience": "1-2 sentence description of who this course is for",
  "prerequisites": "What learners need before starting (or 'None' for beginners)",
  "module_titles": ["Title 1", "Title 2", "..."],
  "badge_name": "catchy completion badge name",
  "notification_subject": "email subject for launch announcement",
  "notification_body": "2-paragraph plaintext email body"
}}

Rules:
- category: pick the BEST fit from the list above based on the topic
- what_you_learn: exactly 4 specific, actionable learning outcomes (start with a verb: "Build...", "Understand...", "Master...")
- module_titles: 5-7 specific titles for text courses; empty [] for YouTube/podcast courses
- badge_name: topic-specific, memorable (e.g. "Code Alchemist", "Neural Navigator")
- Use any badge names the admin mentioned in the conversation
- level: match what the admin said, default to beginner
- Title: creative but clear, like a top Udemy course"""

    plan: dict = {}
    try:
        plan_resp = az_client.chat.completions.create(
            model=az_deploy,
            messages=[{"role": "user", "content": plan_prompt}],
            max_tokens=600,
            temperature=0.7,
        )
        raw = plan_resp.choices[0].message.content or "{}"
        # Strip markdown fences if present
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()
        plan = json.loads(raw)
    except Exception as e:
        print(f"[build] AI planning failed: {e} — using defaults")

    course_title    = plan.get("title") or f"{intent.topic} Course"
    course_desc     = plan.get("description") or f"A comprehensive course on {intent.topic}."
    skill_tags_str  = plan.get("skill_tags") or intent.topic
    module_titles   = plan.get("module_titles") or []
    badge_name      = plan.get("badge_name") or f"{intent.topic} Graduate"
    notif_subject   = plan.get("notification_subject") or f"New Course Live: {course_title}"
    notif_body      = plan.get("notification_body") or f"Your new course '{course_title}' is now live!"
    tags            = [t.strip() for t in skill_tags_str.split(",") if t.strip()]

    # Udemy-style metadata from AI plan
    category        = plan.get("category") or (tags[0] if tags else "General")
    subtitle        = plan.get("subtitle") or ""
    level           = plan.get("level") or intent.level or "beginner"
    what_you_learn  = plan.get("what_you_learn") or []
    target_audience = plan.get("target_audience") or ""
    prerequisites   = plan.get("prerequisites") or "None"

    # Ensure category is the first tag (Udemy style)
    if category and category not in tags:
        tags.insert(0, category)

    _emit_tool(queue, "ai_planning", f"Plan ready: '{course_title}'", "success",
               f"Title: {course_title} | Category: {category} | Level: {level}")

    # ── Step 1: Create course shell ───────────────────────────────────────────
    _emit_tool(queue, "create_course", f"Creating course '{course_title}'...", "running")
    course_id: str = ""
    try:
        r = httpx.post(
            f"{_COURSE_SVC()}/courses",
            json={
                "title":        course_title,
                "description":  course_desc,
                "skillTags":    tags,
                "orgId":        org_id,
                "instructorId": user_id,
            },
            params={"schedule": "true"},
            timeout=30,
        )
        course_data = r.json().get("data", {})
        course_id   = course_data.get("id", "")
        if not course_id:
            raise ValueError(f"No course ID returned — status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        _emit_tool(queue, "create_course", "Course creation failed", "error", str(e))
        _emit_tokens(queue, f"❌ Could not create course: {e}")
        return

    _emit_tool(queue, "create_course", f"Course created: '{course_title}'", "success",
               f"✅ Course created: '{course_title}' (ID: {course_id})")

    # Emit the preview-activating event for the CoursePreview panel
    queue.put({
        "event": "tool_call",
        "data": json.dumps({
            "id":     "create-course-result",
            "name":   "create_course",
            "status": "success",
            "result": f"✅ Course created: '{course_title}' (ID: {course_id})",
        }),
    })

    # ── Step 1.5: Store Udemy-style metadata + auto-assign category ───────────
    try:
        # Look up the category by name from the DB
        cat_r = httpx.get(
            f"{_COURSE_SVC()}/categories/match",
            params={"name": category},
            timeout=10,
        )
        cat_match = cat_r.json().get("data")
        category_id = cat_match.get("id") if cat_match else None

        # PATCH course with category + rich metadata in one call
        patch_body: dict = {
            "metadata": {
                "subtitle":        subtitle,
                "level":           level,
                "what_you_learn":  what_you_learn,
                "target_audience": target_audience,
                "prerequisites":   prerequisites,
            },
        }
        if category_id:
            patch_body["categoryId"] = category_id

        httpx.patch(f"{_COURSE_SVC()}/courses/{course_id}", json=patch_body, timeout=15)
    except Exception:
        pass  # Non-critical — course still works without rich metadata

    # ── Step 2: Add modules ───────────────────────────────────────────────────
    module_ids:   list[str] = []
    module_names: list[str] = []

    if content_source == "youtube_urls" and urls:
        for url in urls:
            _emit_tool(queue, "fetch_youtube", f"Fetching metadata for video...", "running")
            try:
                meta_r = httpx.post(
                    f"{_CONTENT_SVC()}/content/youtube",
                    json={"url": url, "course_id": "preview"},
                    timeout=30,
                )
                meta     = meta_r.json().get("data", {})
                yt_title = meta.get("title") or f"Video: {url}"
                embed_url = meta.get("embed_url") or url
                duration  = meta.get("duration") or 0

                _emit_tool(queue, "fetch_youtube", f"Got title: '{yt_title}'", "success", "")

                mod_r = httpx.post(
                    f"{_COURSE_SVC()}/courses/{course_id}/modules",
                    json={
                        "title":            yt_title,
                        "contentType":      "youtube_embed",
                        "contentUrl":       embed_url,
                        "sourceType":       "youtube_embed",
                        "durationSecs":     duration,
                        "processingStatus": "ready",
                    },
                    timeout=30,
                )
                mod_data = mod_r.json().get("data", {})
                mod_id   = mod_data.get("id", "")
                if mod_id:
                    module_ids.append(mod_id)
                    module_names.append(yt_title)
                    _emit_tool(queue, "add_module", f"Module added: '{yt_title}'", "success", "")
                else:
                    _emit_tool(queue, "add_module", f"Failed to add module", "error",
                               mod_r.text[:200])
            except Exception as e:
                _emit_tool(queue, "add_module", f"Error adding YouTube module", "error", str(e))

    elif content_source == "rss_feed" and urls:
        _emit_tool(queue, "fetch_rss", "Fetching podcast episodes...", "running")
        try:
            rss_r    = httpx.post(
                f"{_CONTENT_SVC()}/content/rss",
                json={"url": urls[0], "max_episodes": 10},
                timeout=30,
            )
            rss_data = rss_r.json().get("data", {})
            episodes = rss_data.get("episodes", [])
            _emit_tool(queue, "fetch_rss", f"Found {len(episodes)} episodes", "success", "")

            for ep in episodes[:10]:
                ep_title  = ep.get("title") or "Episode"
                audio_url = ep.get("audio_url") or ""
                duration  = ep.get("duration_secs") or 0
                mod_r = httpx.post(
                    f"{_COURSE_SVC()}/courses/{course_id}/modules",
                    json={
                        "title":        ep_title,
                        "contentType":  "audio",
                        "contentUrl":   audio_url,
                        "sourceType":   "audio",
                        "durationSecs": duration,
                    },
                    timeout=30,
                )
                mod_data = mod_r.json().get("data", {})
                mod_id   = mod_data.get("id", "")
                if mod_id:
                    module_ids.append(mod_id)
                    module_names.append(ep_title)
        except Exception as e:
            _emit_tool(queue, "fetch_rss", "Error fetching RSS feed", "error", str(e))

    else:
        # Text course — use AI-generated module titles
        if not module_titles:
            module_titles = [f"Module {i+1}" for i in range(5)]

        for mod_title in module_titles:
            _emit_tool(queue, "add_module", f"Adding module: '{mod_title}'...", "running")
            try:
                mod_r = httpx.post(
                    f"{_COURSE_SVC()}/courses/{course_id}/modules",
                    json={
                        "title":       mod_title,
                        "contentType": "text",
                        "sourceType":  "text",
                    },
                    timeout=30,
                )
                mod_data = mod_r.json().get("data", {})
                mod_id   = mod_data.get("id", "")
                if mod_id:
                    module_ids.append(mod_id)
                    module_names.append(mod_title)
                    _emit_tool(queue, "add_module", f"Module added: '{mod_title}'", "success", "")
                else:
                    _emit_tool(queue, "add_module", f"Module add failed for '{mod_title}'", "error",
                               mod_r.text[:200])
            except Exception as e:
                _emit_tool(queue, "add_module", f"Error: '{mod_title}'", "error", str(e))

    # ── Step 2.5: Auto-set YouTube thumbnail ──────────────────────────────
    if content_source == "youtube_urls" and urls:
        vid_match = re.search(r'(?:v=|youtu\.be/)([\w-]+)', urls[0])
        if vid_match:
            thumb_url = f"https://img.youtube.com/vi/{vid_match.group(1)}/hqdefault.jpg"
            try:
                httpx.patch(f"{_COURSE_SVC()}/courses/{course_id}",
                            json={"thumbnailUrl": thumb_url}, timeout=15)
            except Exception:
                pass  # Non-critical

    # ── Step 3: Publish course ────────────────────────────────────────────────
    _emit_tool(queue, "publish_course", f"Publishing '{course_title}'...", "running")
    try:
        httpx.patch(f"{_COURSE_SVC()}/courses/{course_id}/publish", timeout=15)
        _emit_tool(queue, "publish_course", f"Course published!", "success",
                   f"✅ '{course_title}' is now live")
    except Exception as e:
        _emit_tool(queue, "publish_course", "Publish failed", "error", str(e))

    # ── Step 4: Generate quizzes + AI summaries ───────────────────────────────
    n = len(module_ids)
    for i, (mod_id, mod_title) in enumerate(zip(module_ids, module_names)):
        _emit_tool(queue, "generate_quiz",
                   f"Generating quiz for module {i+1}/{n}: '{mod_title[:40]}'...", "running")
        try:
            # Fetch module transcript/content for richer quiz generation
            content_for_quiz = mod_title
            try:
                mod_detail = httpx.get(f"{_COURSE_SVC()}/courses/{course_id}", timeout=15)
                mods = mod_detail.json().get("data", {}).get("modules", [])
                for m in mods:
                    if m.get("id") == mod_id and m.get("transcript"):
                        content_for_quiz = m["transcript"][:4000]  # Use actual transcript
                        break
            except Exception:
                pass

            difficulty = "easy" if i == 0 else ("hard" if i == n - 1 else "medium")
            qr = httpx.post(
                f"{_QUIZ_SVC()}/quiz/generate",
                json={
                    "courseId":     course_id,
                    "moduleId":     mod_id,
                    "contentText":  content_for_quiz,
                    "numQuestions": 5,
                },
                timeout=60,
            )
            count = qr.json().get("count", "?")
            _emit_tool(queue, "generate_quiz",
                       f"Quiz ready: {count} questions — '{mod_title[:40]}'", "success", "")

            # Generate AI summary for this module (non-blocking)
            try:
                summary_resp = az_client.chat.completions.create(
                    model=az_deploy,
                    messages=[{"role": "user", "content":
                        f"Write a concise 2-3 sentence summary of this module for learners. "
                        f"Module title: {mod_title}\n"
                        f"Content: {content_for_quiz[:2000]}"}],
                    max_tokens=150, temperature=0.3,
                )
                ai_summary = (summary_resp.choices[0].message.content or "").strip()
                if ai_summary:
                    httpx.patch(
                        f"{_COURSE_SVC()}/courses/{course_id}/modules/{mod_id}",
                        json={"aiSummary": ai_summary},
                        timeout=10,
                    )
            except Exception:
                pass  # Summary is non-critical
        except Exception as e:
            _emit_tool(queue, "generate_quiz", f"Quiz failed for module {i+1}", "error", str(e))

    # ── Step 5: Create completion badge ──────────────────────────────────────
    _emit_tool(queue, "create_badge", f"Creating badge '{badge_name}'...", "running")
    try:
        br = httpx.post(
            f"{_BADGE_SVC()}/badges",
            json={
                "name":        badge_name,
                "description": f"Awarded for completing '{course_title}'",
                "courseId":    course_id,
                "orgId":       org_id,
                "criteria":    "Complete all modules with 70%+ quiz pass rate",
                "skillTags":   ["completion"],
            },
            timeout=30,
        )
        badge_data = br.json().get("data", {})
        badge_id   = badge_data.get("id", "")
        _emit_tool(queue, "create_badge", f"Badge created: '{badge_name}'", "success",
                   f"✅ Badge '{badge_name}' (ID: {badge_id})")
    except Exception as e:
        _emit_tool(queue, "create_badge", "Badge creation failed", "error", str(e))

    # ── Step 5.5: Create certificate template ────────────────────────────────
    _emit_tool(queue, "create_cert", "Creating certificate template...", "running")
    try:
        cr = httpx.post(
            f"{_CERT_SVC()}/certificates/templates",
            json={
                "org_id":    org_id,
                "course_id": course_id,
                "criteria":  {"min_score": 70},
            },
            timeout=30,
        )
        cert_data = cr.json().get("data", {})
        cert_id   = cert_data.get("id", "")
        _emit_tool(queue, "create_cert", "Certificate template created!", "success",
                   f"✅ Certificate template ready (ID: {cert_id})")
    except Exception as e:
        _emit_tool(queue, "create_cert", "Certificate setup failed", "error", str(e))

    # ── Step 6: Send launch notification ─────────────────────────────────────
    _emit_tool(queue, "send_notification", "Sending launch notification...", "running")
    try:
        httpx.post(
            f"{_NOTIFY_SVC()}/notifications/email",
            json={
                "to":       ["admin@lms.local"],
                "subject":  notif_subject,
                "htmlBody": f"<p>{notif_body}</p>",
            },
            timeout=15,
        )
        _emit_tool(queue, "send_notification", "Notification sent!", "success", "")
    except Exception as e:
        _emit_tool(queue, "send_notification", "Notification failed", "error", str(e))

    # ── Final summary ─────────────────────────────────────────────────────────
    mod_count = len(module_ids)
    summary = (
        f"✅ **{course_title}** is live!\n\n"
        f"• {mod_count} module{'s' if mod_count != 1 else ''} published\n"
        f"• Quizzes generated for all {mod_count} module{'s' if mod_count != 1 else ''}\n"
        f"• Badge **'{badge_name}'** created\n"
        f"• Certificate of Completion template created — issued automatically when learners finish\n"
        f"• Launch notification sent\n\n"
        f"Your learners can now find it in the Courses page. "
        f"Course ID: `{course_id}`"
    )
    _emit_tokens(queue, summary)


# ── Sync worker (runs in thread pool — CrewAI is synchronous) ─────────────────

def _run_crew_sync(request: str, messages: list, org_id: str, user_id: str, queue: Queue,
                   az_endpoint: str = "", az_key: str = "", az_version: str = "",
                   az_deployment: str = "") -> None:
    """
    Runs the agent logic in a background thread.
    Pushes SSE-ready event dicts to `queue`.
    Sends None sentinel when done.
    """
    from openai import AzureOpenAI as _AzureOpenAI

    set_ctx({"org_id": org_id, "user_id": user_id, "is_schedule": False})

    _az_client = _AzureOpenAI(
        azure_endpoint = az_endpoint or os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_key        = az_key        or os.getenv("AZURE_OPENAI_API_KEY", ""),
        api_version    = az_version    or os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    )
    _az_deploy = az_deployment or os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-chat")

    try:
        _base    = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
        _deploy  = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-chat")
        _key     = os.getenv("AZURE_OPENAI_API_KEY", "")
        _version = os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")
        _endpoint_with_deploy = f"{_base}/openai/deployments/{_deploy}"

        llm = LLM(
            model       = f"azure/{_deploy}",
            endpoint    = _endpoint_with_deploy,
            api_key     = _key,
            api_version = _version,
            temperature = 0.3,
        )

        # ── Step 1: Pre-extract URLs ──────────────────────────────────────────
        urls, content_source = extract_urls_from_message(request)

        # Recover URLs from history if current message is a Q&A response
        if not urls and messages:
            for msg in messages:
                found_urls, found_source = extract_urls_from_message(msg.get("content", ""))
                if found_urls:
                    urls        = found_urls
                    content_source = found_source
                    break

        # ── Step 2: Intent Detection ──────────────────────────────────────────
        queue.put({
            "event": "tool_call",
            "data": json.dumps({
                "id":          "intent-0",
                "name":        "intent_detection",
                "displayName": "Analyzing your request...",
                "status":      "running",
            }),
        })

        intent = detect_intent(request, llm, urls=urls, content_source=content_source, messages=messages)

        url_hint = f" | {len(urls)} URLs detected" if urls else ""
        queue.put({
            "event": "tool_call",
            "data": json.dumps({
                "id":          "intent-0",
                "name":        "intent_detection",
                "displayName": (
                    f"Workflow: {intent.workflow} | "
                    f"Topic: {intent.topic} | "
                    f"Items: {intent.num_items} | "
                    f"Level: {intent.level}"
                    f"{url_hint}"
                ),
                "status": "done",
            }),
        })

        # ── Conversational Agent with Function Calling ─────────────────────
        if intent.workflow in DIRECT_LLM_STAGES or intent.workflow == "general_chat":
            # Fetch video info if YouTube URLs detected
            video_context = ""
            if urls:
                for u in urls[:3]:
                    info = _fetch_youtube_info(u)
                    if info.get("title"):
                        video_context += f'\nVideo: "{info["title"]}"'
                        if info.get("description"):
                            video_context += f' — {info["description"][:200]}'

            # Define tools the agent can call
            agent_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": "create_course",
                        "description": "Create a new course shell. Call this ONLY after user confirms the course title and details.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string", "description": "Course title"},
                                "description": {"type": "string", "description": "2-3 sentence course description"},
                                "category": {"type": "string", "description": "Category name from: Development, Business, Data Science, Design, Marketing, IT & Software, etc."},
                                "skill_tags": {"type": "string", "description": "Comma-separated skill tags"},
                                "level": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                            },
                            "required": ["title", "description", "category"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "add_section",
                        "description": "Add a section/module to a course. Sections contain lessons (videos, readings, quizzes).",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                                "title": {"type": "string", "description": "Section title (e.g., 'Module 1: Introduction')"},
                            },
                            "required": ["course_id", "title"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "add_lesson",
                        "description": "Add a lesson/content item to a section. Can be video, text, reading, or quiz.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                                "section_id": {"type": "string", "description": "Parent section/module ID"},
                                "title": {"type": "string"},
                                "content_type": {"type": "string", "enum": ["youtube_embed", "video", "text", "pdf", "audio"]},
                                "content_url": {"type": "string", "description": "YouTube URL or file URL"},
                            },
                            "required": ["course_id", "title", "content_type"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "generate_quiz",
                        "description": "Generate AI quiz questions for a module/lesson.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                                "module_id": {"type": "string"},
                                "content_text": {"type": "string", "description": "Content to generate questions from"},
                                "num_questions": {"type": "integer", "default": 5},
                                "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                            },
                            "required": ["course_id", "module_id", "content_text"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "create_badge",
                        "description": "Create a completion badge for a course.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                                "name": {"type": "string", "description": "Creative badge name"},
                                "criteria": {"type": "string"},
                            },
                            "required": ["course_id", "name"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "create_certificate",
                        "description": "Create a certificate template for course completion.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                            },
                            "required": ["course_id"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "publish_course",
                        "description": "Publish a course so learners can enroll.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "course_id": {"type": "string"},
                            },
                            "required": ["course_id"],
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "fetch_youtube_metadata",
                        "description": "Fetch title, duration, embed URL from a YouTube video URL.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string"},
                            },
                            "required": ["url"],
                        },
                    },
                },
            ]

            # Tool execution function
            def execute_tool(name: str, args: dict) -> str:
                import httpx as _httpx
                try:
                    if name == "create_course":
                        tags = [t.strip() for t in args.get("skill_tags", "").split(",") if t.strip()]
                        r = _httpx.post(f"{_COURSE_SVC()}/courses", json={
                            "title": args["title"], "description": args.get("description", ""),
                            "skillTags": tags, "orgId": org_id, "instructorId": user_id,
                        }, params={"schedule": "true"}, timeout=30)
                        cid = r.json().get("data", {}).get("id", "")
                        # Auto-assign category
                        try:
                            cat_r = _httpx.get(f"{_COURSE_SVC()}/categories/match", params={"name": args.get("category", "")}, timeout=10)
                            cat = cat_r.json().get("data")
                            if cat:
                                _httpx.patch(f"{_COURSE_SVC()}/courses/{cid}", json={
                                    "categoryId": cat["id"],
                                    "metadata": {"level": args.get("level", "beginner"), "subtitle": args.get("description", "")[:100]},
                                }, timeout=10)
                        except Exception:
                            pass
                        return f"Course created! ID: {cid}, Title: {args['title']}"

                    elif name == "add_section":
                        r = _httpx.post(f"{_COURSE_SVC()}/courses/{args['course_id']}/modules", json={
                            "title": args["title"], "contentType": "text", "itemType": "section", "sectionTitle": args["title"],
                        }, timeout=30)
                        sid = r.json().get("data", {}).get("id", "")
                        return f"Section created! ID: {sid}, Title: {args['title']}"

                    elif name == "add_lesson":
                        body = {
                            "title": args["title"], "contentType": args["content_type"],
                            "sourceType": args["content_type"], "parentModuleId": args.get("section_id"),
                            "itemType": "content",
                        }
                        if args.get("content_url"):
                            body["contentUrl"] = args["content_url"]
                        r = _httpx.post(f"{_COURSE_SVC()}/courses/{args['course_id']}/modules", json=body, timeout=30)
                        lid = r.json().get("data", {}).get("id", "")
                        return f"Lesson added! ID: {lid}, Title: {args['title']}"

                    elif name == "generate_quiz":
                        r = _httpx.post(f"{_QUIZ_SVC()}/quiz/generate", json={
                            "courseId": args["course_id"], "moduleId": args["module_id"],
                            "contentText": args.get("content_text", ""), "numQuestions": args.get("num_questions", 5),
                        }, timeout=60)
                        count = r.json().get("count", "?")
                        return f"Quiz generated! {count} questions for module {args['module_id']}"

                    elif name == "create_badge":
                        r = _httpx.post(f"{_BADGE_SVC()}/badges", json={
                            "name": args["name"], "description": args.get("criteria", f"Complete the course"),
                            "orgId": org_id, "skillTags": ["completion"],
                        }, timeout=30)
                        bid = r.json().get("data", {}).get("id", "")
                        return f"Badge created! ID: {bid}, Name: {args['name']}"

                    elif name == "create_certificate":
                        r = _httpx.post(f"{_CERT_SVC()}/certificates/templates", json={
                            "org_id": org_id, "course_id": args["course_id"], "criteria": {"min_score": 70},
                        }, timeout=30)
                        tid = r.json().get("data", {}).get("id", "")
                        return f"Certificate template created! ID: {tid}"

                    elif name == "publish_course":
                        _httpx.patch(f"{_COURSE_SVC()}/courses/{args['course_id']}/publish", timeout=15)
                        return f"Course published! Learners can now enroll."

                    elif name == "fetch_youtube_metadata":
                        info = _fetch_youtube_info(args["url"])
                        if info.get("title"):
                            return f"Title: {info['title']}, Duration: {info.get('duration', 0)}s, Embed: {info.get('embed_url', args['url'])}"
                        return "Could not fetch video metadata. The video may be private or unavailable."

                    return f"Unknown tool: {name}"
                except Exception as e:
                    return f"Error executing {name}: {e}"

            system_prompt = f"""You are an AI Course Orchestrator for a Learning Management Platform.

You have TOOLS to execute actions. When the user confirms they want to build/create something, \
USE THE TOOLS to actually do it. Don't just describe what you'll do — CALL THE FUNCTIONS.

IMPORTANT RULES:
- If ANYTHING is unclear, ASK before acting. Never assume.
- Ask ONE question at a time. Wait for confirmation.
- When user says "yes, build it" → call create_course, then add_section, add_lesson, generate_quiz, etc.
- Always confirm before calling tools. Summarize what you'll do first.
- After building, tell the user what was created and how to add more content later.

BEHAVIOR RULES:
- NEVER auto-create courses or modules without asking clarifying questions first.
- NEVER suggest module names unless the user explicitly asks for suggestions.
- Ask ONE logical question at a time and wait for user confirmation before proceeding.
- Summarize current progress before every major action and ask for confirmation.
- Be conversational, dynamic, and confirmation-based — like Claude or ChatGPT.
- If the user asks a question, ANSWER IT FIRST before continuing any workflow.
- If the user interrupts, pause and address their concern.

COURSE CREATION FLOW (when user wants to create a course):
1. Ask: Course title? Category? Single-module or multi-module?
2. If multi-module: How many modules initially? Upload frequency (weekly/monthly/all at once)?
3. For EACH module, ask:
   a. "What's the name/title for this module?"
   b. "Does this module have sub-videos or multiple content pieces?"
      (Like Coursera — a module can contain multiple videos, readings, and a quiz)
   c. If YES sub-content: "How many sub-videos/items in this module? Paste the links or describe them."
   d. If NO: "What single content do you have? (YouTube link, video file, PDF, text, audio)"
4. Supported content types per item:
   - YouTube video (paste the link)
   - Video file upload (MP4, MOV — use the upload button)
   - PDF/Document upload (use the upload button)
   - Text content (type or paste directly)
   - Audio/Podcast (upload file or paste RSS feed URL)
   - External link (any URL)
5. DO NOT suggest module names unless asked. Let the user name their modules.
6. If user shares a YouTube PLAYLIST link (has list= in URL), ask:
   "This is a playlist. How many videos should I pull? Should each video be a separate module, or group them into sections?"
7. After all modules are planned: Ask about quiz preferences (manual upload or AI-generated?)
   Ask: "Should each module have its own quiz, or just a final course quiz?"
8. After quiz: Suggest 3 creative badge names specific to the topic
8. After badge: Ask about certificate, show build summary, confirm before building
9. ONLY build after explicit confirmation ("yes", "build it", "go ahead")
10. After building, tell user: "To add more modules later, come back to this chat or use the +Add Module button on the course page."

MODULE APPENDING:
- If user says "add module" or "upload another module": confirm which course, module title
- Ask: "What content do you have? (YouTube link, video file, PDF, text, or audio)"
- Ask if quiz should be manual or AI-generated from content
- Offer to schedule reminders for future uploads

QUIZ LOGIC:
- Ask: Upload own questions OR AI-generate from content?
- AI can generate from: video transcript, PDF text, or any module content
- If AI: offer basic/intermediate/advanced difficulty
- Always confirm before generating

CONTENT TYPES WE SUPPORT:
- YouTube videos (paste link — we auto-extract title, thumbnail, duration)
- YouTube playlists (paste playlist link — we can pull multiple videos)
- Video files (MP4, MOV — upload via the attachment button)
- PDF documents (upload — we auto-extract text for quiz generation)
- Text/articles (paste or type directly)
- Audio/podcasts (upload MP3 or paste RSS feed URL)
- Any external URL

WHAT YOU CAN DO:
- Create courses from any content type above
- Add/edit/delete modules on existing courses
- Generate quizzes from any content (video transcripts, PDFs, text)
- Create badges and certificates
- Show analytics and platform stats
- Edit course titles, descriptions, categories
- Answer questions about the platform
- Schedule module upload reminders

{video_context}

Be warm, helpful, and conversational. Ask, confirm, then execute."""

            # Build OpenAI-style messages array from conversation history
            chat_messages = [{"role": "system", "content": system_prompt}]
            for msg in messages:
                role = "user" if msg.get("role") == "user" else "assistant"
                content = msg.get("content", "")
                if content:
                    chat_messages.append({"role": role, "content": content[:1000]})

            # ── Tool-calling loop (agent can call multiple tools in sequence) ──
            max_tool_rounds = 10  # Safety limit
            for _ in range(max_tool_rounds):
                try:
                    resp = _az_client.chat.completions.create(
                        model=_az_deploy,
                        messages=chat_messages,
                        tools=agent_tools,
                        max_tokens=600,
                        temperature=0.7,
                    )
                except Exception as e:
                    # Fallback: try without tools if model doesn't support them
                    resp = _az_client.chat.completions.create(
                        model=_az_deploy,
                        messages=chat_messages,
                        max_tokens=500,
                        temperature=0.7,
                    )

                choice = resp.choices[0]

                # If the model wants to call tools
                if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                    # Add the assistant message with tool calls
                    chat_messages.append(choice.message)

                    for tool_call in choice.message.tool_calls:
                        fn_name = tool_call.function.name
                        fn_args = json.loads(tool_call.function.arguments or "{}")

                        # Show progress in the UI
                        display_name = fn_name.replace("_", " ").title()
                        _emit_tool(queue, fn_name, f"{display_name}...", "running")

                        # Execute the tool
                        result = execute_tool(fn_name, fn_args)

                        _emit_tool(queue, fn_name, f"{display_name} done", "success", result)

                        # Add tool result to conversation
                        chat_messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": result,
                        })

                    # Continue loop — model will process tool results and may call more tools
                    continue

                # If the model just wants to respond with text
                result_text = choice.message.content or ""
                for i in range(0, len(result_text), 80):
                    queue.put({"event": "token", "data": result_text[i: i + 80]})
                break  # Done — no more tool calls

            return

        # ── Build enriched request (include full Q&A context) ─────────────────
        if len(messages) > 2:
            history_lines = []
            for msg in messages[:-1]:
                role = "Admin" if msg.get("role") == "user" else "Assistant"
                history_lines.append(f"{role}: {msg.get('content', '')[:400]}")
            context_block    = "\n".join(history_lines)
            enriched_request = f"Conversation context:\n{context_block}\n\nLatest request: {request}"
        else:
            enriched_request = request

        # ── Add-module workflow → direct API call ──────────────────────────
        if intent.workflow == "add_module":
            set_ctx({"org_id": org_id, "user_id": user_id, "is_schedule": False})
            _add_module_directly(
                intent, enriched_request, org_id, user_id,
                urls, content_source, queue, _az_client, _az_deploy,
            )
            return

        # ── Edit-course workflow → context-aware editing ─────────────────
        if intent.workflow == "edit_course":
            set_ctx({"org_id": org_id, "user_id": user_id, "is_schedule": False})
            _edit_course_directly(
                intent, enriched_request, org_id, user_id,
                urls, content_source, queue, _az_client, _az_deploy,
            )
            return

        # ── Course-building workflows → DIRECT API calls (no CrewAI) ─────────
        _direct_build_workflows = {
            "single_course", "youtube_course", "podcast_course",
            "weekly_schedule", "sub_courses", "multiple_courses",
        }
        if intent.workflow in _direct_build_workflows:
            set_ctx({"org_id": org_id, "user_id": user_id, "is_schedule": True})
            _build_course_directly(
                intent           = intent,
                enriched_request = enriched_request,
                org_id           = org_id,
                user_id          = user_id,
                urls             = urls,
                content_source   = content_source,
                queue            = queue,
                az_client        = _az_client,
                az_deploy        = _az_deploy,
            )
            return

        # ── General chat → conversational response with platform context ─────
        if intent.workflow == "general_chat":
            _general_chat(enriched_request, org_id, queue, _az_client, _az_deploy)
            return

        # ── Non-course workflows → CrewAI (quiz_only, badge_only, etc.) ──────
        set_ctx({"org_id": org_id, "user_id": user_id, "is_schedule": False})
        agents = make_agents(llm)
        crew   = route_to_crew(intent, agents, enriched_request)
        result = crew.kickoff(inputs={"request": enriched_request})

        result_text = str(result)
        for i in range(0, len(result_text), 80):
            queue.put({"event": "token", "data": result_text[i: i + 80]})

    except Exception as exc:
        queue.put({"event": "error", "data": str(exc)})

    finally:
        queue.put(None)


# ── Async SSE bridge (FastAPI-facing) ─────────────────────────────────────────

async def run_agent(
    message:    str,
    messages:   list,
    org_id:     str,
    user_id:    str,
    ai_client,
    deployment: str,
) -> AsyncIterator[dict]:
    """
    Async generator that bridges the sync logic to FastAPI's EventSourceResponse.
    Yields SSE event dicts until done.
    """
    az_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    az_key      = os.getenv("AZURE_OPENAI_API_KEY", "")
    az_version  = os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")

    event_queue: Queue = Queue()
    loop   = asyncio.get_event_loop()
    future = loop.run_in_executor(
        None,
        _run_crew_sync,
        message, messages, org_id, user_id, event_queue,
        az_endpoint, az_key, az_version, deployment,
    )

    while True:
        try:
            event = event_queue.get(timeout=0.05)
            if event is None:
                break
            yield event
        except Empty:
            await asyncio.sleep(0.05)
            if future.done() and event_queue.empty():
                break

    try:
        await future
    except Exception as exc:
        yield {"event": "error", "data": str(exc)}
