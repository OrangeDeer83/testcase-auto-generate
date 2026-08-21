import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { MaterialLibraryView } from './pages/MaterialLibraryView'
import { ProjectLayout } from './pages/ProjectLayout'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/projects/:projectId" element={<ProjectLayout />}>
        <Route index element={<MaterialLibraryView />} />
        <Route path="conversations/:conversationId" element={<WorkspacePage />} />
      </Route>
    </Routes>
  )
}
