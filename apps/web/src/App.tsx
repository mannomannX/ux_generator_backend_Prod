import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useThemeStore } from '@/store/theme';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { EditorPage } from '@/pages/EditorPage';
import { EnhancedEditorPage } from '@/pages/EnhancedEditorPage';
import { ProfessionalEditorPage } from '@/pages/ProfessionalEditorPage';
import { ModernFlowEditor } from '@/pages/ModernFlowEditor';
import { UXFlowEditor } from '@/pages/UXFlowEditor';
import { ProfessionalCanvas } from '@/pages/ProfessionalCanvas';
import { WorkingFlowEditor } from '@/pages/WorkingFlowEditor';
import { CompleteFlowEditor } from '@/pages/CompleteFlowEditor';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BillingPage } from '@/pages/BillingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function App() {
  const { initialize } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
          <Route path="/editor/:flowId" element={<CompleteFlowEditor />} />
          <Route path="/editor-new" element={<CompleteFlowEditor />} />
          <Route path="/editor-old" element={<EnhancedEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/billing" element={<BillingPage />} />
        </Route>
      </Route>
      
      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;