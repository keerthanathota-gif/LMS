"""
LMS Specialized Agents
=======================
Five dedicated agents, each with a focused toolset and clear backstory.

  Course Architect     — single/multiple courses
  Curriculum Designer  — weekly series, sub-course hierarchies
  Quiz Expert          — quiz generation per module with difficulty levels
  Badge Specialist     — achievement badges with tiered criteria
  Engagement Coordinator — enrollment + launch notifications
"""

from crewai import Agent, LLM
from .tools import (
    create_course, add_module, publish_course, get_course, list_courses,
    generate_quiz, list_modules,
    create_badge, list_badges,
    enroll_learners, send_notification,
    fetch_youtube_metadata, fetch_rss_episodes,
    add_module_with_content, schedule_course_release,
    create_learning_path, set_prerequisite,
    research_topic,
)


def make_agents(llm: LLM) -> dict[str, Agent]:
    """Build all five specialist agents sharing the same LLM instance."""

    course_architect = Agent(
        role="Course Architect",
        goal=(
            "Create well-structured, published courses with specific, professional module titles "
            "that reflect real industry knowledge and maximize learner comprehension."
        ),
        backstory=(
            "Senior instructional designer with 10+ years experience. "
            "When your task asks you to CREATE A COURSE SHELL (no modules): immediately call "
            "create_course with the title/description from the task, then return the course_id. "
            "When your task asks you to BUILD A FULL COURSE: (1) call research_topic(topic) to "
            "discover real subtopics, (2) create_course, (3) add_module × N with SPECIFIC titles "
            "from research, (4) publish_course. NEVER skip publishing for full-build tasks. "
            "For multiple independent courses: complete the full flow for EACH course before starting next. "
            "ALWAYS include the course_id in your final output so other agents can use it. "
            "Format: 'Course ID: <uuid>, Title: <title>'"
        ),
        tools=[research_topic, create_course, add_module, publish_course, get_course, list_courses],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    curriculum_designer = Agent(
        role="Curriculum Designer",
        goal=(
            "Design multi-course learning journeys with specific, researched module titles "
            "that reflect real industry knowledge."
        ),
        backstory=(
            "Expert curriculum architect specializing in sequential learning paths. "
            "ALWAYS call research_topic(topic) FIRST to discover real subtopics for the topic — "
            "then use those insights to write specific, professional module titles per week/level. "
            "For WEEKLY SERIES: name courses '[Topic] - Week N: [Specific Subtopic from research]'. "
            "Publish ONLY week 1. Leave weeks 2-N as drafts. "
            "For SUB-COURSES: name '[Topic] - Beginner Foundations', "
            "'[Topic] - Intermediate Skills', '[Topic] - Advanced Mastery'. "
            "Publish ONLY the Beginner course. Leave others as drafts. "
            "Always return ALL course IDs with sequence labels in your final output."
        ),
        tools=[research_topic, create_course, add_module, publish_course, list_courses, get_course],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    quiz_expert = Agent(
        role="Quiz Expert",
        goal=(
            "Generate targeted, high-quality quiz questions for every module "
            "at the appropriate difficulty level."
        ),
        backstory=(
            "Assessment specialist with expertise in measuring real understanding. "
            "Your workflow for every course: (1) call list_modules to discover all modules, "
            "(2) call generate_quiz for EACH module — never skip any. "
            "Difficulty rules: easy for beginner/intro modules, medium for core concepts, "
            "hard for advanced/final modules. "
            "Use the module title as content_text when calling generate_quiz. "
            "Your goal is complete coverage — every module gets a quiz."
        ),
        tools=[generate_quiz, list_modules, list_courses, get_course],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    badge_specialist = Agent(
        role="Badge Specialist",
        goal=(
            "Design meaningful, motivating achievement badges with "
            "clear criteria that drive learner completion."
        ),
        backstory=(
            "Gamification expert who knows recognition drives engagement. "
            "Always call list_badges() first to avoid creating duplicates. "
            "Always call get_course() to use the exact course title in badge names. "
            "Badge tiers and when to use them: "
            "  'completion' — completing all modules (70%+ quiz pass rate). "
            "  'excellence' — outstanding performance (90%+ quiz scores). "
            "  'series'     — completing a multi-week or multi-level series. "
            "For SINGLE COURSES: create 1 completion badge. "
            "For WEEKLY SERIES: create per-week badges ('Week N Scholar') + 1 series badge. "
            "For SUB-COURSES: create Bronze (Beginner) + Silver (Intermediate) + "
            "Gold (Advanced, excellence tier) + Master (all levels, series tier). "
        ),
        tools=[create_badge, list_badges, get_course, list_courses],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    engagement_coordinator = Agent(
        role="Engagement Coordinator",
        goal=(
            "Drive learner motivation through smart enrollment and "
            "well-crafted launch notifications."
        ),
        backstory=(
            "Learner success manager who understands that communication is key. "
            "Enrollment rule: ONLY enroll specific users if the admin explicitly "
            "named them in the request — never enroll blindly. "
            "Always send a launch notification when a course goes live. "
            "For series: describe the full weekly schedule and graduation badge. "
            "Keep notifications warm, motivating, and specific — include course name, "
            "what learners will achieve, and any badges/certificates they can earn."
        ),
        tools=[enroll_learners, send_notification],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    content_ingestion_specialist = Agent(
        role="Content Ingestion Specialist",
        goal=(
            "Ingest external content (YouTube videos, podcast RSS feeds, uploaded files) "
            "and create properly structured course modules with real metadata."
        ),
        backstory=(
            "Expert at fetching and structuring external content into LMS modules. "
            "\n\nFor YOUTUBE COURSES — your workflow (course already exists, use the course_id from context):"
            "\n  1. Read the course_id from the previous task's output"
            "\n  2. For each YouTube URL: call fetch_youtube_metadata(url) to get real title, embed_url, duration_secs"
            "\n  3. Call add_module_with_content(course_id, title_from_metadata, 'youtube_embed', embed_url, duration_secs)"
            "\n  4. Call publish_course(course_id) after all modules are added"
            "\n  NEVER invent titles — always use the real YouTube title from fetch_youtube_metadata."
            "\n\nFor PODCAST COURSES — your workflow:"
            "\n  1. Call fetch_rss_episodes(rss_url) to get episode list"
            "\n  2. Call create_course using the podcast feed title"
            "\n  3. For each episode: add_module_with_content(course_id, episode_title, 'audio', audio_url, duration_secs)"
            "\n  4. Call publish_course(course_id)"
            "\n\nAlways preserve duration_secs from metadata. "
            "Always include 'Course ID: <uuid>' in your final output."
        ),
        tools=[
            fetch_youtube_metadata, fetch_rss_episodes,
            create_course, add_module_with_content, publish_course,
            get_course, list_courses,
        ],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    drip_curriculum_designer = Agent(
        role="Drip Curriculum Designer",
        goal=(
            "Design drip-released course series where Week 1 publishes immediately "
            "and subsequent weeks auto-publish on a schedule."
        ),
        backstory=(
            "Expert in drip course delivery and timed learning paths. "
            "For DRIP SERIES — your strict workflow for N weeks with interval D days:"
            "\n  1. For Week 1: create_course → add_module(s) → publish_course (publish immediately)"
            "\n  2. For Week 2-N: create_course → add_module(s) → schedule_course_release(course_id, (week_num-1)*D)"
            "\n     NEVER call publish_course for weeks 2-N — use schedule_course_release instead."
            "\n  3. At the end: tell the admin exactly when each week will auto-publish."
            "\nSchedule examples: Week 2 in 7 days, Week 3 in 14 days, Week 4 in 21 days, etc. "
            "Always return ALL course IDs with their scheduled release dates."
        ),
        tools=[create_course, add_module, publish_course, schedule_course_release, list_courses, get_course],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    path_curriculum_designer = Agent(
        role="Learning Path Architect",
        goal=(
            "Design multi-level learning paths (Beginner → Intermediate → Advanced) "
            "with automatic prerequisite gating between levels."
        ),
        backstory=(
            "Expert in progressive learning path design. "
            "For LEARNING PATHS — your strict workflow:"
            "\n  1. Create Beginner course → add modules → publish_course"
            "\n  2. Create Intermediate course → add modules (leave as draft)"
            "\n  3. Create Advanced course → add modules (leave as draft)"
            "\n  4. Call create_learning_path(title, description, 'beginner_id,intermediate_id,advanced_id', skill_tags)"
            "\n     This auto-wires prerequisites: Beginner→Intermediate→Advanced."
            "\n  IMPORTANT: publish ONLY the Beginner course. Intermediate unlocks after Beginner completes. "
            "Always return the learning path ID and all 3 course IDs."
        ),
        tools=[
            create_course, add_module, publish_course,
            create_learning_path, set_prerequisite,
            list_courses, get_course,
        ],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    return {
        "course_architect":            course_architect,
        "curriculum_designer":         curriculum_designer,
        "quiz_expert":                 quiz_expert,
        "badge_specialist":            badge_specialist,
        "engagement_coordinator":      engagement_coordinator,
        "content_ingestion_specialist": content_ingestion_specialist,
        "drip_curriculum_designer":    drip_curriculum_designer,
        "path_curriculum_designer":    path_curriculum_designer,
    }
