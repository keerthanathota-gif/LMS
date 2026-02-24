import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'
import LoginPage      from '@pages/Login'
import DashboardPage  from '@pages/Dashboard'
import ChatPage       from '@pages/Chat'
import CoursesPage    from '@pages/Courses'
import UsersPage      from '@pages/Users'
import AnalyticsPage  from '@pages/Analytics'
import SettingsPage   from '@pages/Settings'
import Layout         from '@components/layout/Layout'

// Learner pages
import CatalogPage      from '@pages/learn/Catalog'
import CourseDetailPage from '@pages/learn/CourseDetail'
import LearnPage        from '@pages/learn/Learn'
import QuizPage         from '@pages/learn/Quiz'
import ProfilePage      from '@pages/learn/Profile'
import LibraryPage      from '@pages/learn/Library'
import LeaderboardPage  from '@pages/learn/Leaderboard'
import BadgesPage       from '@pages/learn/Badges'
import CertificatesPage from '@pages/learn/Certificates'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user?.role === 'learner') return <Navigate to="/learn" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={user?.role === 'learner' ? '/learn' : '/chat'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RootRedirect />} />

        {/* ── Admin / Instructor routes ── */}
        <Route path="chat"      element={<AdminOnly><ChatPage /></AdminOnly>} />
        <Route path="dashboard" element={<AdminOnly><DashboardPage /></AdminOnly>} />
        <Route path="courses"   element={<AdminOnly><CoursesPage /></AdminOnly>} />
        <Route path="users"     element={<AdminOnly><UsersPage /></AdminOnly>} />
        <Route path="analytics" element={<AdminOnly><AnalyticsPage /></AdminOnly>} />
        <Route path="settings"  element={<AdminOnly><SettingsPage /></AdminOnly>} />

        {/* ── Learner routes — accessible to ALL authenticated users ── */}
        <Route path="learn"                                    element={<CatalogPage />} />
        <Route path="learn/courses/:courseId"                  element={<CourseDetailPage />} />
        <Route path="learn/courses/:courseId/module/:moduleId" element={<LearnPage />} />
        <Route path="learn/courses/:courseId/quiz/:moduleId"   element={<QuizPage />} />
        <Route path="learn/library"                              element={<LibraryPage />} />
        <Route path="learn/leaderboard"                        element={<LeaderboardPage />} />
        <Route path="learn/badges"                             element={<BadgesPage />} />
        <Route path="learn/certificates"                       element={<CertificatesPage />} />
        <Route path="learn/profile"                            element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
