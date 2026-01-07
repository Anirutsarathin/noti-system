import { Routes, Route, Navigate } from 'react-router-dom'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import WizardStep1 from './pages/WizardStep1'
import WizardStep2 from './pages/WizardStep2'
import WizardStep3 from './pages/WizardStep3'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { WizardProvider } from './store/wizard'
import { AuthProvider } from './store/auth'

export default function App() {
  return (
    <AuthProvider>
      <WizardProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="appShell">
                  <Topbar />
                  <div className="container">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/new/step-1" element={<WizardStep1 mode="create" />} />
                      <Route path="/edit/:id/step-1" element={<WizardStep1 mode="edit" />} />
                      <Route path="/new/step-2" element={<WizardStep2 mode="create" />} />
                      <Route path="/edit/:id/step-2" element={<WizardStep2 mode="edit" />} />
                      <Route path="/new/step-3" element={<WizardStep3 mode="create" />} />
                      <Route path="/edit/:id/step-3" element={<WizardStep3 mode="edit" />} />
                    </Routes>
                  </div>
                </div>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </WizardProvider>
    </AuthProvider>
  )
}
