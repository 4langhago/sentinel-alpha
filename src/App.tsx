import React, { Suspense, lazy, Component, ErrorInfo, ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Navigation from './components/Navigation'
import Footer from './components/Footer'
import AuthModal from './components/AuthModal'
import MembershipModal from './components/MembershipModal'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './App.css'

const HomePage       = lazy(() => import('./pages/HomePage'))
const SearchPage     = lazy(() => import('./pages/SearchPage'))
const FavoritesPage  = lazy(() => import('./pages/FavoritesPage'))
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'))
const ComplexPage    = lazy(() => import('./pages/ComplexPage'))

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50">
    <div className="flex flex-col items-center space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 text-sm font-medium">로딩 중...</p>
    </div>
  </div>
)

interface ErrorBoundaryState { hasError: boolean; error?: Error }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">오류가 발생했습니다</h2>
            <p className="text-gray-500 mb-6 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <AuthProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
              <Navigation />
              <main className="flex-1">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/"            element={<HomePage />} />
                    <Route path="/search"      element={<SearchPage />} />
                    <Route path="/favorites"   element={<FavoritesPage />} />
                    <Route path="/calculator"  element={<CalculatorPage />} />
                    <Route path="/complex/:name" element={<ComplexPage />} />
                    {/* 구 경매 상세 경로로 들어온 링크는 검색으로 흘려보낸다 */}
                    <Route path="/detail/:id"  element={<Navigate to="/search" replace />} />
                    <Route path="*"            element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </main>
              <Footer />
              <AuthModal />
              <MembershipModal />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  )
}

export default App
