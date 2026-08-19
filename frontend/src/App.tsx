import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route
        path="/projects/:projectId/conversations/:conversationId"
        element={<WorkspacePage />}
      />
    </Routes>
  )
}
