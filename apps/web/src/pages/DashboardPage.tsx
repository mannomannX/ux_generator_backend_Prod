import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold">UX Flow Engine</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Welcome, {user?.name}</span>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-600 hover:text-gray-900 transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Your Projects</h2>
          <p className="text-gray-600 mt-1">Select a project or create a new flow</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            onClick={() => navigate('/editor-new')}
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all border-2 border-dashed border-gray-300 hover:border-blue-500 group"
          >
            <div className="flex flex-col items-center text-gray-600 group-hover:text-blue-600">
              <Plus className="w-12 h-12 mb-3" />
              <h3 className="font-semibold text-lg">New Flow</h3>
              <p className="text-sm mt-1">Create a new UX flow from scratch</p>
            </div>
          </button>
          
          <div
            onClick={() => navigate('/editor-new')}
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <FolderOpen className="w-8 h-8 text-blue-600" />
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Demo</span>
            </div>
            <h3 className="font-semibold text-lg text-gray-900">E-Commerce Login Flow</h3>
            <p className="text-sm text-gray-600 mt-1">Complete authentication flow with social login</p>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
              <span>15 screens</span>
              <span>•</span>
              <span>Last edited 2h ago</span>
            </div>
          </div>
          
          <div
            onClick={() => navigate('/editor-new')}
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <FolderOpen className="w-8 h-8 text-purple-600" />
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">In Progress</span>
            </div>
            <h3 className="font-semibold text-lg text-gray-900">User Onboarding Flow</h3>
            <p className="text-sm text-gray-600 mt-1">New user onboarding experience</p>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
              <span>8 screens</span>
              <span>•</span>
              <span>Last edited 1d ago</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}