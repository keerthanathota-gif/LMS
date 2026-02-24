import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Plus, Search, MoreVertical, CheckCircle, Archive,
  MessageSquare, Tag, X, Star, Clock, Users,
} from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import Badge from '@components/ui/Badge'
import Button from '@components/ui/Button'
import { SkeletonTableRow } from '@components/ui/Skeleton'

/* ── Constants ─────────────────────────────────────────────────────────────── */

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Course {
  id: string
  title: string
  status: 'draft' | 'published' | 'archived'
  module_count: number
  total_duration_secs: number
  avg_rating: number | null
  review_count: number
  enrollment_count: number
  skill_tags: string[]
  thumbnail_url?: string
  category_id?: string
  category_name?: string
  category_slug?: string
  created_at: string
}

interface Category {
  id: string
  name: string
  slug: string
  icon?: string
  parent_id?: string
  parent_name?: string
  children?: Category[]
}

type FilterTab = 'all' | 'draft' | 'published' | 'archived'

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const statusVariant: Record<string, 'success' | 'warning' | 'default'> = {
  published: 'success',
  draft:     'warning',
  archived:  'default',
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function CoursesPage() {
  const { user } = useAuthStore()
  const [courses, setCourses]             = useState<Course[]>([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [filter, setFilter]               = useState<FilterTab>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [dbCategories, setDbCategories]  = useState<Category[]>([])
  const [actionMenuId, setActionMenuId]   = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Add Module modal
  const [addModuleId, setAddModuleId]       = useState<string | null>(null)
  const [moduleForm, setModuleForm]         = useState({ title: '', contentType: 'text' as 'text' | 'youtube_embed', contentUrl: '' })
  const [moduleLoading, setModuleLoading]   = useState(false)
  const [moduleError, setModuleError]       = useState('')

  // Edit Tags modal
  const [editTagsId, setEditTagsId]         = useState<string | null>(null)
  const [editTags, setEditTags]             = useState<string[]>([])
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null)
  const [customTag, setCustomTag]           = useState('')
  const [tagSaving, setTagSaving]           = useState(false)

  /* ── Data ───────────────────────────────────────────────────────────────── */

  const fetchCourses = () => {
    if (!user?.orgId) return
    setLoading(true)
    api
      .get(`/courses?orgId=${user.orgId}&limit=100`)
      .then((res) => setCourses(res.data.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }

  const fetchCategories = () => {
    api.get('/courses/categories/tree')
      .then((res) => setDbCategories(res.data.data ?? []))
      .catch(() => setDbCategories([]))
  }

  useEffect(() => { fetchCourses(); fetchCategories() }, [user?.orgId])

  useEffect(() => {
    const close = () => setActionMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  /* ── Derived ────────────────────────────────────────────────────────────── */

  // Categories that have at least one course assigned
  const usedCategoryIds = new Set(courses.map((c) => c.category_id).filter(Boolean))

  const filtered = courses.filter((c) => {
    const matchStatus   = filter === 'all' || c.status === filter
    const matchSearch   = c.title.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !selectedCategory || c.category_id === selectedCategory
    return matchStatus && matchSearch && matchCategory
  })

  const counts = {
    all:       courses.length,
    draft:     courses.filter((c) => c.status === 'draft').length,
    published: courses.filter((c) => c.status === 'published').length,
    archived:  courses.filter((c) => c.status === 'archived').length,
  }

  /* ── Actions ────────────────────────────────────────────────────────────── */

  const handlePublish = async (id: string) => {
    setActionLoading(id); setActionMenuId(null)
    try { await api.patch(`/courses/${id}/publish`); fetchCourses() }
    finally { setActionLoading(null) }
  }

  const handleArchive = async (id: string) => {
    setActionLoading(id); setActionMenuId(null)
    try { await api.delete(`/courses/${id}`); fetchCourses() }
    finally { setActionLoading(null) }
  }

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addModuleId) return
    setModuleLoading(true); setModuleError('')
    try {
      await api.post(`/courses/${addModuleId}/modules`, {
        title: moduleForm.title,
        contentType: moduleForm.contentType,
        contentUrl: moduleForm.contentUrl || undefined,
        sourceType: moduleForm.contentType,
      })
      setAddModuleId(null)
      setModuleForm({ title: '', contentType: 'text', contentUrl: '' })
      fetchCourses()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add module'
      setModuleError(msg)
    } finally { setModuleLoading(false) }
  }

  const openEditTags = (course: Course) => {
    setEditTagsId(course.id)
    setEditTags([...(course.skill_tags ?? [])])
    setEditCategoryId(course.category_id ?? null)
    setCustomTag('')
    setActionMenuId(null)
  }

  const toggleTag = (tag: string) => {
    setEditTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  const addCustomTag = () => {
    const tag = customTag.trim()
    if (tag && !editTags.includes(tag)) setEditTags((prev) => [...prev, tag])
    setCustomTag('')
  }

  const handleSaveTags = async () => {
    if (!editTagsId) return
    setTagSaving(true)
    try {
      const body: Record<string, unknown> = { skillTags: editTags }
      if (editCategoryId) body.categoryId = editCategoryId
      await api.patch(`/courses/${editTagsId}`, body)
      setEditTagsId(null)
      fetchCourses()
    } finally { setTagSaving(false) }
  }

  /* ── Tabs config ────────────────────────────────────────────────────────── */

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'published', label: 'Published' },
    { key: 'archived', label: 'Archived' },
  ]

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-text-primary">Courses</h1>
          <p className="text-text-secondary text-sm mt-0.5">{counts.all} total courses</p>
        </div>
        <Link to="/chat">
          <Button variant="primary" size="md" icon={<Plus size={15} />}>
            Create with AI
          </Button>
        </Link>
      </div>

      {/* Status tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-surface-secondary rounded-xl p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                filter === key
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${filter === key ? 'text-white/70' : 'text-text-muted'}`}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
          />
        </div>
      </div>

      {/* Category filter pills (from DB) */}
      {dbCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
              !selectedCategory ? 'bg-indigo-500 text-white shadow-sm' : 'bg-surface-secondary text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            All Categories
          </button>
          {dbCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                selectedCategory === cat.id
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : usedCategoryIds.has(cat.id)
                    ? 'bg-surface-secondary text-text-primary hover:text-text-secondary hover:bg-surface-hover'
                    : 'bg-surface-secondary text-text-muted/50 hover:text-text-muted'
              }`}
            >
              {cat.name}
              {cat.children && cat.children.length > 0 && (
                <span className="ml-1 text-text-muted/60">{cat.children.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Course table */}
      <div className="card overflow-hidden rounded-2xl">
        {loading ? (
          <div className="divide-y divide-surface-border">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonTableRow key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
              <BookOpen size={28} className="text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-text-secondary mb-1">
              {search || selectedCategory ? 'No courses match your filters' : 'No courses yet'}
            </p>
            <p className="text-xs text-text-muted mb-4">
              {search || selectedCategory ? 'Try different filters' : 'Go to Chat Studio and ask the AI to create one'}
            </p>
            {!search && !selectedCategory && (
              <Link to="/chat" className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                <MessageSquare size={13} /> Open Chat Studio
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-secondary/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Course</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">Modules</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">Created</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((course) => (
                <motion.tr
                  key={course.id}
                  className={`group relative hover:bg-surface-secondary/40 transition-colors ${actionLoading === course.id ? 'opacity-50' : ''}`}
                  whileHover="hover"
                >
                  {/* Thumbnail + Title (with hover accent bar) */}
                  <td className="relative px-5 py-4">
                    <motion.div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-indigo-500"
                      initial={{ scaleY: 0 }}
                      variants={{ hover: { scaleY: 1 } }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      style={{ originY: 0.5 }}
                    />
                    <div className="flex items-center gap-3">
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                          style={{ background: `hsl(${hashCode(course.title) % 360}, 55%, 35%)` }}
                        >
                          {course.title[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <span className="font-medium text-text-primary truncate max-w-[220px]">{course.title}</span>
                    </div>
                  </td>

                  {/* Stats */}
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="flex flex-col gap-0.5 text-xs text-text-muted">
                      <span>{course.module_count ?? 0} modules</span>
                      {course.total_duration_secs > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {Math.floor(course.total_duration_secs / 3600) > 0
                            ? `${Math.floor(course.total_duration_secs / 3600)}h ${Math.ceil((course.total_duration_secs % 3600) / 60)}m`
                            : `${Math.ceil(course.total_duration_secs / 60)}m`
                          }
                        </span>
                      )}
                      {course.avg_rating && (
                        <span className="flex items-center gap-1">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          {course.avg_rating} ({course.review_count})
                        </span>
                      )}
                      {course.enrollment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={10} /> {course.enrollment_count} enrolled
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-4 hidden lg:table-cell">
                    {course.category_name ? (
                      <button
                        onClick={() => setSelectedCategory(course.category_id ?? null)}
                        className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                      >
                        {course.category_name}
                      </button>
                    ) : (course.skill_tags ?? []).length > 0 ? (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-surface-border text-text-muted">
                        {course.skill_tags[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted/50">Uncategorized</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <Badge variant={statusVariant[course.status] ?? 'default'} dot>
                      {course.status}
                    </Badge>
                  </td>

                  {/* Created */}
                  <td className="px-4 py-4 text-text-muted text-xs hidden sm:table-cell">
                    {new Date(course.created_at).toLocaleDateString()}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === course.id ? null : course.id) }}
                      className="p-1 rounded-lg hover:bg-surface-border transition-colors text-text-muted"
                    >
                      <MoreVertical size={15} />
                    </button>

                    {actionMenuId === course.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-4 top-10 z-20 w-44 bg-surface-primary border border-surface-border rounded-xl shadow-lg py-1 text-sm"
                      >
                        {course.status === 'draft' && (
                          <button onClick={() => handlePublish(course.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors text-text-primary">
                            <CheckCircle size={14} className="text-green-400" /> Publish
                          </button>
                        )}
                        <button
                          onClick={() => { setAddModuleId(course.id); setActionMenuId(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors text-text-primary"
                        >
                          <Plus size={14} className="text-indigo-400" /> Add Module
                        </button>
                        <button
                          onClick={() => openEditTags(course)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors text-text-primary"
                        >
                          <Tag size={14} className="text-text-muted" /> Edit Tags
                        </button>
                        {course.status !== 'archived' && (
                          <button onClick={() => handleArchive(course.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary transition-colors text-text-primary">
                            <Archive size={14} className="text-text-muted" /> Archive
                          </button>
                        )}
                        <Link to={`/chat?courseId=${course.id}&courseName=${encodeURIComponent(course.title)}`} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary transition-colors text-text-primary">
                          <MessageSquare size={14} className="text-indigo-400" /> Edit in Chat
                        </Link>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add Module Modal ─────────────────────────────────────────────── */}
      {addModuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModuleId(null)} />
          <div className="relative w-full max-w-md bg-surface-primary border border-indigo-500/20 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-display font-semibold text-text-primary">Add Module</h2>
              <button onClick={() => setAddModuleId(null)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={handleAddModule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Module Title</label>
                <input
                  type="text"
                  required
                  value={moduleForm.title}
                  onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                  placeholder="e.g. Introduction to React Hooks"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Content Type</label>
                <select
                  value={moduleForm.contentType}
                  onChange={(e) => setModuleForm({ ...moduleForm, contentType: e.target.value as 'text' | 'youtube_embed' })}
                  className="w-full px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                >
                  <option value="text">Text</option>
                  <option value="youtube_embed">YouTube Video</option>
                </select>
              </div>
              {moduleForm.contentType === 'youtube_embed' && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">YouTube URL</label>
                  <input
                    type="url"
                    value={moduleForm.contentUrl}
                    onChange={(e) => setModuleForm({ ...moduleForm, contentUrl: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              )}
              {moduleError && <p className="text-xs text-status-error">{moduleError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setAddModuleId(null)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={moduleLoading}
                >
                  Add Module
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Tags Modal ──────────────────────────────────────────────── */}
      {editTagsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditTagsId(null)} />
          <div className="relative w-full max-w-lg bg-surface-primary border border-indigo-500/20 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-display font-semibold text-text-primary">Edit Categories &amp; Tags</h2>
              <button onClick={() => setEditTagsId(null)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
            </div>

            {/* Category (from DB) */}
            <p className="text-xs font-medium text-text-secondary mb-2">Category</p>
            <select
              value={editCategoryId ?? ''}
              onChange={(e) => setEditCategoryId(e.target.value || null)}
              className="w-full px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all mb-4"
            >
              <option value="">Uncategorized</option>
              {dbCategories.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name} (General)</option>
                  {(parent.children ?? []).map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Skill Tags */}
            <p className="text-xs font-medium text-text-secondary mb-2">Skill Tags</p>
            {editTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {editTags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {tag}
                    <button onClick={() => toggleTag(tag)} className="text-indigo-400/60 hover:text-indigo-300 transition-colors"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}

            {/* Add custom tag */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
                className="flex-1 px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                placeholder="Type custom tag..."
              />
              <Button variant="secondary" size="sm" onClick={addCustomTag}>Add</Button>
            </div>

            {/* Save / Cancel */}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditTagsId(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveTags}
                loading={tagSaving}
              >
                Save Tags
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
