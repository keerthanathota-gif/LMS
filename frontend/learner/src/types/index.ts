export type Role = 'super_admin' | 'org_admin' | 'instructor' | 'ta' | 'learner'

export interface User {
  id: string
  email: string
  fullName: string
  role: Role
  orgId: string
  avatarUrl?: string
}

export type CourseStatus = 'draft' | 'published' | 'archived'
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface Module {
  id: string
  courseId: string
  title: string
  orderIndex: number
  contentType: string
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
  hasBadge: boolean
  hasCertificate: boolean
  createdAt: string
  updatedAt: string
}

export interface Enrollment {
  id: string
  userId: string
  courseId: string
  status: 'active' | 'completed' | 'dropped'
  progressPct: number
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
  badge_id?: string
  name: string
  description?: string
  image_url: string
  skillTags?: string[]
  skill_tags?: string[]
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

export type MessageRole = 'learner' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  isStreaming?: boolean
}
