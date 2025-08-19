import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    // Auto-login im Mock-Modus
    const autoLogin = async () => {
      await login('demo@example.com', 'password');
      navigate('/dashboard');
    };
    
    // Nach 1 Sekunde automatisch einloggen
    const timer = setTimeout(autoLogin, 1000);
    
    return () => clearTimeout(timer);
  }, [login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow">
        <div className="text-center">
          <h1 className="text-3xl font-bold">UX Flow Engine</h1>
          <p className="text-gray-600 mt-2">Mock Mode - Auto Login</p>
        </div>
        
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
        
        <p className="text-center text-sm text-gray-500">
          Redirecting to dashboard...
        </p>
        
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Skip to Dashboard
        </button>
      </div>
    </div>
  );
}