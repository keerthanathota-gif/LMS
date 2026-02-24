import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, Clock, Star, Users, Loader2, Sparkles, ChevronRight, Library } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'
import { motion, AnimatePresence } from 'framer-motion'
import Carousel from '@components/ui/Carousel'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Course {
  id: string; title: string; description?: string; thumbnail_url?: string
  module_count: number; total_duration_secs: number; avg_rating: number | null
  review_count: number; enrollment_count: number; category_name?: string
  category_id?: string; skill_tags: string[]; status: string
}
interface Category { id: string; name: string; children?: Category[] }

/* ── Helpers ────────────────────────────────────────────────────────────── */

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.ceil((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function hashColor(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360},55%,35%)`
}

type FilterTab = 'all' | 'my-learnings' | 'by-category'

/* ── Rating Stars Component ─────────────────────────────────────────────── */

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating >= star
        const half = !filled && rating >= star - 0.5
        return (
          <Star
            key={star}
            size={11}
            className={
              filled
                ? 'text-amber-400 fill-amber-400'
                : half
                  ? 'text-amber-400 fill-amber-400/50'
                  : 'text-navy-200'
            }
          />
        )
      })}
      <span className="ml-1 text-xs font-medium text-text-secondary">{rating.toFixed(1)}</span>
    </span>
  )
}

/* ── Course Card ────────────────────────────────────────────────────────── */

function CourseCard({ course: c }: { course: Course }) {
  return (
    <Link to={`/courses/${c.id}`} className="block h-full">
      <motion.div
        whileHover={{ y: -4, boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="h-full bg-surface-card border border-surface-border rounded-2xl shadow-sm hover:border-indigo-200 transition-colors duration-200 overflow-hidden group"
      >
        {/* Thumbnail */}
        <div className="relative w-full h-40 overflow-hidden">
          {c.thumbnail_url ? (
            <img
              src={c.thumbnail_url}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-4xl font-bold font-display"
              style={{ background: `linear-gradient(135deg, ${hashColor(c.title)}, ${hashColor(c.title + 'x')})` }}
            >
              {c.title[0]}
            </div>
          )}
          {/* Bottom gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
          {/* Category badge on thumbnail */}
          {c.category_name && (
            <span className="absolute bottom-2 left-2.5 badge badge-default bg-white/90 backdrop-blur-sm text-navy-600 text-[10px] font-medium shadow-sm">
              {c.category_name}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-text-primary truncate group-hover:text-indigo-500 transition-colors duration-200">
            {c.title}
          </p>

          {c.description && (
            <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
              {c.description}
            </p>
          )}

          {/* Rating */}
          {c.avg_rating ? (
            <RatingStars rating={c.avg_rating} />
          ) : (
            <span className="text-[11px] text-text-muted italic">No ratings yet</span>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <BookOpen size={12} className="text-indigo-400" />
              <span>{c.module_count} {c.module_count === 1 ? 'module' : 'modules'}</span>
            </span>
            {c.total_duration_secs > 0 && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} className="text-indigo-400" />
                <span>{fmtTime(c.total_duration_secs)}</span>
              </span>
            )}
            {c.enrollment_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-text-muted ml-auto">
                <Users size={12} className="text-indigo-400" />
                <span>{c.enrollment_count.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  )
}

/* ── Category Section ───────────────────────────────────────────────────── */

function CategorySection({ name, courses, expanded, onToggle }: {
  name: string
  courses: Course[]
  expanded: boolean
  onToggle: () => void
}) {
  const displayCourses = expanded ? courses : courses.slice(0, 4)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold font-display text-text-primary">{name}</h2>
        {courses.length > 4 && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            {expanded ? 'Show Less' : 'See All'}
            <ChevronRight size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
      >
        <AnimatePresence mode="popLayout">
          {displayCourses.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <CourseCard course={c} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/* ── Empty State ────────────────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
        <Library size={28} className="text-indigo-500" />
      </div>
      <p className="text-sm font-medium text-text-secondary mb-1">{message}</p>
      <p className="text-xs text-text-muted">Try adjusting your search or filters</p>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

export default function LibraryPage() {
  const { user } = useAuthStore()
  const [courses, setCourses] = useState<Course[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selCat, setSelCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user?.orgId) return
    Promise.all([
      api.get(`/courses?orgId=${user.orgId}&limit=100`).catch(() => ({ data: { data: [] } })),
      api.get('/courses/categories/tree').catch(() => ({ data: { data: [] } })),
    ]).then(([cRes, catRes]) => {
      setCourses((cRes.data.data ?? []).filter((c: Course) => c.status === 'published'))
      setCategories(catRes.data.data ?? [])
    }).finally(() => setLoading(false))
  }, [user?.orgId])

  /* Filters */
  const filtered = courses.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase())
    const matchCat = !selCat || c.category_id === selCat
    return matchSearch && matchCat
  })

  /* Group by category */
  const byCategory = new Map<string, Course[]>()
  for (const c of courses) {
    const cat = c.category_name ?? 'Other'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(c)
  }

  const toggleCatExpand = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  /* Filter tabs */
  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'my-learnings', label: 'My Learnings' },
    { id: 'by-category', label: 'By Category' },
  ]

  /* Loading state */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
        <p className="text-sm text-text-muted">Loading courses...</p>
      </div>
    )
  }

  /* Whether we are in search/filter mode */
  const isSearching = search.length > 0 || selCat !== null

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold font-display text-text-primary">Course Library</h1>
        <p className="text-sm text-text-muted mt-1">Discover courses to advance your skills</p>
      </div>

      {/* ── Search + Filter Bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-sm bg-navy-50 border border-transparent rounded-full text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300 focus:bg-white transition-all duration-200"
          />
        </div>

        {/* Category filter (only show when By Category tab active or searching) */}
        {(activeTab === 'by-category' || isSearching) && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <select
              value={selCat ?? ''}
              onChange={(e) => setSelCat(e.target.value || null)}
              className="px-4 py-2.5 text-sm bg-surface-card border border-surface-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all duration-200 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  <option value={cat.id}>{cat.name}</option>
                  {(cat.children ?? []).map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </optgroup>
              ))}
            </select>
          </motion.div>
        )}
      </div>

      {/* ── Filter Tabs (Pills) ─────────────────────────────────────────── */}
      {!isSearching && (
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'bg-surface-card border border-surface-border text-text-secondary hover:text-text-primary hover:border-indigo-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}

      {/* Search/filter results (flat grid) */}
      {isSearching && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-sm text-text-muted mb-4">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            {search && <> for <span className="font-medium text-text-primary">&ldquo;{search}&rdquo;</span></>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CourseCard course={c} />
              </motion.div>
            ))}
            {filtered.length === 0 && <EmptyState message="No courses match your search" />}
          </div>
        </motion.div>
      )}

      {/* Tab: All */}
      {!isSearching && activeTab === 'all' && (
        <div className="space-y-10">
          {/* Recommended for You - Carousel */}
          {courses.length > 0 && (
            <Carousel
              visibleCount={3}
              title="Recommended for You"
              subtitle="Curated picks based on your learning goals"
            >
              {courses.slice(0, 9).map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </Carousel>
          )}

          {/* All courses grid */}
          <div>
            <h2 className="text-lg font-semibold font-display text-text-primary mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-400" />
              All Courses
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {courses.map((c) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <CourseCard course={c} />
                </motion.div>
              ))}
            </div>
            {courses.length === 0 && <EmptyState message="No courses available yet" />}
          </div>
        </div>
      )}

      {/* Tab: My Learnings */}
      {!isSearching && activeTab === 'my-learnings' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {courses.filter((c) => c.enrollment_count > 0).map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CourseCard course={c} />
              </motion.div>
            ))}
          </div>
          {courses.filter((c) => c.enrollment_count > 0).length === 0 && (
            <EmptyState message="You have not enrolled in any courses yet" />
          )}
        </div>
      )}

      {/* Tab: By Category */}
      {!isSearching && activeTab === 'by-category' && (
        <div className="space-y-10">
          {[...byCategory.entries()].map(([cat, catCourses]) => (
            <CategorySection
              key={cat}
              name={cat}
              courses={catCourses}
              expanded={expandedCats.has(cat)}
              onToggle={() => toggleCatExpand(cat)}
            />
          ))}
          {byCategory.size === 0 && <EmptyState message="No categories found" />}
        </div>
      )}
    </div>
  )
}

