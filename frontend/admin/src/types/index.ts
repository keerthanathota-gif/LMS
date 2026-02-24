// ─── Auth ────────────────────────────────────────────────────────────────────

export type Role = 'super_admin' | 'org_admin' | 'instructor' | 'ta' | 'learner'

export interface User {
  id: string
  email: string
  fullName: string
  role: Role
  orgId: string
  avatarUrl?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export type MessageRole = 'admin' | 'assistant'

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'done' | 'skipped' | 'failed'

export interface ToolCall {
  id: string
  name: string
  displayName: string
  status: ToolCallStatus
  startedAt?: string
  completedAt?: string
  result?: unknown
  error?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  timestamp: string
  isStreaming?: boolean
}

// ─── Course ──────────────────────────────────────────────────────────────────

export type CourseStatus = 'draft' | 'published' | 'archived'
export type ContentType = 'video' | 'audio' | 'pdf' | 'text' | 'youtube_embed' | 'scorm' | 'live'
export type SourceType = 'upload' | 'youtube' | 'google_meet' | 'zoom' | 'loom' | 'podcast' | 'rss' | 'web_article' | 'scorm' | 'text'
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface Module {
  id: string
  courseId: string
  title: string
  orderIndex: number
  contentType: ContentType
  sourceType: SourceType
  contentUrl?: string
  durationSecs?: number
  processingStatus: ProcessingStatus
  transcript?: string
}

export interface Course {
  id: string
  orgId: string
  instructorId: string
  title: string
  description?: string
  thumbnailUrl?: string
  status: CourseStatus
  skillTags: string[]
  skill_tags?: string[]
  modules: Module[]
  quizCount: number
  quiz_count?: number
  hasBadge: boolean
  hasCertificate: boolean
  createdAt: string
  updatedAt: string
}

// ─── Learner ─────────────────────────────────────────────────────────────────

export interface Enrollment {
  id: string
  userId: string
  courseId: string
  status: 'active' | 'completed' | 'dropped'
  progressPct: number
  progress_pct?: number
  enrolledAt: string
  completedAt?: string
}

export interface QuizQuestion {
  id: string
  questionText: string
  questionType: string
  options: Array<{ text: string }>
  difficulty: number
}

export interface QuizAttemptResult {
  attemptId: string
  scorePct: number
  passed: boolean
  correct: number
  total: number
  results: Array<{ questionId: string; correct: boolean; explanation?: string }>
}

export interface Badge {
  id: string
  name: string
  description?: string
  image_url: string
  issuedAt?: string
  issued_at?: string
  assertionUrl?: string
  assertion_url?: string
}

export interface Certificate {
  id: string
  courseTitle?: string
  course_title?: string
  orgName?: string
  org_name?: string
  pdfUrl?: string
  pdf_url?: string
  verifyUrl?: string
  verify_url?: string
  issuedAt?: string
  issued_at?: string
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface ApiError {
  error: string
  message: string
  statusCode: number
}
