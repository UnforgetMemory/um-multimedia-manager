import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'

const OverviewTab = lazy(() => import('./tabs/OverviewTab').then(m => ({ default: m.OverviewTab })))
const RatingTab = lazy(() => import('./tabs/RatingTab').then(m => ({ default: (m as any).RatingTab || m.default })))
const LinkedTab = lazy(() => import('./tabs/LinkedTab').then(m => ({ default: (m as any).LinkedTab || m.default })))
const SyncTab = lazy(() => import('./tabs/SyncTab').then(m => ({ default: m.SyncTab })))
const AppearanceTab = lazy(() => import('./tabs/AppearanceTab').then(m => ({ default: m.AppearanceTab })))
const SettingsTab = lazy(() => import('./tabs/SettingsTab').then(m => ({ default: m.SettingsTab })))

function TabFallback() {
  return (
    <div className="umm:flex umm:flex-col umm:gap-4 umm:animate-pulse">
      <div className="umm:h-8 umm:bg-muted umm:rounded umm:w-1/3" />
      <div className="umm:h-4 umm:bg-muted umm:rounded umm:w-2/3" />
      <div className="umm:h-48 umm:bg-muted umm:rounded" />
    </div>
  )
}

export function OptionsRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Suspense fallback={<TabFallback />}><OverviewTab /></Suspense>} />
        <Route path="/rating" element={<Suspense fallback={<TabFallback />}><RatingTab /></Suspense>} />
        <Route path="/linked" element={<Suspense fallback={<TabFallback />}><LinkedTab /></Suspense>} />
        <Route path="/sync" element={<Suspense fallback={<TabFallback />}><SyncTab /></Suspense>} />
        <Route path="/appearance" element={<Suspense fallback={<TabFallback />}><AppearanceTab /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<TabFallback />}><SettingsTab /></Suspense>} />
      </Routes>
    </HashRouter>
  )
}