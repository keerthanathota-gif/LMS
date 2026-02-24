# LMS Master Reference Document
**AI-Native Learning Management System — Complete Technical Reference**

> **Purpose:** This document is the single source of truth for the entire LMS project.
> Any developer, AI assistant, or new team member should read this first.
> Last updated: 2026-02-21

---

## Quick Navigation

1. [Project Overview](#1-project-overview)
2. [Architecture Layers](#2-architecture-layers)
3. [Full Tech Stack](#3-full-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Event Catalog (Kafka)](#5-event-catalog-kafka)
6. [API Endpoints Per Service](#6-api-endpoints-per-service)
7. [Phase-by-Phase Build Plan](#7-phase-by-phase-build-plan)
8. [Security & Compliance](#8-security--compliance)
9. [Deployment Reference](#9-deployment-reference)
10. [Patterns & Troubleshooting](#10-patterns--troubleshooting)

---

## 1. Project Overview

### What This System Is

An **AI-Native Learning Management System** where:
- **Admins** interact via a chat interface to create, manage, and assign courses — no clicking through forms
- **Learners** get a personalized AI companion that knows their history and adapts to their learning style
- **Instructors** have a portal for content, analytics, and student management
- **Enterprises** connect via SSO, SCORM, and APIs

### Core Design Principles

| Principle | Meaning |
|---|---|
| **Agent-First** | Every workflow is orchestrated by AI agents, not hard-coded business logic |
| **Event-Driven** | All services communicate via Kafka events — no direct database sharing |
| **Admin Chat = First Class** | Creating a course by typing in chat is NOT a bolt-on feature — it IS the UI |
| **Learner AI Companion** | Every learner has a personal AI tutor, not just a chatbot |
| **Hot-Pluggable** | New tools and integrations added at runtime, no redeployment needed |
| **Stateless Services** | Only the Agent Orchestrator holds state — all other services are stateless |
| **Audit Everything** | Every action is signed and stored immutably in ClickHouse |

### Who Uses This System

| Role | What They Do | Primary Interface |
|---|---|---|
| **Super Admin** | Manages entire platform, all orgs | Admin Chat Studio |
| **Org Admin** | Manages their company's LMS instance | Admin Chat Studio |
| **Instructor** | Creates content, monitors students | Instructor Portal |
| **Teaching Assistant** | Grades assignments, moderates discussions | Instructor Portal |
| **Learner** | Takes courses, earns badges and certificates | Learner App (React PWA) |
| **Enterprise System** | Integrates HR, CRM, SSO | REST API / Webhooks |

### What Makes This Different From Traditional LMS

```
Traditional LMS (Moodle, Canvas):          This LMS:
  Admin clicks menus to build courses   →    Admin types: "Build a Python course from this PDF"
  Fixed quiz types                      →    AI generates adaptive quizzes per learner
  Certificates are manual               →    Certificates auto-issue when criteria met
  Static content                        →    Content adapts to learner skill level
  Integrations require redeployment     →    Tools hot-plug via registry at runtime
  One-size-fits-all learning path       →    Skill-graph personalized paths
```

---

## 2. Architecture Layers

### Layer Diagram (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — CLIENT LAYER                                         │
│  Learner App (React PWA) | Admin Chat Studio | Instructor Portal│
│  Enterprise SSO (SAML/OAuth 2.0)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 2 — GATEWAY & AUTH LAYER                                 │
│  API Gateway (Kong/Traefik) → JWT validation, rate limiting, TLS│
│  Auth Service (Keycloak) → RBAC, JWT, SAML, MFA                 │
│  Load Balancer (Ingress NGINX + HPA)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ gRPC / REST (internal)
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 3 — AGENT ORCHESTRATOR LAYER (The Brain)                 │
│  Agent Orchestrator (LangGraph/CrewAI)                          │
│    → Intent parsing → Multi-step planning → Tool dispatch       │
│    → Memory R/W → Streaming responses                           │
│  Dynamic Tool Registry → Hot-plug JSON schema tools             │
│  Workflow Engine (Temporal.io) → Admin-configurable DAGs        │
└────────────────────────────┬────────────────────────────────────┘
                             │ gRPC with mTLS
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 4 — DOMAIN MICROSERVICES                                 │
│  Course Service    │ Quiz Engine      │ Badge Engine             │
│  Certificate Engine│ Analytics Service│ User Service             │
│  Notification Svc  │ Content Service  │ Payment Service (Stripe) │
│  Search Service    │ Tool Registry Svc│ Learner AI Companion     │
│  Gamification Svc  │ Social Svc       │ At-Risk Detection Svc    │
└────────────────────────────┬────────────────────────────────────┘
                             │ Kafka events (async)
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 5 — EVENT BUS                                            │
│  Apache Kafka (or Redpanda) — topic-per-domain                  │
│  Schema Registry (Avro) — event contract enforcement            │
│  Dead Letter Queue (DLQ) — failed event capture + retry         │
└────────────────────────────┬────────────────────────────────────┘
                             │ queries
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 6 — DATA LAYER                                           │
│  PostgreSQL + pgvector → OLTP, relational data, embeddings      │
│  Redis Cluster → Session, cache, rate limits, pub/sub           │
│  Weaviate → Vector DB, semantic search, skill graph             │
│  ClickHouse → Analytics, audit logs, immutable events           │
│  MinIO / S3 → Videos, PDFs, certificates, model artifacts       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  LAYER 7 — INFRASTRUCTURE                                       │
│  Kubernetes (multi-namespace) | Istio (service mesh, mTLS)      │
│  Helm (packages) | ArgoCD (GitOps) | HashiCorp Vault (secrets)  │
│  Prometheus + Grafana | Jaeger/Tempo | Loki + Fluentd           │
│  Langfuse (LLM observability) | OpenTelemetry                   │
└─────────────────────────────────────────────────────────────────┘
```

### How Layers Connect

| From | To | Protocol | Why |
|---|---|---|---|
| Client | API Gateway | HTTPS + WebSocket | TLS termination at edge |
| API Gateway | Auth Service | gRPC | Fast token validation |
| API Gateway | Agent Orchestrator | gRPC | Route admin/learner requests |
| Agent Orchestrator | Domain Services | gRPC + mTLS | Encrypted service-to-service |
| Domain Services | Kafka | Kafka Producer | Async event publishing |
| Kafka | Domain Services | Kafka Consumer | Async event consumption |
| Domain Services | PostgreSQL/Redis | TCP | Data reads/writes |
| All Services | ClickHouse | HTTP (batch) | Audit log ingestion |

### Communication Rules (NEVER break these)

1. **Clients → services:** Always through API Gateway, never direct
2. **Services → services:** gRPC internally, never REST internally
3. **State changes:** Always publish a Kafka event, even for sync gRPC calls
4. **Database:** Each service owns its own tables — no cross-service DB joins
5. **Auth:** Enforced at API Gateway + OPA policy — never inside business logic

---

## 3. Full Tech Stack

### Frontend / Client

| Tool | Version | Purpose | Why This Tool |
|---|---|---|---|
| **React** | 18+ | Learner App + Admin Chat Studio + Instructor Portal | Industry standard, PWA support, large ecosystem |
| **React PWA** | - | Offline-capable learner app | Service workers for offline content |
| **React Flow** | 11+ | Visual workflow builder (drag-and-drop course paths) | Best graph editor for React |
| **WebSocket / SSE** | - | Real-time streaming of AI responses | Streaming LLM output to admin chat |
| **TailwindCSS** | 3+ | Styling | Utility-first, fast to build with |

### API Gateway & Auth

| Tool | Version | Purpose | Why This Tool |
|---|---|---|---|
| **Kong** | 3+ | API Gateway — routing, rate limiting, plugins | Most mature, plugin ecosystem, declarative config |
| **Traefik** | 3+ | Alternative API Gateway | Better Kubernetes-native if Kong is too heavy |
| **Keycloak** | 23+ | Auth server — JWT, SAML, MFA, RBAC, OAuth 2.0 | Open source, enterprise-grade, self-hosted |
| **OPA (Open Policy Agent)** | - | Fine-grained access control policies | Decouples auth logic from services |
| **Ingress NGINX** | - | Load balancer, TLS termination | Standard Kubernetes ingress |

### AI & Agent Layer

| Tool | Version | Purpose | Why This Tool |
|---|---|---|---|
| **LangGraph** | latest | Agent orchestration — multi-step reasoning, loops | Best for complex stateful agent workflows |
| **CrewAI** | latest | Multi-agent coordination | When multiple specialized agents collaborate |
| **Temporal.io** | 1.x | Durable workflow engine — retries, compensation, DAGs | Handles failures gracefully, long-running workflows |
| **Claude (Anthropic)** | claude-sonnet-4-6 | Primary LLM for agents | Best reasoning, long context, tool use |
| **GPT-4o** | latest | Fallback LLM | Redundancy if Claude unavailable |
| **MCP (Model Context Protocol)** | - | Standardized tool schemas for agents | Industry standard for AI tool interfaces |
| **Langfuse** | latest | LLM call logging, cost tracking, prompt management | Only tool built for LLM observability |

### Microservices Runtime

| Tool | Purpose | Why |
|---|---|---|
| **Node.js 20+** | Course, User, Notification, Gamification services | Fast I/O, large ecosystem |
| **Python 3.12+** | Agent Orchestrator, AI Companion, At-Risk Detection | Best ML/AI library support |
| **gRPC** | Internal service communication | 10x faster than REST, typed contracts |
| **Protobuf** | gRPC message serialization | Compact, fast, schema-enforced |
| **mTLS** | Mutual TLS between services | Prevents rogue services from calling each other |

### Databases

| Tool | Version | Purpose | Why This Tool |
|---|---|---|---|
| **PostgreSQL** | 16+ | Primary OLTP database — all relational data | Rock solid, pgvector for embeddings, JSONB |
| **pgvector** | - | Vector similarity search in PostgreSQL | Avoids separate vector DB for simpler queries |
| **Patroni** | - | PostgreSQL high availability (failover) | Battle-tested automatic failover |
| **Redis Cluster** | 7+ | Working memory, session cache, rate limiting, pub/sub | Fastest in-memory store, cluster mode for HA |
| **Redis Sentinel** | - | Redis high availability | Automatic Redis failover |
| **Weaviate** | - | Dedicated vector database — semantic search, skill graph | Best semantic search performance, schema enforcement |
| **ClickHouse** | - | Analytics, audit logs, time-series events | Columnar storage, fastest OLAP queries |
| **MinIO** | - | Self-hosted S3-compatible object storage | Videos, PDFs, certificates, model artifacts |

### Event Bus & Messaging

| Tool | Purpose | Why |
|---|---|---|
| **Redpanda** | Kafka-compatible event bus (preferred) | 6x fewer resources than Apache Kafka, same API |
| **Apache Kafka** | Event bus (fallback if Redpanda not suitable) | Industry standard, mature ecosystem |
| **Schema Registry** | Avro schema enforcement for all events | Prevents breaking changes between services |
| **Dead Letter Queue** | Captures failed events for inspection and retry | Prevents data loss on processing failures |

### Content Processing

| Tool | Purpose | Why |
|---|---|---|
| **Tika / PyMuPDF** | Extract text from PDFs for AI processing | Best PDF text extraction libraries |
| **FFmpeg** | Video transcoding to multiple resolutions | Industry standard video processing |
| **Whisper AI** | Auto-generate captions for all videos | OpenAI's open-source, highly accurate |
| **WeasyPrint** | Generate certificate PDFs from HTML templates | Python-native, CSS-based PDF generation |
| **Puppeteer** | Alternative PDF generation (screenshot-based) | Better for pixel-perfect designs |
| **ClamAV** | Malware scan all uploaded files | Security requirement before storing content |

### Infrastructure & DevOps

| Tool | Purpose | Why |
|---|---|---|
| **Kubernetes (K8s)** | Container orchestration — runs everything | Industry standard, auto-scaling, self-healing |
| **Helm** | Kubernetes package manager | Templated, versioned K8s manifests |
| **ArgoCD** | GitOps — auto-deploys from Git repo | Declarative, auditable deployments |
| **Istio** | Service mesh — mTLS, circuit breakers, traffic policies | Zero-trust networking between services |
| **Envoy** | Sidecar proxy (injected by Istio) | Circuit breaker, retry, observability per service |
| **KEDA** | Event-driven auto-scaling via Kafka lag | Scale consumers based on queue depth |
| **Argo Rollouts** | Canary and Blue/Green deployments | Safe progressive delivery |
| **HashiCorp Vault** | Secrets management — API keys, DB passwords | Centralized, audited, rotatable secrets |

### Observability Stack

| Tool | Purpose | Why |
|---|---|---|
| **Prometheus** | Metrics collection from all services | Standard Kubernetes metrics scraping |
| **Grafana** | Dashboards for metrics + logs + traces | Best visualization, Loki and Tempo integration |
| **Jaeger / Tempo** | Distributed tracing (follow a request across services) | See exactly where latency comes from |
| **Loki + Fluentd** | Log aggregation — all service logs in one place | Cheap storage, Grafana integration |
| **OpenTelemetry** | Unified telemetry SDK for all services | One SDK for metrics + traces + logs |
| **Langfuse** | LLM-specific observability — prompt logging, cost | Only tool built for this purpose |

### Payments & External Integrations

| Tool | Purpose |
|---|---|
| **Stripe** | Payments, subscriptions, invoicing, marketplace payouts |
| **Elasticsearch** | Full-text search across all course content |
| **Zoom SDK** | Live virtual classroom rooms per course |
| **Slack API** | Learner and instructor notifications |
| **Microsoft Teams** | Enterprise notification channel |
| **Salesforce API** | CRM sync — enrollment data to sales teams |
| **LinkedIn API** | Badge and certificate sharing |
| **SCORM 1.2 / 2004** | Import courses from other LMS platforms |

---

## 4. Database Schema

### PostgreSQL Tables

```sql
-- USERS & AUTH
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,                    -- multi-tenant isolation
  email         VARCHAR(255) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL,             -- super_admin, org_admin, instructor, ta, learner
  keycloak_id   VARCHAR(255) UNIQUE,              -- link to Keycloak user
  avatar_url    TEXT,
  preferences   JSONB DEFAULT '{}',              -- learning style, notification prefs
  skill_level   VARCHAR(50) DEFAULT 'beginner',  -- beginner, intermediate, advanced
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIZATIONS (Multi-tenant)
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,     -- url-friendly name
  plan          VARCHAR(50) DEFAULT 'starter',   -- starter, pro, enterprise
  settings      JSONB DEFAULT '{}',              -- branding, feature flags, SSO config
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- COURSES
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  instructor_id UUID NOT NULL REFERENCES users(id),
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  status        VARCHAR(50) DEFAULT 'draft',     -- draft, published, archived
  visibility    VARCHAR(50) DEFAULT 'private',   -- private, org, public, marketplace
  price         DECIMAL(10,2) DEFAULT 0,         -- 0 = free
  scorm_version VARCHAR(20),                     -- null if not SCORM
  skill_tags    TEXT[] DEFAULT '{}',             -- for skill graph
  metadata      JSONB DEFAULT '{}',              -- version, language, duration estimate
  embedding     vector(1536),                   -- pgvector: semantic search embedding
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- MODULES (Sections within a course)
CREATE TABLE modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         VARCHAR(500) NOT NULL,
  order_index   INTEGER NOT NULL,
  content_type  VARCHAR(50),                     -- video, text, pdf, scorm, live
  content_url   TEXT,                            -- MinIO/S3 URL
  duration_secs INTEGER,
  transcript    TEXT,                            -- Whisper AI output
  embedding     vector(1536),                   -- pgvector: content embedding
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ENROLLMENTS
CREATE TABLE enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  status        VARCHAR(50) DEFAULT 'active',    -- active, completed, dropped, expired
  progress_pct  DECIMAL(5,2) DEFAULT 0,
  enrolled_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);

-- QUIZ QUESTIONS
CREATE TABLE quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID REFERENCES modules(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL,            -- multiple_choice, true_false, short_answer, code
  options       JSONB,                           -- [{text, is_correct}, ...]
  correct_answer TEXT,
  explanation   TEXT,                            -- shown after answer
  difficulty    DECIMAL(3,2) DEFAULT 0.5,        -- IRT: 0.0=easy, 1.0=hard
  discrimination DECIMAL(3,2) DEFAULT 1.0,       -- IRT: how well it differentiates
  skill_tags    TEXT[] DEFAULT '{}',
  ai_generated  BOOLEAN DEFAULT false,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- QUIZ ATTEMPTS
CREATE TABLE quiz_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  module_id     UUID REFERENCES modules(id),
  answers       JSONB NOT NULL,                  -- [{question_id, selected, correct, time_secs}]
  score_pct     DECIMAL(5,2) NOT NULL,
  ability_score DECIMAL(5,2),                    -- IRT theta: learner ability estimate
  time_secs     INTEGER,
  passed        BOOLEAN NOT NULL,
  attempted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BADGES
CREATE TABLE badges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  image_url     TEXT NOT NULL,
  criteria      JSONB NOT NULL,                  -- {type: course_completion|quiz_score|..., threshold: 0.8}
  skill_tags    TEXT[] DEFAULT '{}',
  open_badge_json JSONB,                         -- Open Badges 3.0 assertion template
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ISSUED BADGES
CREATE TABLE issued_badges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id      UUID NOT NULL REFERENCES badges(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID REFERENCES courses(id),
  assertion_url TEXT,                            -- Open Badges 3.0 public URL
  issued_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(badge_id, user_id, course_id)
);

-- CERTIFICATES
CREATE TABLE certificates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  template_html TEXT NOT NULL,                   -- HTML template for PDF generation
  criteria      JSONB NOT NULL,                  -- {min_score: 0.8, require_all_modules: true}
  validity_days INTEGER,                         -- null = no expiry
  blockchain_enabled BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ISSUED CERTIFICATES
CREATE TABLE issued_certs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  pdf_url       TEXT NOT NULL,                   -- MinIO URL to signed PDF
  qr_code_url   TEXT,
  blockchain_tx VARCHAR(255),                    -- blockchain transaction hash
  verify_url    TEXT NOT NULL,                   -- public verification URL
  issued_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  UNIQUE(certificate_id, user_id)
);

-- TOOL REGISTRY
CREATE TABLE tool_registry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) UNIQUE NOT NULL,    -- e.g., "zoom_schedule_class"
  display_name  VARCHAR(255) NOT NULL,
  description   TEXT NOT NULL,
  version       VARCHAR(50) NOT NULL,
  schema        JSONB NOT NULL,                  -- JSON Schema for tool parameters
  endpoint      TEXT NOT NULL,                   -- gRPC or HTTP endpoint
  auth_type     VARCHAR(50),                     -- none, api_key, oauth
  enabled       BOOLEAN DEFAULT true,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- AGENT CONVERSATIONS
CREATE TABLE agent_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  role          VARCHAR(50) NOT NULL,            -- admin, learner
  session_id    VARCHAR(255) NOT NULL,
  messages      JSONB NOT NULL,                  -- [{role, content, tool_calls, timestamp}]
  summary       TEXT,                            -- AI-compressed summary of long conversations
  embedding     vector(1536),                   -- for semantic conversation search
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- WORKFLOW DEFINITIONS (Temporal DAGs configured by admins)
CREATE TABLE workflow_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  dag_json      JSONB NOT NULL,                  -- Temporal workflow definition
  trigger_event VARCHAR(255),                    -- Kafka event that triggers this workflow
  created_by    UUID REFERENCES users(id),
  enabled       BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SKILL NODES (Skill graph for personalization)
CREATE TABLE skill_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  parent_id     UUID REFERENCES skill_nodes(id), -- hierarchical skill tree
  level         VARCHAR(50),                     -- foundational, intermediate, advanced
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- LEARNER SKILL MASTERY
CREATE TABLE learner_skills (
  user_id       UUID NOT NULL REFERENCES users(id),
  skill_id      UUID NOT NULL REFERENCES skill_nodes(id),
  mastery_score DECIMAL(3,2) DEFAULT 0,          -- 0.0 to 1.0
  evidence      JSONB DEFAULT '[]',              -- list of quiz attempts proving mastery
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, skill_id)
);

-- GAMIFICATION
CREATE TABLE learner_xp (
  user_id       UUID NOT NULL REFERENCES users(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  total_xp      BIGINT DEFAULT 0,
  level         INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  PRIMARY KEY(user_id, org_id)
);

CREATE TABLE xp_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  event_type    VARCHAR(100) NOT NULL,           -- quiz_passed, video_watched, badge_earned, ...
  xp_amount     INTEGER NOT NULL,
  reference_id  UUID,                            -- quiz_attempt_id, badge_id, etc.
  earned_at     TIMESTAMPTZ DEFAULT NOW()
);

-- SOCIAL / DISCUSSIONS
CREATE TABLE discussion_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id),
  module_id     UUID REFERENCES modules(id),
  author_id     UUID NOT NULL REFERENCES users(id),
  title         VARCHAR(500),
  body          TEXT NOT NULL,
  upvotes       INTEGER DEFAULT 0,
  is_pinned     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE discussion_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  is_instructor_answer BOOLEAN DEFAULT false,
  upvotes       INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- AT-RISK DETECTION
CREATE TABLE learner_risk_scores (
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  risk_score    DECIMAL(3,2) NOT NULL,           -- 0.0 = low risk, 1.0 = high risk (likely to drop)
  risk_factors  JSONB DEFAULT '{}',              -- {days_inactive: 7, quiz_drop: -20, ...}
  intervention  VARCHAR(100),                    -- null, email_sent, instructor_alerted, companion_nudge
  scored_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, course_id)
);

-- AUDIT LOG (append-only, also in ClickHouse for analytics)
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID,
  actor_id      UUID,                            -- who did it
  actor_role    VARCHAR(50),
  action        VARCHAR(255) NOT NULL,           -- course.created, badge.issued, user.login, ...
  resource_type VARCHAR(100),
  resource_id   UUID,
  payload       JSONB DEFAULT '{}',              -- what changed
  ip_address    INET,
  signature     VARCHAR(512),                   -- HMAC signature of the log entry
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Row-Level Security (Multi-tenant isolation)

```sql
-- Enable RLS on all tables
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- (repeat for all tables with org_id)

-- Policy: users can only see their own org's data
CREATE POLICY org_isolation ON courses
  USING (org_id = current_setting('app.current_org_id')::UUID);
```

### Redis Key Patterns

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `session:{user_id}` | Hash | 24h | User session data, JWT, org_id |
| `agent:context:{session_id}` | List | 24h | Last 10 conversation turns for agent |
| `rate:{user_id}:{endpoint}` | Counter | 1min | API rate limiting per user |
| `cache:course:{course_id}` | JSON | 1h | Course data cache |
| `cache:leaderboard:{org_id}:{course_id}` | Sorted Set | 15min | Leaderboard scores |
| `lock:workflow:{workflow_id}` | String | 30s | Distributed lock for Temporal |
| `streak:{user_id}` | Hash | 48h | Current streak tracking |
| `risk_queue` | List | - | At-risk learners pending evaluation |

### Weaviate Collections

| Collection | Properties | Purpose |
|---|---|---|
| `Course` | id, title, description, skill_tags, org_id + vector | Semantic course search |
| `Module` | id, course_id, title, transcript + vector | Content similarity |
| `QuizQuestion` | id, text, skill_tags, difficulty + vector | Find similar questions |
| `LearnerProfile` | user_id, skill_summary, learning_style + vector | Personalization matching |
| `SkillNode` | id, name, description, parent + vector | Skill graph navigation |

### ClickHouse Tables

```sql
-- All events from Kafka (immutable append-only)
CREATE TABLE events (
  event_id      UUID,
  event_type    String,
  org_id        UUID,
  actor_id      UUID,
  payload       String,                          -- JSON
  kafka_topic   String,
  kafka_offset  Int64,
  created_at    DateTime64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (org_id, event_type, created_at);

-- Aggregated learner analytics (materialized view updated hourly)
CREATE TABLE learner_activity_daily (
  user_id       UUID,
  course_id     UUID,
  date          Date,
  videos_watched Int32,
  quizzes_taken  Int32,
  avg_score      Float32,
  time_spent_secs Int64,
  messages_sent  Int32
) ENGINE = SummingMergeTree()
ORDER BY (user_id, course_id, date);
```

---

## 5. Event Catalog (Kafka)

### Topics

| Topic | Partitions | Retention | Who Publishes | Who Consumes |
|---|---|---|---|---|
| `course.events` | 12 | 30 days | Course Service | Analytics, Search, Notification, Badge |
| `user.events` | 12 | 30 days | User Service | Analytics, At-Risk, Gamification |
| `assessment.events` | 24 | 30 days | Quiz Engine | Certificate, Badge, Gamification, Analytics, At-Risk |
| `content.events` | 6 | 30 days | Content Service | Search (re-index), Analytics |
| `certificate.events` | 6 | 30 days | Certificate Engine | Notification, Audit |
| `badge.events` | 6 | 30 days | Badge Engine | Notification, Gamification, Audit |
| `payment.events` | 6 | 90 days | Payment Service | Course Service, Notification, Analytics |
| `ai.events` | 12 | 7 days | Agent Orchestrator | Audit, Langfuse, Analytics |
| `audit.events` | 6 | 2 years | ALL services | ClickHouse ingestion (append-only) |
| `notification.events` | 6 | 1 day | ALL services | Notification Service (fan-out) |

### Key Event Payloads (Avro Schema)

```json
// course.created
{
  "event_id": "uuid",
  "event_type": "course.created",
  "org_id": "uuid",
  "course_id": "uuid",
  "instructor_id": "uuid",
  "title": "Python for Beginners",
  "skill_tags": ["python", "programming"],
  "created_by_agent": true,
  "timestamp": "ISO-8601"
}

// assessment.completed
{
  "event_id": "uuid",
  "event_type": "assessment.completed",
  "org_id": "uuid",
  "user_id": "uuid",
  "course_id": "uuid",
  "quiz_attempt_id": "uuid",
  "score_pct": 85.5,
  "passed": true,
  "time_secs": 420,
  "timestamp": "ISO-8601"
}

// certificate.issued
{
  "event_id": "uuid",
  "event_type": "certificate.issued",
  "org_id": "uuid",
  "user_id": "uuid",
  "course_id": "uuid",
  "cert_id": "uuid",
  "pdf_url": "https://storage.../cert.pdf",
  "verify_url": "https://lms.../verify/uuid",
  "timestamp": "ISO-8601"
}

// learner.at_risk
{
  "event_id": "uuid",
  "event_type": "learner.at_risk",
  "org_id": "uuid",
  "user_id": "uuid",
  "course_id": "uuid",
  "risk_score": 0.82,
  "risk_factors": {
    "days_inactive": 8,
    "quiz_score_trend": -25,
    "video_completion_rate": 0.3
  },
  "timestamp": "ISO-8601"
}
```

### Event Flow: Course Creation by Admin Chat

```
Admin types → Agent Orchestrator
  → publishes: ai.events / agent.intent_parsed
  → calls: Course Service (gRPC) → course created
  → publishes: course.events / course.created
  → Kafka consumers respond:
      Search Service: indexes new course in Elasticsearch + Weaviate
      Notification: notifies instructor "Your course is live"
      Analytics: logs course creation metric
  → calls: Quiz Engine (gRPC) → questions generated
  → publishes: assessment.events / quiz.created
  → calls: Badge Engine (gRPC) → badge configured
  → publishes: badge.events / badge.configured
  → calls: Certificate Engine (gRPC) → cert template set
  → publishes: certificate.events / certificate.configured
  → streams SSE response back to Admin Chat UI
  → publishes: audit.events / admin.course_created (signed)
```

### Event Flow: Learner Completes Course → Certificate Auto-Issued

```
Learner submits final quiz
  → Quiz Engine scores answers
  → publishes: assessment.events / assessment.completed (score=92%, passed=true)
  → Temporal workflow triggers: "check_completion_criteria"
      → checks: all modules watched? final quiz passed? score ≥ 80%?
      → calls: Certificate Engine → generates PDF (WeasyPrint)
      → uploads PDF to MinIO → gets signed URL
      → updates issued_certs table
      → publishes: certificate.events / certificate.issued
      → calls: Badge Engine → auto-issues course completion badge
      → publishes: badge.events / badge.issued
  → Notification Service consumes both events:
      → sends email with PDF attachment
      → sends LinkedIn sharing link
      → sends push notification to learner app
  → Gamification Engine:
      → awards XP for course completion
      → checks level-up condition
      → updates leaderboard
  → Audit log: all above actions signed and stored in ClickHouse
```

---

## 6. API Endpoints Per Service

### API Gateway Routes

```
POST   /auth/login              → Keycloak
POST   /auth/refresh            → Keycloak
POST   /auth/logout             → Keycloak

POST   /admin/chat              → Agent Orchestrator (WebSocket: /admin/chat/ws)
GET    /admin/workflows         → Workflow Engine
POST   /admin/workflows         → Workflow Engine

GET    /courses                 → Course Service
POST   /courses                 → Course Service (admin/instructor only)
GET    /courses/:id             → Course Service
PATCH  /courses/:id             → Course Service
DELETE /courses/:id             → Course Service

GET    /courses/:id/modules     → Course Service
POST   /courses/:id/enroll      → User Service
GET    /enrollments/me          → User Service

POST   /quiz/:module_id/attempt → Quiz Engine
GET    /quiz/:attempt_id/result → Quiz Engine

POST   /content/upload          → Content Service
GET    /content/:id             → Content Service (signed CDN URL)

GET    /badges/me               → Badge Engine
GET    /certificates/me         → Certificate Engine
GET    /verify/:cert_id         → Certificate Engine (public, no auth)

GET    /analytics/dashboard     → Analytics Service
GET    /analytics/learner/:id   → Analytics Service

GET    /search                  → Search Service
POST   /webhooks                → Tool Registry Service
GET    /leaderboard/:course_id  → Gamification Service

GET    /discussions/:course_id  → Social Service
POST   /discussions/:course_id/threads → Social Service
POST   /discussions/threads/:id/replies → Social Service

GET    /learner/companion        → Learner AI Companion (WebSocket)
POST   /learner/companion/message → Learner AI Companion
```

### Agent Orchestrator — Internal Tool Registry Tools

```
create_course(title, description, modules[], skill_tags[])
upload_content(file_url, content_type, course_id)
generate_quiz(module_id, difficulty, num_questions)
assign_badge(course_id, criteria{})
configure_certificate(course_id, template, criteria{})
enroll_learners(course_id, user_ids[] | group_id)
send_notification(user_ids[], message, channels[])
set_workflow(trigger_event, dag_definition{})
get_analytics(course_id, metric, date_range)
search_courses(query, filters{})
schedule_live_session(course_id, datetime, tool="zoom"|"teams")
translate_course(course_id, target_locale)
```

---

## 7. Phase-by-Phase Build Plan

### Phase 0: Infrastructure Foundation (Weeks 1–2)

**Goal:** Every subsequent service can be deployed without infrastructure work.

**What to Build:**

```
Kubernetes cluster
├── Namespace: core-services      (all microservices)
├── Namespace: ai-services        (orchestrator, companion)
├── Namespace: data-layer         (postgres, redis, kafka, weaviate, clickhouse, minio)
└── Namespace: observability      (prometheus, grafana, jaeger, loki)

Helm charts scaffolded for each service
PostgreSQL deployed (Patroni HA)
Redis Cluster deployed (3 nodes + Sentinel)
Redpanda/Kafka deployed (3 brokers + Schema Registry)
MinIO deployed
Weaviate deployed
ClickHouse deployed
Keycloak deployed + configured (realms, roles: super_admin, org_admin, instructor, ta, learner)
OPA policies loaded
HashiCorp Vault deployed + service account tokens
Prometheus + Grafana + Loki + Jaeger deployed
ArgoCD connected to Git repo
Istio installed + mTLS enforced between namespaces
```

**Verify:**
```bash
kubectl get pods -A                         # All pods Running/Ready
kubectl get ing -A                          # Ingress routes visible
# Open Grafana → confirm metrics flowing
# Open Keycloak → create test user, login succeeds
# Open Kafka UI → create test topic, produce/consume message
```

**Phase 0 Test Checklist:**
```
[ ] All pods Running (0 CrashLoopBackOff)
[ ] Keycloak: user login → JWT issued → JWT validates at API Gateway
[ ] Kafka: message produced to test topic → consumed → no lag
[ ] PostgreSQL: write row → read back → replication to replica confirmed
[ ] Redis: set key → get key → expiry working
[ ] Weaviate: create collection → insert object → query returns it
[ ] ClickHouse: insert row → select row
[ ] MinIO: upload file → download file → URL works
[ ] Vault: store secret → retrieve secret → audit log shows access
[ ] Istio mTLS: service A can call service B; external call blocked
[ ] Network policy: namespace core-services CANNOT reach observability directly
[ ] ArgoCD: push change to Git → ArgoCD auto-deploys within 2 minutes
[ ] Secret rotation: rotate DB password in Vault → services reconnect without restart
[ ] HPA: simulate CPU load → new pod spawns automatically
[ ] Grafana dashboard: all infrastructure metrics visible (CPU, memory, network, disk)
```

---

### Phase 1: Core Services + Admin Chat MVP (Weeks 3–10)

**Goal:** Admin can log in, type in chat, upload a PDF, and have the AI create a full course with modules, quiz, badge, and certificate automatically.

**Phase 1 is divided into 5 sub-parts (2-week sprints):**

```
Phase 1.1 (Week 3–4)  → Foundation: Gateway + Auth + User Service + Database
Phase 1.2 (Week 5–6)  → Content Ingestion: Files + YouTube + Meet + FFmpeg + Whisper
Phase 1.3 (Week 7)    → Domain Services: Course + Quiz + Badge + Certificate + Notification
Phase 1.4 (Week 8–9)  → The Brain: Agent Orchestrator + Tool Registry + Temporal Workflows
Phase 1.5 (Week 10)   → Admin Chat UI + Full Integration Testing + Audit Hardening
```

---

#### Phase 1.1 — Foundation Layer (Week 3–4)

**Goal:** Every service can start, authenticate users, and talk to the database. Nothing else matters until this works.

**What to Build:**

```
API Gateway (Kong)
  ├── Routes configured for all planned services
  ├── JWT validation plugin (validates Keycloak tokens)
  ├── Rate limiting plugin (100 req/min per user, 1000 req/min per org)
  ├── CORS headers for React frontends
  └── Request logging → Loki

Auth Service (Keycloak integration layer)
  ├── POST /auth/login    → calls Keycloak, returns JWT + refresh token
  ├── POST /auth/refresh  → refreshes JWT
  ├── POST /auth/logout   → invalidates session in Redis
  └── GET  /auth/me       → returns current user profile from JWT

OPA Policies (loaded into OPA sidecar)
  ├── admin_only.rego     → only super_admin and org_admin can access /admin/*
  ├── course_owner.rego   → instructor can only edit own courses
  ├── org_isolation.rego  → users can only see data from their own org_id
  └── enrollment.rego     → learner can only access enrolled course content

User Service (Node.js)
  ├── POST /users              → create user (admin only)
  ├── GET  /users/:id          → get user profile
  ├── PATCH /users/:id         → update user profile
  ├── GET  /users              → list users in org (admin/instructor only)
  ├── POST /users/:id/roles    → assign role (admin only)
  └── Publishes: user.created, user.updated events to Kafka

Database Migrations (Flyway or Liquibase)
  └── Run all PostgreSQL table creation scripts from Section 4
      Priority tables: users, organizations, audit_log

Redis Session Setup
  └── session:{user_id} written on login, deleted on logout
```

**Phase 1.1 — Done When:**
```
[ ] POST /auth/login with correct credentials → returns JWT in < 500ms
[ ] POST /auth/login with wrong password → returns 401
[ ] GET /users/:id with no token → API Gateway returns 401 (never reaches service)
[ ] GET /admin/chat with learner JWT → OPA returns 403
[ ] Admin JWT can GET /users list, Learner JWT cannot (403)
[ ] Instructor JWT can only see users in own org (cross-org test returns empty)
[ ] User created → user.created event published to Kafka → visible in Kafka UI
[ ] Session stored in Redis → verify with redis-cli GET session:{user_id}
[ ] All PostgreSQL tables created → verify with \dt in psql
[ ] Kong rate limit: send 101 requests in 1 min → 101st returns 429 Too Many Requests
[ ] Keycloak admin console accessible → test user created and assigned role
```

---

#### Phase 1.2 — Content Ingestion Service (Week 5–6)

**Goal:** Admin can upload any file or paste any URL and the system processes it into usable content with text, captions, and embeddings ready.

**What to Build:**

```
Content Service (Python — FastAPI)
  │
  ├── Upload Endpoint
  │     POST /content/upload
  │     ├── Receives: multipart file (video, audio, PDF, PPTX, SCORM zip)
  │     ├── Step 1: ClamAV virus scan → reject if infected
  │     ├── Step 2: Detect file type (python-magic library)
  │     ├── Step 3: Store original file in MinIO /raw/{org_id}/{uuid}
  │     └── Step 4: Queue processing job → returns job_id immediately
  │
  ├── URL Ingestion Endpoints
  │     POST /content/ingest/youtube      → YouTube Data API v3
  │     POST /content/ingest/google-meet  → Google Drive API download
  │     POST /content/ingest/zoom         → Zoom API download
  │     POST /content/ingest/web-url      → Playwright scrape
  │     (Podcast RSS → Phase 2)
  │
  ├── Processing Workers (async background jobs)
  │     ├── PDF Worker:   PyMuPDF → extract text → chunk by page/section
  │     ├── Video Worker: FFmpeg → transcode to HLS (360p, 720p, 1080p) → MinIO
  │     ├── Audio Worker: FFmpeg extract audio → Whisper AI → .vtt caption file
  │     ├── PPTX Worker:  LibreOffice convert → PDF → then PDF worker
  │     └── SCORM Worker: Unzip → parse imsmanifest.xml → extract modules
  │
  ├── Embedding Worker (runs after text extraction)
  │     ├── Chunk text into 512-token windows
  │     ├── Call Claude/OpenAI embeddings API
  │     ├── Store in PostgreSQL modules.embedding (pgvector)
  │     └── Store in Weaviate Module collection
  │
  ├── Status Endpoint
  │     GET /content/status/:job_id  → SSE stream: pending → processing → ready/failed
  │
  └── Publishes: content.ingested event to Kafka when processing complete
```

**Processing Pipeline Flow:**
```
Admin uploads Python_Course.pdf
    ↓
POST /content/upload → ClamAV scan (2s) → MinIO store → job_id returned
    ↓
Admin sees: "Uploading... Scanning for viruses... Stored. Processing started."
    ↓
PDF Worker (async):
  PyMuPDF extracts 47 pages of text
  AI chunks into 8 logical sections (detects headings)
  Each section = one module candidate
    ↓
Embedding Worker:
  8 embeddings generated → PostgreSQL + Weaviate
    ↓
content.ingested event published to Kafka
  → payload: { job_id, file_type: pdf, module_count: 8, org_id }
    ↓
Admin SSE stream: "✅ Content processed. Found 8 modules. Ready to create course."
```

**YouTube Ingestion Flow:**
```
Admin pastes: https://youtube.com/watch?v=abc123
    ↓
POST /content/ingest/youtube → YouTube Data API v3
  Fetches: title, description, duration, thumbnail, auto-captions (.vtt)
  Validates: video is public, not age-restricted
    ↓
Module record created:
  content_type:     youtube_embed
  content_url:      https://youtube.com/embed/abc123?rel=0
  source_type:      youtube
  source_url:       https://youtube.com/watch?v=abc123
  source_metadata:  { video_id, channel_name, view_count, published_at }
  transcript:       AI-cleaned version of YouTube auto-captions
  caption_url:      MinIO URL of stored .vtt file
  duration_secs:    from YouTube API
    ↓
Embedding generated from transcript → Weaviate
    ↓
content.ingested event published
```

**Phase 1.2 — Done When:**
```
[ ] Upload a 10MB PDF → virus scan passes → job_id returned in < 1s
[ ] Upload EICAR test virus file → ClamAV rejects with 422 error message
[ ] Upload PDF → SSE status stream shows: pending → processing → ready
[ ] Upload PDF → 8 modules extracted → text matches PDF content (spot check)
[ ] Upload PDF → embeddings stored in both PostgreSQL and Weaviate
[ ] Upload 500MB MP4 video → FFmpeg transcodes → HLS available in 3 quality levels
[ ] Upload MP3 audio → Whisper generates .vtt captions → stored in MinIO
[ ] Paste YouTube URL (public video) → module created with embed URL + transcript
[ ] Paste YouTube URL (private video) → rejected with clear error message
[ ] Paste Google Meet Drive URL → video downloaded → transcoded → captions generated
[ ] Paste Zoom recording URL → video downloaded → processed correctly
[ ] Upload .pptx file → LibreOffice converts → PDF pipeline runs → modules extracted
[ ] Upload SCORM 1.2 zip → manifest parsed → modules extracted with correct order
[ ] 10 concurrent uploads → all process correctly without job conflicts
[ ] content.ingested Kafka event published for each successful processing job
```

---

#### Phase 1.3 — Domain Services (Week 7)

**Goal:** The 5 core business services exist and can be called via gRPC. No AI yet — just the pure data services.

**What to Build:**

```
Course Service (Node.js + gRPC)
  ├── CreateCourse(title, description, org_id, instructor_id, skill_tags)
  ├── GetCourse(course_id) → full course with modules
  ├── UpdateCourse(course_id, fields{})
  ├── PublishCourse(course_id) → status: draft → published, version++
  ├── ArchiveCourse(course_id)
  ├── ListCourses(org_id, filters{}) → paginated
  ├── AddModule(course_id, module_data{})
  ├── ReorderModules(course_id, order[])
  ├── ImportSCORM(course_id, scorm_data{})
  └── Publishes: course.created, course.published, course.updated to Kafka

Quiz Engine (Node.js + gRPC)
  ├── GenerateQuestions(module_id, content_text, num_questions, difficulty)
  │     → calls Claude API with module text → returns MCQ questions
  ├── CreateQuiz(module_id, questions[])
  ├── GetQuiz(module_id) → questions (without correct answers for learners)
  ├── SubmitAttempt(user_id, quiz_id, answers[])
  │     → scores answers → calculates score_pct → saves to quiz_attempts
  ├── GetAttemptResult(attempt_id) → score, correct answers, explanations
  └── Publishes: quiz.created, assessment.completed to Kafka

Badge Engine (Node.js + gRPC)
  ├── CreateBadge(org_id, name, description, image_url, criteria{})
  ├── GetBadge(badge_id)
  ├── ListBadges(org_id)
  ├── ConfigureBadgeForCourse(course_id, badge_id, auto_issue_criteria{})
  ├── IssueBadge(user_id, badge_id, course_id)
  │     → creates Open Badges 3.0 assertion JSON
  │     → stores in issued_badges table
  └── Publishes: badge.configured, badge.issued to Kafka

Certificate Engine (Python + gRPC)
  ├── CreateTemplate(org_id, course_id, html_template, criteria{})
  ├── GetTemplate(certificate_id)
  ├── GenerateCertificate(user_id, course_id)
  │     → WeasyPrint renders HTML template with learner data
  │     → Adds QR code (links to /verify/:cert_id)
  │     → Signs PDF with RSA-SHA256
  │     → Uploads to MinIO /certificates/{org_id}/{user_id}/{cert_id}.pdf
  │     → Returns signed MinIO URL
  ├── VerifyCertificate(cert_id) → public endpoint, no auth required
  └── Publishes: certificate.configured, certificate.issued to Kafka

Notification Service (Node.js + gRPC)
  ├── SendEmail(to[], subject, html_body, attachments[])
  │     → SendGrid or SMTP
  ├── SendBulkEmail(user_ids[], template_id, variables{})
  ├── Subscribes to Kafka:
  │     certificate.issued → sends cert email with PDF attachment
  │     badge.issued → sends badge notification email
  └── (Push, SMS, Slack → Phase 2)
```

**Phase 1.3 — Done When:**
```
[ ] gRPC: CreateCourse call → row in PostgreSQL courses table → course.created Kafka event
[ ] gRPC: PublishCourse → status changes to 'published' → version incremented
[ ] gRPC: AddModule → module saved with correct order_index
[ ] gRPC: GenerateQuestions(module_text) → Claude returns 5 MCQ questions → stored in DB
[ ] gRPC: SubmitAttempt(answers) → score calculated correctly → assessment.completed event
[ ] gRPC: IssueBadge → issued_badges row created → Open Badges 3.0 JSON valid
[ ] gRPC: GenerateCertificate → PDF created → QR code scans to valid /verify URL
[ ] gRPC: VerifyCertificate(cert_id) → returns cert data without auth token
[ ] Certificate PDF: opens correctly in PDF viewer, learner name displayed correctly
[ ] Email: SendEmail → delivered to test inbox (check SendGrid activity log)
[ ] Email: certificate.issued Kafka event → notification service sends cert email automatically
[ ] All 5 services: health check endpoint GET /health returns 200
[ ] All 5 services: gRPC reflection enabled (can introspect with grpcurl)
[ ] Istio mTLS: service-to-service calls show as mTLS in Kiali dashboard
```

---

#### Phase 1.4 — The Brain: Agent Orchestrator + Tool Registry (Week 8–9)

**Goal:** The AI agent can receive a natural language command from admin, plan a sequence of actions, call all the right services, and stream progress back in real-time.

**What to Build:**

```
Tool Registry Service (Python)
  ├── RegisterTool(tool_schema{})   → stores in tool_registry table
  ├── GetTool(name)                 → returns schema + endpoint
  ├── ListTools(enabled=true)       → returns all available tools
  ├── EnableTool / DisableTool      → hot toggle without restart
  └── Phase 1 tools registered:
        create_course
        add_module
        generate_quiz
        configure_badge
        configure_certificate
        enroll_learners
        send_notification
        ingest_content (file, youtube, google_meet, zoom)
        publish_course
        get_course_analytics

Agent Orchestrator (Python — LangGraph)
  │
  ├── Intent Parser Node
  │     → Reads admin message
  │     → Classifies intent: CREATE_COURSE | ADD_CONTENT | ASSIGN_COURSE |
  │                           SEND_NOTIFICATION | GET_ANALYTICS | OTHER
  │     → Extracts entities: course name, user groups, file references, URLs
  │
  ├── Planner Node
  │     → Builds execution plan (ordered list of tool calls)
  │     → Example plan for "Create Python course from PDF":
  │           Step 1: ingest_content(file=pdf, type=pdf)
  │           Step 2: create_course(title, modules_from_content)
  │           Step 3: generate_quiz(module_ids[])
  │           Step 4: configure_badge(course_id, criteria)
  │           Step 5: configure_certificate(course_id, template)
  │           Step 6: publish_course(course_id)
  │
  ├── Memory Manager Node
  │     ├── READ:  Redis session context (last 10 messages)
  │     ├── READ:  PostgreSQL conversation history (full history)
  │     ├── WRITE: new messages appended to both stores
  │     └── COMPRESS: if conversation > 50 turns → summarize old turns → store summary
  │
  ├── Tool Dispatcher Node
  │     ├── Reads tool schema from Tool Registry
  │     ├── Calls the correct gRPC endpoint for each tool
  │     ├── Handles tool failures: retry 3x → skip with explanation → continue plan
  │     └── Streams intermediate results back during execution
  │
  ├── Response Generator Node
  │     → Formats final response with what was done + what failed + next suggestions
  │     → Streams via SSE to Admin Chat UI
  │
  └── Temporal.io Workflow Integration
        → Long multi-step plans dispatched as Temporal workflows
        → Short single-step commands handled in-process
        → Workflow state survives Orchestrator restart

Temporal Worker (Python)
  ├── Executes workflow activities (each tool call = one activity)
  ├── Retries failed activities automatically (3x with backoff)
  ├── Compensates on hard failure: rolls back partially created course
  └── Visible in Temporal Web UI (http://temporal-ui:8080)
```

**Agent Decision Flow:**
```
Admin: "Create a Python course for our engineering team from this PDF and assign it to them"
    ↓
Intent Parser:
  intent: CREATE_COURSE + ASSIGN_COURSE
  entities: {
    topic: "Python",
    audience: "engineering team",
    source: "uploaded_pdf",
    auto_assign: true
  }
    ↓
Planner builds DAG:
  [ingest_content] → [create_course] → [generate_quiz] → [configure_badge]
       ↓ (parallel after course created)
  [configure_certificate] + [get_user_group(engineering)]
       ↓
  [enroll_learners(user_ids[])] → [send_notification(enrolled)]
    ↓
Tool Dispatcher executes each step, streaming updates:
  "📄 Extracting content from PDF... (1/6)"
  "📚 Creating course structure... (2/6)"
  "❓ Generating quiz questions... (3/6)"
  "🏅 Configuring badge... (4/6)"
  "📜 Setting up certificate... (5/6)"
  "👥 Enrolling 23 engineers + sending notifications... (6/6)"
  "✅ Done! Python Basics course created, 23 learners enrolled."
```

**Phase 1.4 — Done When:**
```
[ ] Tool Registry: register new tool via POST API → available to agent immediately (no restart)
[ ] Tool Registry: disable a tool → agent stops using it, explains limitation to admin
[ ] Agent: "Create a course called Intro to SQL" → Course Service called → course created in DB
[ ] Agent: "Upload this PDF and make a course" → full 6-step plan executed → course ready
[ ] Agent: "What courses do we have?" → lists courses from Course Service
[ ] Agent: memory works → "Make it 10 questions" (refers to previous quiz command) → correct context
[ ] Agent: Tool failure → Badge Engine down → agent skips badge, completes rest, reports skip
[ ] Agent: ambiguous command "make something for Python" → agent asks clarifying question
[ ] Temporal: long workflow survives Orchestrator pod restart (kill pod mid-workflow)
[ ] Temporal: failed activity retries 3 times → visible in Temporal Web UI
[ ] SSE: streaming response starts within 1 second of admin sending message
[ ] SSE: each tool call result streams in real-time (not all at end)
[ ] Memory: conversation stored in Redis (verify with redis-cli) AND PostgreSQL
[ ] Memory: Redis TTL set correctly (expires after 24h of inactivity)
[ ] Audit: every agent action published to audit.events Kafka topic with actor_id
[ ] Langfuse: LLM calls visible in Langfuse dashboard (token count, latency, prompt)
```

---

#### Phase 1.5 — Admin Chat UI + Full Integration + Audit Hardening (Week 10)

**Goal:** A working, polished Admin Chat Studio that a real admin can use. Every action is verified end-to-end and every audit requirement is met.

**What to Build:**

```
Admin Chat Studio (React + TypeScript)
  │
  ├── Layout
  │     ├── Left sidebar:    Navigation (courses, users, analytics, settings)
  │     ├── Center panel:    Chat interface (main workspace)
  │     └── Right panel:     Live preview (shows what AI is building in real-time)
  │
  ├── Chat Interface Component
  │     ├── Message thread (admin messages + AI responses)
  │     ├── Streaming text display (tokens appear as they stream via SSE)
  │     ├── Tool call status cards:
  │     │     "📄 Extracting PDF..." [spinner]
  │     │     "✅ Course created: Python Basics" [green]
  │     │     "⚠️  Badge engine unavailable — skipped" [yellow]
  │     ├── File upload zone (drag-and-drop or click to browse)
  │     │     Supported: PDF, MP4, MP3, PPTX, SCORM zip
  │     ├── URL input detection (auto-detects YouTube/Meet/Zoom links)
  │     └── Action history sidebar (past 30 admin actions with timestamps)
  │
  ├── Live Course Preview Panel
  │     ├── Updates in real-time as agent builds the course
  │     ├── Shows: course title, module list, quiz count, badge, cert status
  │     ├── Each item has status indicator (pending / creating / done / failed)
  │     └── "Open full course editor" link (goes to course detail page)
  │
  ├── Auth Flow
  │     ├── Login page → POST /auth/login → store JWT in httpOnly cookie
  │     ├── Auto-refresh JWT before expiry (background timer)
  │     └── Logout → DELETE /auth/logout → clear cookie → redirect to login
  │
  └── Error Handling
        ├── Network error → show retry button, don't lose chat history
        ├── AI timeout (>30s) → show "Taking longer than expected..." message
        └── Partial failure → show what succeeded and what needs retry

Audit Hardening
  ├── Every Kafka event → Audit Service → HMAC-SHA256 sign → PostgreSQL audit_log
  ├── Every Kafka event → ClickHouse events table (via Kafka Connect)
  ├── Verify: no audit entry can be modified (PostgreSQL role has INSERT only, no UPDATE/DELETE)
  └── Verify: HMAC signature validates correctly on read

Integration Test Suite (automated)
  ├── Jest/Pytest end-to-end tests
  ├── Test: full course creation flow (PDF upload → course → quiz → badge → cert)
  ├── Test: auth failure paths (wrong token, expired token, wrong role)
  ├── Test: Kafka events all published correctly for every action
  └── Run in CI pipeline on every pull request
```

**Phase 1.5 — Done When (Full Phase 1 Acceptance Criteria):**
```
FUNCTIONAL:
[ ] Admin logs in → sees Admin Chat Studio (no errors in console)
[ ] Admin types: "Create a Python beginner course from this PDF" + uploads PDF
[ ] Streaming response starts within 1 second
[ ] Tool call status cards update in real-time during execution
[ ] Right panel shows course building live (modules appear one by one)
[ ] Course fully created within 60 seconds (for a 20-page PDF)
[ ] Admin can open the created course and see all modules, quiz, badge, cert configured
[ ] Admin types: "Enroll all users in the Sales department" → users enrolled + email sent
[ ] Admin types: "Show me all courses created this month" → correct list returned
[ ] File drag-and-drop works (PDF, MP4, PPTX all accepted, .exe rejected)
[ ] YouTube link pasted → auto-detected → module created with embed
[ ] Google Meet link pasted → auto-detected → video processed

SECURITY:
[ ] JWT in httpOnly cookie (not localStorage — prevents XSS theft)
[ ] CSRF token on all POST requests
[ ] Admin page redirects to login if JWT expired
[ ] API calls from browser devtools with learner JWT → 403
[ ] SQL injection in chat message → sanitized, no DB error
[ ] Uploaded virus file → rejected with clear error, not stored

AUDIT:
[ ] Every admin action → audit_log row with correct actor_id, action, payload, signature
[ ] HMAC signature validates: tamper with payload → signature fails
[ ] ClickHouse has matching events for every audit_log row
[ ] audit_log table: try UPDATE or DELETE → permission denied (role enforced)

RELIABILITY:
[ ] Kill Agent Orchestrator pod mid-workflow → Temporal resumes → completes correctly
[ ] Kill Quiz Engine → course created without quiz → audit log shows quiz skipped
[ ] Kill Kafka → admin action queued → on Kafka restart, events flushed
[ ] Deploy broken image → ArgoCD health check fails → auto-rollback < 5 min

PERFORMANCE:
[ ] 100 simultaneous admin chat sessions → all respond, p95 < 2 seconds
[ ] 500 simultaneous course list requests → p95 < 200ms (Redis cache)
[ ] PDF processing (20 pages) completes within 30 seconds
[ ] Video transcoding (10 min video) completes within 5 minutes
[ ] LLM intent classification: < 1 second for standard commands

UNIT TESTS:
[ ] Course Service:    80%+ line coverage
[ ] Quiz Engine:       80%+ line coverage (score calculation all paths)
[ ] Certificate Engine: 80%+ line coverage (PDF generation, QR, signing)
[ ] Agent Orchestrator: intent classification correct for 15 test commands
[ ] Tool Registry:     register, list, enable, disable all tested

INTEGRATION TESTS (automated, run in CI):
[ ] Full create-course flow test passes
[ ] Full enroll-learners flow test passes
[ ] Auth failure paths all return correct HTTP status codes
[ ] Kafka events: all 5 types published + Schema Registry validates them
[ ] Audit log: all actions traceable end-to-end
```

---

**Phase 1 Complete Definition:**
> Phase 1 is complete when a non-technical admin can sit down, open the chat, upload a PDF (or paste a link), describe what they want, and have a fully structured course with quiz, badge, and certificate appear — without touching any other UI — and every single action is logged in the audit trail.

---

### Phase 2: Learner Experience (Weeks 11–16)

**Goal:** Learners have a personalized, engaging experience with AI tutoring, gamification, social features, and automatic badges/certificates.

**What to Build:**

```
Learner App (React PWA — full build)
  ├── Course browser + enrollment
  ├── Module player (video, PDF, text, quiz)
  ├── AI Companion chat panel (persistent per course)
  ├── Progress dashboard
  └── Badge + certificate showcase

Adaptive Quiz Engine (upgrade from Phase 1)
  └── IRT algorithm: adjust difficulty based on learner's ability score (theta)

Learner AI Companion Service
  ├── Dedicated Python agent per learner session
  ├── Reads: Redis (working memory, last 10 turns)
  ├── Reads: PostgreSQL (full learning history, quiz weak areas)
  ├── Reads: Weaviate (relevant course content chunks)
  ├── Generates: personalized explanations, hints, practice questions
  └── Publishes: learner.interaction events to Kafka

Gamification Engine
  ├── XP award rules (video=10xp, quiz_pass=50xp, badge=100xp, streak=20xp/day)
  ├── Streak tracking (resets at midnight if no activity)
  ├── Level thresholds (Level 2=500xp, Level 3=1500xp, ...)
  └── Leaderboard API (sorted set in Redis, refreshed every 15min)

Badge Engine (upgrade)
  └── Open Badges 3.0 assertion JSON + hosted verification endpoint

Certificate Engine (upgrade)
  ├── Digital signature (RSA-SHA256 signing of PDF)
  ├── Blockchain anchoring (optional per org config)
  └── LinkedIn sharing deep link

At-Risk Learner Detection Service
  ├── Daily batch job: scores every active enrollment
  ├── Risk factors: days_inactive, quiz_score_trend, video_completion, messages_sent
  ├── Publishes: learner.at_risk events → Notification + Instructor dashboard
  └── Logs intervention history to prevent over-notification

Social Learning Layer
  ├── Discussion threads per module/course
  ├── Replies, upvotes, instructor answers (marked)
  ├── Peer assignment review (rubric-based)
  └── Notification on replies (reuses Notification Service)

Notification Service (upgrade from Phase 1)
  └── Adds: push notifications (FCM/APNs), SMS (Twilio), Slack, Teams
```

**Phase 2 Test Checklist:**
```
[ ] Unit: Gamification — XP calculation correct for all 8 event types
[ ] Unit: IRT — ability score (theta) updates correctly after correct/wrong answers
[ ] Unit: At-Risk scoring — risk_score = 0.9 for learner inactive 10 days with dropping scores
[ ] Unit: AI Companion — correct context assembled from Redis + PostgreSQL + Weaviate
[ ] Integration: Quiz submit → assessment.events/assessment.completed → Temporal → cert PDF in MinIO
[ ] Integration: cert issued → notification.events → email + push delivered to learner
[ ] Integration: badge issued → gamification → 100 XP added → leaderboard updated
[ ] E2E: Learner enrolls → watches all videos → takes quiz (score 85%) → cert issued → email received
[ ] E2E: Learner asks AI Companion "explain recursion" → gets response using course content
[ ] E2E: Learner asks same question next session → AI remembers they asked before
[ ] Performance: 1,000 concurrent learners taking quizzes → Quiz Engine p95 < 1 second
[ ] Performance: Leaderboard for 10,000 learner org → query < 100ms (Redis sorted set)
[ ] Performance: AI Companion response → first token streamed < 1 second
[ ] Memory: AI Companion maintains correct context through 20-turn conversation
[ ] At-risk: Simulate learner not logging in for 7 days → at_risk event fired within 24h
[ ] At-risk: Instructor receives alert email with learner name and risk factors
[ ] PDF: Certificate PDF opens correctly in Adobe Reader, Chrome, Safari
[ ] PDF: QR code on certificate scans to correct verification URL, returns valid JSON
[ ] Badge: Open Badges 3.0 assertion JSON validates against OB3 spec (use validator tool)
[ ] Social: Discussion post visible to all enrolled learners within 500ms
[ ] Social: Reply notification sent to thread author within 10 seconds
[ ] Social: Instructor-marked answer displayed prominently at top
[ ] Streak: Login today, skip tomorrow → streak resets to 0; login again → streak = 1
[ ] Level-up: Accumulate 500 XP → level 2 badge auto-issued + notification sent
[ ] Accessibility: Learner App passes Lighthouse accessibility score ≥ 90
[ ] Mobile: Learner App works on iPhone Safari and Android Chrome (no broken layouts)
```

---

### Phase 3: Growth Features (Weeks 17–20)

**Goal:** Monetization, global reach, offline use, and admin visual tools.

**What to Build:**

```
Content Marketplace
  ├── Course listing with pricing (free / one-time / subscription)
  ├── Stripe Checkout integration + webhook handling
  ├── Revenue split calculation (platform % configurable per org)
  ├── Course ratings + reviews
  └── Recommendation engine (Weaviate similarity: "learners who took X also took Y")

Offline-First PWA
  ├── Service Worker: caches video chunks, PDFs, quiz JSON
  ├── IndexedDB: stores offline quiz attempts + progress
  ├── Sync Service: on reconnect, replays queued events in order
  └── Conflict resolution: server timestamp wins on concurrent edits

Multi-Language & i18n Service
  ├── Admin clicks "Translate to Spanish" → LLM translates all course text
  ├── Stores translations in PostgreSQL (content_id + locale)
  ├── Caption tracks (Whisper output) stored per locale
  └── RTL layout support (Arabic, Hebrew) in React app

Visual Workflow Builder
  ├── React Flow drag-and-drop editor in Admin Chat Studio
  ├── Node types: Start, Module, Quiz, Badge, Decision (if/else), End
  ├── Saves DAG JSON to workflow_definitions table
  └── Temporal.io executes the saved workflow

Instructor Portal (full build)
  ├── Course analytics per cohort
  ├── Student roster with risk scores
  ├── Direct message learners
  └── Grade assignment submissions
```

**Phase 3 Test Checklist:**
```
[ ] Payment: Learner purchases paid course → Stripe webhook received → enrollment created
[ ] Payment: Failed card → retry → learner notified → enrollment NOT created
[ ] Payment: Refund flow → enrollment revoked → access removed
[ ] Payment: Instructor payout calculated correctly (90/10 split test)
[ ] Offline: Chrome DevTools → Network: Offline → learner can watch cached video
[ ] Offline: Complete quiz offline → answers stored in IndexedDB
[ ] Offline: Go back online → queued quiz attempt synced to server → score recorded
[ ] Sync conflict: Same video progress updated on 2 devices → server timestamp wins
[ ] Translation: Spanish translation of course text is semantically correct (manual review 5 modules)
[ ] Translation: Translated course searchable in Spanish via Search Service
[ ] RTL: Arabic language course displays correctly right-to-left in learner app
[ ] Visual builder: Create "Module 1 → Quiz → IF score<70% THEN Remediation ELSE Module 2" flow
[ ] Visual builder: Save workflow → Temporal executes correct path for score=60% vs score=80%
[ ] Marketplace: Course appears in public marketplace listing
[ ] Marketplace: Recommendation shows relevant courses (not random) based on enrollment history
[ ] Marketplace: Course rating persists and shows correct average after 10 reviews
[ ] Instructor portal: At-risk students visible with correct risk scores
[ ] Instructor portal: Clicking student shows full progress breakdown per module
```

---

### Phase 4: Platform Maturity (Weeks 21+)

**Goal:** Enterprise readiness, developer ecosystem, and safe progressive delivery.

**What to Build:**

```
Developer Portal
  ├── Self-service API key generation (scoped to read/write/webhook)
  ├── Webhook console (create, test, view delivery logs)
  ├── OpenAPI documentation (auto-generated from service specs)
  └── Usage dashboards (API call counts, error rates)

Feature Flag & A/B Testing Service
  ├── Flag management UI (toggle per user/org/percentage)
  ├── Experiment tracking (A/B test two quiz formats)
  ├── Results tracked in ClickHouse
  └── OpenFeature SDK in all client apps

Enterprise SSO (SAML 2.0)
  └── Keycloak SAML Identity Provider configuration + test with Okta

Multi-tenant Organization Hierarchy
  └── Super Admin can create orgs, assign Org Admins, set plan limits

Advanced Analytics
  ├── ClickHouse materialized views for all key metrics
  ├── Grafana dashboards: completion rates, engagement, revenue
  └── Data export (CSV, API) for enterprise reporting
```

**Phase 4 Test Checklist:**
```
[ ] API key: Scoped read-only key cannot POST to /courses (403)
[ ] API key: Revoked key returns 401 immediately (no caching of revoked keys)
[ ] Webhook: certificate.issued event → webhook fires → external endpoint receives payload
[ ] Webhook: webhook endpoint returns 500 → retry 3x with exponential backoff → DLQ
[ ] Webhook: delivery log shows all attempts + response status codes
[ ] Feature flag: Enable "new_quiz_ui" for 10% of learners → confirm 10% ± 2% see it
[ ] Feature flag: Disable flag → 100% of learners on old UI immediately
[ ] A/B test: Quiz format A vs B → ClickHouse records which variant each user saw
[ ] A/B test: Results dashboard shows correct conversion rate per variant
[ ] SSO: SAML login from Okta → user provisioned in Keycloak → can access LMS
[ ] SSO: User deprovisioned in IdP → cannot log in (just-in-time deprovisioning)
[ ] Multi-tenant: Super Admin creates Org B → Org B users cannot see Org A data (RLS test)
[ ] Multi-tenant: Org plan limit enforced (starter plan: max 100 courses → 101st fails gracefully)
[ ] Analytics: Dashboard loads within 2 seconds for org with 10,000 learners
[ ] Analytics: CSV export of learner progress matches database values exactly
[ ] Observability: LLM call cost tracked in Langfuse per org (billing preparation)
```

---

## 8. Security & Compliance

### RBAC Permissions Matrix

| Permission | Super Admin | Org Admin | Instructor | TA | Learner |
|---|---|---|---|---|---|
| Create/delete organizations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage org settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create/publish courses | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete any course | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete own course | ✅ | ✅ | ✅ | ❌ | ❌ |
| View all learner data | ✅ | ✅ | Own students | Own students | Own only |
| Issue badges manually | ✅ | ✅ | ✅ | ❌ | ❌ |
| Configure certificate templates | ✅ | ✅ | ✅ | ❌ | ❌ |
| Access Admin Chat Studio | ✅ | ✅ | ❌ | ❌ | ❌ |
| View analytics dashboard | ✅ | ✅ | Own courses | ❌ | Own only |
| Manage Tool Registry | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enroll/unenroll learners | ✅ | ✅ | ✅ | ✅ | Self only |
| Grade assignments | ✅ | ✅ | ✅ | ✅ | ❌ |
| Post discussions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Purchase courses | ✅ | ✅ | ✅ | ✅ | ✅ |

### Encryption Requirements

| Data | Encryption | Where |
|---|---|---|
| Data at rest (all DBs) | AES-256 | Kubernetes PVC encryption |
| Data in transit (external) | TLS 1.3 | API Gateway |
| Data in transit (internal) | mTLS | Istio service mesh |
| Passwords | bcrypt (cost=12) | Keycloak |
| API keys | SHA-256 hash stored | Never store plaintext |
| Certificates (PDF) | RSA-SHA256 digital signature | Certificate Engine |
| Audit log entries | HMAC-SHA256 signature | Audit Service |
| Secrets (DB passwords, API keys) | Vault encrypted storage | HashiCorp Vault |

### Compliance Standards

| Standard | What It Requires | How We Meet It |
|---|---|---|
| **GDPR** | Right to erasure, data portability, consent | User data delete endpoint, export endpoint, consent flags in DB |
| **FERPA** | Student educational record privacy | Org-level RLS, instructor-only access to student grades |
| **HIPAA** | PHI protection (if health training) | AES-256, audit logs, BAA with cloud providers |
| **SOC 2 Type II** | Security, availability, confidentiality | Audit logs, access controls, monitoring, incident response runbook |
| **ISO 27001** | Information security management | Security policies, risk assessment, Vault secrets management |
| **WCAG 2.1 AA** | Accessibility for disabled learners | Lighthouse ≥ 90, screen reader tested, keyboard navigation |

### Audit Log Requirements

Every audit entry MUST contain:
- `actor_id` — who performed the action (user UUID)
- `actor_role` — their role at time of action
- `action` — what happened (e.g., `course.published`, `badge.issued`)
- `resource_type` + `resource_id` — what was affected
- `payload` — before/after state for mutations
- `ip_address` — client IP (for forensics)
- `timestamp` — ISO-8601 with milliseconds
- `signature` — HMAC-SHA256 of the above fields (prevents tampering)

Audit logs are:
- Written to PostgreSQL `audit_log` table immediately
- Written to ClickHouse `events` table via Kafka (for analytics)
- Retained: 90 days hot (PostgreSQL), 2 years cold (ClickHouse / S3)
- Read-only: no update or delete operations allowed on audit tables

---

## 9. Deployment Reference

### Kubernetes Namespaces & Resource Allocations

| Namespace | Services | Notes |
|---|---|---|
| `core-services` | API Gateway, Auth, Course, User, Quiz, Badge, Certificate, Notification, Content, Payment, Search, Gamification, Social, At-Risk | All business logic services |
| `ai-services` | Agent Orchestrator, Learner AI Companion, Workflow Engine (Temporal) | Higher CPU/memory, GPU optional |
| `data-layer` | PostgreSQL, Redis, Kafka/Redpanda, Weaviate, ClickHouse, MinIO | Stateful — use StatefulSets |
| `observability` | Prometheus, Grafana, Jaeger, Loki, Langfuse | Read-only access to other namespaces |

### Service Resource Allocations

| Service | Replicas (min) | CPU Request | Memory Request | CPU Limit | Memory Limit |
|---|---|---|---|---|---|
| API Gateway | 2 | 500m | 512Mi | 2000m | 2Gi |
| Agent Orchestrator | 2 | 2000m | 4Gi | 4000m | 8Gi |
| Learner AI Companion | 3 | 1000m | 2Gi | 2000m | 4Gi |
| Course Service | 3 | 250m | 512Mi | 1000m | 1Gi |
| Quiz Engine | 3 | 500m | 1Gi | 2000m | 2Gi |
| Certificate Engine | 2 | 500m | 1Gi | 1000m | 2Gi |
| Content Service | 2 | 1000m | 2Gi | 4000m | 8Gi |
| Notification Service | 2 | 250m | 512Mi | 500m | 1Gi |
| Gamification Service | 2 | 250m | 512Mi | 500m | 1Gi |
| At-Risk Detection | 1 | 500m | 1Gi | 2000m | 4Gi |
| PostgreSQL (primary) | 1 | 2000m | 8Gi | 4000m | 16Gi |
| Redis (per node) | 3 | 500m | 2Gi | 1000m | 4Gi |
| Kafka (per broker) | 3 | 1000m | 4Gi | 2000m | 8Gi |
| Weaviate | 2 | 1000m | 4Gi | 2000m | 8Gi |
| ClickHouse | 2 | 2000m | 8Gi | 4000m | 16Gi |

### Auto-Scaling Rules

```yaml
# HPA for all stateless services
scaleUp: CPU > 70% OR Memory > 80% → add pods (max: 10)
scaleDown: CPU < 40% AND Memory < 60% → remove pods (min: configured above)
cooldown: scaleUp=30s, scaleDown=300s

# KEDA for Kafka consumers
trigger: Kafka consumer group lag > 1000 messages → add consumer pods
services: Quiz Engine, Certificate Engine, Notification Service, At-Risk Detection
```

### Environment Variables (Key Secrets — stored in Vault)

```
DATABASE_URL          postgresql://user:pass@postgres:5432/lms
REDIS_URL             redis://redis-cluster:6379
KAFKA_BROKERS         redpanda:9092
MINIO_ENDPOINT        http://minio:9000
MINIO_ACCESS_KEY      (from Vault)
MINIO_SECRET_KEY      (from Vault)
KEYCLOAK_URL          http://keycloak:8080
KEYCLOAK_REALM        lms
KEYCLOAK_CLIENT_ID    lms-backend
KEYCLOAK_CLIENT_SECRET (from Vault)
WEAVIATE_URL          http://weaviate:8080
CLICKHOUSE_URL        http://clickhouse:8123
ANTHROPIC_API_KEY     (from Vault)
OPENAI_API_KEY        (from Vault — fallback LLM)
STRIPE_SECRET_KEY     (from Vault)
STRIPE_WEBHOOK_SECRET (from Vault)
LANGFUSE_SECRET_KEY   (from Vault)
VAULT_ADDR            http://vault:8200
VAULT_TOKEN           (injected by K8s service account)
JWT_ISSUER            https://auth.yourlms.com/realms/lms
OPA_URL               http://opa:8181
TEMPORAL_ADDRESS      temporal-frontend:7233
```

### GitOps Workflow

```
Developer pushes code to GitHub
    ↓
GitHub Actions CI pipeline:
  1. Run unit tests (must pass)
  2. Run integration tests (must pass)
  3. Build Docker image
  4. Push to Container Registry
  5. Update Helm chart values.yaml with new image tag
  6. Commit values change to Git
    ↓
ArgoCD detects Git change
    ↓
ArgoCD syncs Kubernetes to match Git state
    ↓
Argo Rollouts: Canary deployment (10% → 50% → 100% over 10 min)
    ↓
Prometheus health checks: error rate > 1% → auto-rollback
```

---

## 10. Patterns & Troubleshooting

### How to Add a New Microservice

1. Create service directory in `/services/your-service/`
2. Add Dockerfile and Helm chart in `/helm/charts/your-service/`
3. Add Kubernetes namespace (or use `core-services`)
4. Register gRPC proto in `/proto/your-service.proto`
5. Add service to ArgoCD application set
6. Add Kafka consumer group if the service consumes events
7. Add Prometheus metrics endpoint `/metrics`
8. Add health check endpoints: `GET /health` (liveness) and `GET /ready` (readiness)
9. Configure Istio VirtualService for routing
10. Add OPA policy if the service has access control requirements

### How to Add a New Tool to the Tool Registry

```python
# POST to Tool Registry Service
{
  "name": "your_tool_name",
  "display_name": "Human-Readable Tool Name",
  "description": "What this tool does (used by LLM for routing decisions)",
  "version": "1.0.0",
  "schema": {
    "type": "object",
    "properties": {
      "param1": {"type": "string", "description": "..."},
      "param2": {"type": "integer", "description": "..."}
    },
    "required": ["param1"]
  },
  "endpoint": "grpc://your-service:50051/YourService/YourMethod",
  "auth_type": "none"
}
```
The Agent Orchestrator will discover this tool at runtime — no redeployment needed.

### How to Add a New Kafka Event

1. Define Avro schema in `/schemas/your-topic/your-event-v1.avsc`
2. Register schema with Schema Registry
3. Add topic to Kafka (or Redpanda) with appropriate partitions and retention
4. Update [Event Catalog](#5-event-catalog-kafka) in this document
5. Add publisher: `kafkaProducer.send({ topic: 'your.topic', messages: [{ value: serialize(event) }] })`
6. Add consumer in the service that needs to react
7. Add DLQ handler for the topic

### Common Failure Patterns & Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| Agent Orchestrator timeout | LLM API slow or rate limited | Check Langfuse for slow calls; implement timeout + retry with backoff |
| Quiz Engine pod OOMKilled | IRT computation memory leak | Check heap size; set JVM/Node heap limit; review large quiz attempt payloads |
| Certificate PDF blank | WeasyPrint missing font | Add font to container image; check content-service logs |
| Kafka consumer lag growing | Consumer too slow or crashed | Check KEDA scaling; inspect consumer group lag in Kafka UI |
| Redis evicting keys early | maxmemory policy too aggressive | Increase Redis memory or change eviction policy to `allkeys-lru` |
| Weaviate returning wrong results | Embeddings stale after content update | Trigger re-indexing job for updated modules |
| Temporal workflow stuck | Activity worker down | Check temporal-worker pod; restart if needed; workflow will resume automatically |
| ArgoCD sync failed | Image not found in registry | Check CI pipeline completed; verify image tag in values.yaml matches registry |
| Keycloak 500 on login | PostgreSQL connection pool exhausted | Increase pool size in Keycloak config; check DB connections with `pg_stat_activity` |
| At-risk job not running | CronJob pod failed silently | Check CronJob history: `kubectl get cronjobs -n core-services`; check job logs |

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Kafka topics | `domain.events` | `assessment.events` |
| Kafka event types | `entity.past_tense_action` | `certificate.issued` |
| PostgreSQL tables | `snake_case` plural | `quiz_attempts` |
| Redis keys | `entity:{id}` | `session:{user_id}` |
| Kubernetes services | `kebab-case` | `quiz-engine` |
| Docker images | `registry/lms/service-name:tag` | `registry/lms/quiz-engine:1.2.3` |
| Protobuf services | `PascalCase` | `QuizEngineService` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `ANTHROPIC_API_KEY` |
| API routes | `/kebab-case/{uuid}` | `/quiz-attempts/{id}` |

---

---

## 11. Media & Content Ingestion

This section covers all the ways admin and instructors can bring content INTO the platform.

### Supported Content Sources

| Source Type | How Admin Provides It | What the System Does |
|---|---|---|
| **PDF / Document** | Upload via drag-and-drop in Admin Chat | PyMuPDF extracts text → AI structures into modules → stored in MinIO |
| **Video File** (MP4, MOV, AVI) | Upload via file picker | FFmpeg transcodes to HLS (360p, 720p, 1080p) → Whisper AI generates captions → stored in MinIO CDN |
| **YouTube Link** | Paste URL in Admin Chat | YouTube Data API fetches title, description, duration, auto-captions → embedded player in module (no download) |
| **YouTube Playlist** | Paste playlist URL | Fetches all videos in order → creates one module per video automatically |
| **Podcast / Audio File** (MP3, WAV, M4A) | Upload audio file | FFmpeg extracts audio → Whisper AI transcribes full text → transcript becomes readable module + AI quiz |
| **Podcast RSS Feed** | Paste RSS feed URL | Fetches all episodes → admin selects which to include → each episode = one module with transcript |
| **Google Meet Recording** | Paste Google Drive share link | Google Drive API downloads the recording → same pipeline as video file (transcode + caption) |
| **Zoom Recording** | Paste Zoom cloud recording link | Zoom API fetches recording → downloads MP4 → FFmpeg + Whisper pipeline |
| **Loom Video** | Paste Loom share URL | Loom API fetches video → downloads → standard video pipeline |
| **PowerPoint / Google Slides** | Upload .pptx or paste Google Slides link | LibreOffice converts to PDF → each slide = one page → AI structures into modules |
| **SCORM Package** | Upload .zip file | SCORM parser extracts manifest → modules created → SCORM runtime injected |
| **Web Article / URL** | Paste any web URL | Playwright/Puppeteer scrapes page text → AI cleans and structures → readable module |
| **Internal Text / Markdown** | Type or paste in Admin Chat | Stored directly as text module → AI can generate quiz from it |

### Content Ingestion Pipeline (All Sources)

```
Admin provides content (upload / URL / link)
    ↓
Content Service: ClamAV malware scan (files only)
    ↓
Content Router: detects source type
    ↓
┌──────────────────────────────────────────────────────────────┐
│  Source-Specific Processor                                   │
│  YouTube URL  → YouTube Data API → metadata + embed URL     │
│  Video file   → FFmpeg → HLS streams → MinIO                │
│  Audio/Podcast→ FFmpeg + Whisper AI → transcript            │
│  PDF/PPTX     → PyMuPDF / LibreOffice → raw text           │
│  Google Meet  → Drive API → download → video pipeline       │
│  Zoom         → Zoom API → download → video pipeline        │
│  RSS Feed     → fetch episodes → audio pipeline per episode │
│  Web URL      → Playwright → scraped text                   │
└──────────────────────────────────────────────────────────────┘
    ↓
AI Enrichment (Agent Orchestrator)
  → Split content into logical modules
  → Generate title and description per module
  → Extract skill tags
  → Generate summary for AI Companion context
    ↓
Embedding Service
  → Generate vector embedding for each module (pgvector + Weaviate)
    ↓
Quiz Generation (optional, admin can trigger)
  → AI generates 5-10 questions per module from content
    ↓
content.ingested event → Kafka
  → Search Service re-indexes
  → Analytics logs content creation
  → Admin Chat streams status updates via SSE
```

### YouTube Integration Details

```
Admin types: "Add this YouTube video to Module 3: https://youtube.com/watch?v=xxx"
    ↓
Agent calls: ingest_youtube_video(url, module_id)
    ↓
YouTube Data API v3:
  → Fetches: title, description, duration, thumbnail, auto-captions
  → Checks: video is public (private videos rejected with explanation)
    ↓
Module created:
  → content_type: "youtube_embed"
  → content_url: "https://youtube.com/embed/xxx?rel=0&modestbranding=1"
  → transcript: YouTube auto-captions (cleaned by AI)
  → duration_secs: from YouTube metadata
    ↓
No video stored in MinIO — YouTube hosts it (saves storage costs)
Captions stored locally for AI Companion and quiz generation
```

**YouTube Limitations:**
- Cannot download YouTube videos (Terms of Service)
- If video is deleted/made private → module shows "Content unavailable" message
- Age-restricted videos are blocked automatically
- Recommendation: for business-critical content, upload the actual video file instead

### Google Meet Recording Details

```
Admin types: "Import our Google Meet training recording: https://drive.google.com/..."
    ↓
Agent calls: ingest_google_meet(drive_url)
    ↓
Google Drive API:
  → Verifies share permissions (must be "Anyone with link")
  → Downloads MP4 file to temporary storage
    ↓
Same as video file pipeline:
  → FFmpeg: transcode to HLS (720p, 1080p)
  → Whisper AI: generate captions from audio
  → MinIO: store HLS chunks + caption file
  → Embedding: generate vector for transcript
    ↓
Module content_type: "video" (same as uploaded video)
Original Google Drive link stored as metadata reference
```

**Prerequisites:**
- Google Drive share link must be set to "Anyone with the link can view"
- Service account with Drive API access (configured in Vault)
- For Google Workspace orgs: admin can grant domain-wide access

### Podcast / RSS Feed Integration

```
Admin types: "Add this podcast as a course: https://feeds.example.com/podcast.xml"
    ↓
Agent calls: ingest_podcast_rss(rss_url)
    ↓
RSS Parser fetches feed:
  → Lists all episodes (title, date, audio URL, description)
  → Streams list back to Admin Chat: "Found 24 episodes. Which ones to include?"
    ↓
Admin selects episodes (or says "all" or "last 10")
    ↓
For each selected episode:
  → Download MP3/M4A from episode audio URL
  → Whisper AI: full transcription (takes 1-3 min per hour of audio)
  → AI: structures transcript into sections
  → AI: generates module title, summary, key concepts
  → AI: generates quiz questions from transcript
  → Store transcript + audio file in MinIO
    ↓
Modules created: one per podcast episode
content_type: "audio" (shows audio player + scrollable transcript in Learner App)
```

### Database Changes for Media Ingestion

```sql
-- Add to modules table
ALTER TABLE modules ADD COLUMN source_type VARCHAR(50);
-- Values: upload, youtube, google_meet, zoom, loom, podcast, rss, web_article, scorm, text

ALTER TABLE modules ADD COLUMN source_url TEXT;
-- Original URL that was ingested (YouTube URL, Drive link, RSS URL, etc.)

ALTER TABLE modules ADD COLUMN source_metadata JSONB DEFAULT '{}';
-- YouTube: {video_id, channel, views, published_at}
-- Podcast: {episode_guid, feed_url, episode_number, podcast_name}
-- Google Meet: {drive_file_id, meeting_title, recorded_at}

ALTER TABLE modules ADD COLUMN caption_url TEXT;
-- MinIO URL for .vtt caption file (all video/audio content)

ALTER TABLE modules ADD COLUMN processing_status VARCHAR(50) DEFAULT 'pending';
-- pending, processing, ready, failed

ALTER TABLE modules ADD COLUMN processing_error TEXT;
-- Set if processing_status = 'failed'
```

### Content Ingestion API Endpoints

```
POST /content/upload                    Upload file (video, audio, PDF, PPTX, SCORM zip)
POST /content/ingest/youtube            { url, course_id, module_position }
POST /content/ingest/youtube-playlist   { playlist_url, course_id }
POST /content/ingest/google-meet        { drive_url, course_id }
POST /content/ingest/zoom               { recording_url, course_id }
POST /content/ingest/podcast-episode    { audio_url, course_id }
POST /content/ingest/podcast-rss        { rss_url } → returns episode list for admin selection
POST /content/ingest/web-url            { url, course_id }
GET  /content/status/:job_id            Check processing status (SSE stream for real-time updates)
```

### Admin Chat Commands (Natural Language)

```
"Add this YouTube video to the course: [URL]"
"Import all videos from this playlist: [URL]"
"Add our Google Meet recording from last week: [Drive URL]"
"Import the latest 5 episodes from this podcast: [RSS URL]"
"Add this Zoom recording: [recording URL]"
"Upload this PDF as course content"  → triggers file picker
"Add this article as reading material: [URL]"
"Import this PowerPoint presentation: [file]"
```

### Phase 1 Update — Add to Content Service

The Content Service in Phase 1 should include from day one:
```
[ ] File upload endpoint (video, audio, PDF, PPTX, SCORM)
[ ] YouTube URL ingestion (YouTube Data API v3)
[ ] Whisper AI transcription for all audio/video
[ ] FFmpeg transcoding pipeline (HLS output)
[ ] Processing status endpoint (SSE for real-time progress)
[ ] Google Meet / Google Drive ingestion (Drive API)
[ ] Zoom recording ingestion (Zoom API)
```

Podcast RSS and web URL scraping can be added in Phase 2 as they are lower priority.

---

*This document should be updated whenever architecture decisions change. It is the living source of truth for this project.*
