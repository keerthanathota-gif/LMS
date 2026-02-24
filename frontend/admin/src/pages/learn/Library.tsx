import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, Clock, Star, Users, Loader2 } from 'lucide-react'
import { useAuthStore } from '@store/auth.store'
import api from '@services/api'

interface Course {
  id: string; title: string; description?: string; thumbnail_url?: string
  module_count: number; total_duration_secs: number; avg_rating: number | null
  review_count: number; enrollment_count: number; category_name?: string
  category_id?: string; skill_tags: string[]; status: string
}
interface Category { id: string; name: string; children?: Category[] }

function fmtTime(s: number) { const h = Math.floor(s/3600), m = Math.ceil((s%3600)/60); return h ? `${h}h ${m}m` : `${m}m` }
function hashColor(s: string) { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0; return `hsl(${Math.abs(h)%360},55%,35%)` }

export default function LibraryPage() {
  const { user } = useAuthStore()
  const [courses, setCourses] = useState<Course[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selCat, setSelCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  const filtered = courses.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase())
    const matchCat = !selCat || c.category_id === selCat
    return matchSearch && matchCat
  })

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Course Library</h1>
        <p className="text-sm text-text-muted mt-0.5">Browse all available courses</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="text" placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <select value={selCat ?? ''} onChange={(e) => setSelCat(e.target.value || null)}
          className="px-3 py-2 text-sm bg-surface-secondary border border-surface-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              <option value={cat.id}>{cat.name}</option>
              {(cat.children ?? []).map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((c) => (
          <Link key={c.id} to={`/learn/courses/${c.id}`} className="card overflow-hidden hover:ring-1 hover:ring-brand-500/30 transition-all group">
            {c.thumbnail_url ? (
              <img src={c.thumbnail_url} alt="" className="w-full h-36 object-cover" />
            ) : (
              <div className="w-full h-36 flex items-center justify-center text-white text-3xl font-bold" style={{ background: hashColor(c.title) }}>{c.title[0]}</div>
            )}
            <div className="p-3">
              <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-400 transition-colors">{c.title}</p>
              {c.category_name && <p className="text-xs text-text-muted mt-0.5">{c.category_name}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                {c.avg_rating && <span className="flex items-center gap-0.5"><Star size={10} className="text-yellow-400 fill-yellow-400" /> {c.avg_rating}</span>}
                <span className="flex items-center gap-0.5"><BookOpen size={10} /> {c.module_count}</span>
                {c.total_duration_secs > 0 && <span className="flex items-center gap-0.5"><Clock size={10} /> {fmtTime(c.total_duration_secs)}</span>}
                {c.enrollment_count > 0 && <span className="flex items-center gap-0.5"><Users size={10} /> {c.enrollment_count}</span>}
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="col-span-full py-12 text-center text-sm text-text-muted">No courses found</div>}
      </div>
    </div>
  )
}
