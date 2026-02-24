import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'
import Layout from '@components/layout/Layout'
import LoginPage        from '@pages/Login'
import DashboardPage    from '@pages/Dashboard'
import CatalogPage      from '@pages/Catalog'
import LibraryPage      from '@pages/Library'
import CourseDetailPage  from '@pages/CourseDetail'
import LearnPage        from '@pages/Learn'
import QuizPage         from '@pages/Quiz'
import LeaderboardPage  from '@pages/Leaderboard'
import BadgesPage       from '@pages/Badges'
import CertificatesPage from '@pages/Certificates'
import ProfilePage      from '@pages/Profile'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/dashboard"                               element={<DashboardPage />} />
                  <Route path="/"                                        element={<CatalogPage />} />
                  <Route path="/library"                                 element={<LibraryPage />} />
                  <Route path="/courses/:courseId"                       element={<CourseDetailPage />} />
                  <Route path="/courses/:courseId/learn/:moduleId"       element={<LearnPage />} />
                  <Route path="/courses/:courseId/quiz/:moduleId"        element={<QuizPage />} />
                  <Route path="/leaderboard"                             element={<LeaderboardPage />} />
                  <Route path="/badges"                                  element={<BadgesPage />} />
                  <Route path="/certificates"                            element={<CertificatesPage />} />
                  <Route path="/profile"                                 element={<ProfilePage />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
