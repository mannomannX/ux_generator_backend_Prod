import { UXFlowDocument } from '@/types/uxflow';

export const mockLoginFlow: UXFlowDocument = {
  metadata: {
    flowName: 'E-Commerce Login Flow',
    version: '1.0.0',
    description: 'Complete user authentication flow with social login options',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'Design Team',
    tags: ['authentication', 'login', 'e-commerce'],
    personas: [
      {
        id: 'persona-1',
        name: 'New User',
        description: 'First-time visitor who needs to create an account',
        color: '#3B82F6'
      },
      {
        id: 'persona-2',
        name: 'Returning Customer',
        description: 'Existing user who wants to quickly login',
        color: '#10B981'
      }
    ],
    globalSettings: {
      gridSize: 20,
      snapToGrid: true,
      theme: 'light',
      showMinimap: true,
      showControls: true
    }
  },
  nodes: [
    {
      id: 'start-1',
      type: 'start',
      title: 'Start',
      position: { x: 100, y: 300 },
      style: {
        backgroundColor: '#10B981',
        borderRadius: 50
      }
    },
    {
      id: 'screen-landing',
      type: 'screen',
      title: 'Landing Page',
      description: 'Main entry point with login/signup options',
      position: { x: 250, y: 280 },
      size: { width: 180, height: 80 },
      style: {
        backgroundColor: '#F3F4F6',
        borderColor: '#9CA3AF',
        borderWidth: 2,
        borderRadius: 8
      },
      uiMetadata: {
        responsiveVersion: 'desktop',
        completionStatus: 'done',
        variants: [
          {
            id: 'var-1',
            name: 'Loading State',
            type: 'loading',
            screenshot: ''
          }
        ]
      }
    },
    {
      id: 'decision-auth',
      type: 'decision',
      title: 'Auth Type?',
      description: 'User chooses authentication method',
      position: { x: 500, y: 280 },
      size: { width: 120, height: 80 },
      style: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
        borderWidth: 2
      }
    },
    {
      id: 'screen-login',
      type: 'screen',
      title: 'Login Form',
      description: 'Traditional email/password login',
      position: { x: 700, y: 200 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-2'],
      uiMetadata: {
        responsiveVersion: 'desktop',
        completionStatus: 'in-progress',
        variants: [
          {
            id: 'var-2',
            name: 'Error State',
            type: 'error',
            screenshot: ''
          },
          {
            id: 'var-3',
            name: 'Loading State',
            type: 'loading',
            screenshot: ''
          }
        ]
      }
    },
    {
      id: 'screen-signup',
      type: 'screen',
      title: 'Sign Up Form',
      description: 'New user registration',
      position: { x: 700, y: 350 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-1'],
      uiMetadata: {
        responsiveVersion: 'desktop',
        completionStatus: 'todo'
      }
    },
    {
      id: 'action-validate',
      type: 'action',
      title: 'Validate Credentials',
      description: 'Backend authentication process',
      position: { x: 950, y: 200 },
      size: { width: 160, height: 60 },
      style: {
        backgroundColor: '#EDE9FE',
        borderColor: '#8B5CF6',
        borderWidth: 2
      }
    },
    {
      id: 'condition-validation',
      type: 'condition',
      title: 'Validation Result',
      position: { x: 1150, y: 200 },
      size: { width: 140, height: 80 },
      data: {
        conditions: [
          { id: 'cond-1', label: 'Success', targetNodeId: 'screen-dashboard' },
          { id: 'cond-2', label: 'Invalid Credentials', targetNodeId: 'screen-login' },
          { id: 'cond-3', label: '2FA Required', targetNodeId: 'screen-2fa' }
        ]
      }
    },
    {
      id: 'screen-2fa',
      type: 'screen',
      title: '2FA Verification',
      description: 'Two-factor authentication',
      position: { x: 1350, y: 280 },
      size: { width: 180, height: 80 }
    },
    {
      id: 'screen-dashboard',
      type: 'screen',
      title: 'User Dashboard',
      description: 'Main application dashboard',
      position: { x: 1350, y: 100 },
      size: { width: 180, height: 80 },
      style: {
        backgroundColor: '#D1FAE5',
        borderColor: '#10B981',
        borderWidth: 2
      }
    },
    {
      id: 'end-1',
      type: 'end',
      title: 'End',
      position: { x: 1600, y: 120 },
      style: {
        backgroundColor: '#EF4444',
        borderRadius: 50
      }
    },
    {
      id: 'note-1',
      type: 'note',
      title: 'Security Note',
      description: 'Remember to implement rate limiting and CAPTCHA for failed login attempts',
      position: { x: 950, y: 50 },
      size: { width: 200, height: 100 },
      style: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
        borderWidth: 1,
        borderRadius: 4
      }
    }
  ],
  edges: [
    {
      id: 'e1',
      source: 'start-1',
      target: 'screen-landing',
      type: 'smoothstep'
    },
    {
      id: 'e2',
      source: 'screen-landing',
      target: 'decision-auth',
      label: 'Click Login/Signup'
    },
    {
      id: 'e3',
      source: 'decision-auth',
      target: 'screen-login',
      label: 'Existing User',
      style: { stroke: '#10B981' }
    },
    {
      id: 'e4',
      source: 'decision-auth',
      target: 'screen-signup',
      label: 'New User',
      style: { stroke: '#3B82F6' }
    },
    {
      id: 'e5',
      source: 'screen-login',
      target: 'action-validate',
      label: 'Submit'
    },
    {
      id: 'e6',
      source: 'action-validate',
      target: 'condition-validation'
    },
    {
      id: 'e7',
      source: 'condition-validation',
      target: 'screen-dashboard',
      sourceHandle: 'cond-1',
      label: 'Success',
      style: { stroke: '#10B981' }
    },
    {
      id: 'e8',
      source: 'condition-validation',
      target: 'screen-login',
      sourceHandle: 'cond-2',
      label: 'Failed',
      style: { stroke: '#EF4444', strokeDasharray: '5 5' }
    },
    {
      id: 'e9',
      source: 'condition-validation',
      target: 'screen-2fa',
      sourceHandle: 'cond-3',
      label: '2FA',
      style: { stroke: '#F59E0B' }
    },
    {
      id: 'e10',
      source: 'screen-2fa',
      target: 'screen-dashboard',
      label: 'Verify'
    },
    {
      id: 'e11',
      source: 'screen-dashboard',
      target: 'end-1'
    },
    {
      id: 'e12',
      source: 'screen-signup',
      target: 'action-validate',
      label: 'Register'
    }
  ],
  frames: [
    {
      id: 'frame-auth',
      title: 'Authentication Flow',
      position: { x: 650, y: 150 },
      size: { width: 550, height: 350 },
      style: {
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: '#3B82F6',
        borderWidth: 2,
        borderRadius: 12
      },
      containedNodes: ['screen-login', 'screen-signup', 'action-validate', 'condition-validation']
    }
  ]
};

