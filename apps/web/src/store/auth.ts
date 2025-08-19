import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  initialize: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  
  initialize: () => {
    // Mock implementation - check for stored token
    const stored = localStorage.getItem('mock_auth');
    if (stored) {
      const mockUser = {
        id: 'user-1',
        email: 'demo@example.com',
        name: 'Demo User'
      };
      set({ user: mockUser, isAuthenticated: true });
    }
  },
  
  login: async (email: string, password: string) => {
    set({ isLoading: true });
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 1000));
    const user = {
      id: 'user-1',
      email,
      name: 'Demo User'
    };
    localStorage.setItem('mock_auth', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      isLoading: false
    });
  },
  
  logout: () => {
    localStorage.removeItem('mock_auth');
    set({ user: null, isAuthenticated: false });
  }
}));