export const mockOnboardingFlow: UXFlowDocument = {
  metadata: {
    flowName: 'User Onboarding Flow',
    version: '2.0.0',
    description: 'New user onboarding experience',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'UX Team',
    tags: ['onboarding', 'tutorial', 'first-use'],
    globalSettings: {
      gridSize: 20,
      snapToGrid: true,
      theme: 'light',
      showMinimap: true,
      showControls: true
    }
  },
  nodes: [
    {
      id: 'start-onboard',
      type: 'start',
      title: 'Start Onboarding',
      position: { x: 100, y: 200 }
    },
    {
      id: 'screen-welcome',
      type: 'screen',
      title: 'Welcome Screen',
      description: 'Greet new users and set expectations',
      position: { x: 300, y: 200 },
      size: { width: 180, height: 80 }
    },
    {
      id: 'screen-profile',
      type: 'screen',
      title: 'Profile Setup',
      description: 'Basic profile information',
      position: { x: 550, y: 200 },
      size: { width: 180, height: 80 }
    },
    {
      id: 'screen-preferences',
      type: 'screen',
      title: 'Preferences',
      description: 'User preferences and settings',
      position: { x: 800, y: 200 },
      size: { width: 180, height: 80 }
    },
    {
      id: 'subflow-tutorial',
      type: 'subflow',
      title: 'Interactive Tutorial',
      description: 'Link to tutorial subflow',
      position: { x: 1050, y: 200 },
      size: { width: 180, height: 80 },
      data: {
        subflowId: 'tutorial-flow-1'
      },
      style: {
        backgroundColor: '#E0E7FF',
        borderColor: '#6366F1',
        borderWidth: 2,
        borderRadius: 8
      }
    },
    {
      id: 'end-onboard',
      type: 'end',
      title: 'Complete',
      position: { x: 1300, y: 200 }
    }
  ],
  edges: [
    {
      id: 'eo1',
      source: 'start-onboard',
      target: 'screen-welcome'
    },
    {
      id: 'eo2',
      source: 'screen-welcome',
      target: 'screen-profile',
      label: 'Next'
    },
    {
      id: 'eo3',
      source: 'screen-profile',
      target: 'screen-preferences',
      label: 'Continue'
    },
    {
      id: 'eo4',
      source: 'screen-preferences',
      target: 'subflow-tutorial',
      label: 'Start Tutorial'
    },
    {
      id: 'eo5',
      source: 'subflow-tutorial',
      target: 'end-onboard',
      label: 'Finish'
    }
  ]
};

export const mockFlows = [mockLoginFlow, mockOnboardingFlow];

export const mockGhostProposal = {
  nodes: [
    {
      id: 'ghost-1',
      type: 'screen' as const,
      title: 'Password Reset',
      description: 'AI suggested: Add password reset flow',
      position: { x: 700, y: 450 },
      size: { width: 180, height: 80 },
      isGhost: true,
      style: {
        opacity: 0.5,
        backgroundColor: '#F3F4F6',
        borderColor: '#6366F1',
        borderWidth: 2,
        borderRadius: 8
      }
    }
  ],
  edges: [
    {
      id: 'ghost-edge-1',
      source: 'screen-login',
      target: 'ghost-1',
      label: 'Forgot Password?',
      isGhost: true,
      style: {
        stroke: '#6366F1',
        strokeWidth: 2,
        strokeDasharray: '5 5'
      }
    }
  ]
};