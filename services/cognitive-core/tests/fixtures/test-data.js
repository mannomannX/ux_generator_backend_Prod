// ==========================================
// COGNITIVE CORE - Test Fixtures
// ==========================================

export const testTasks = {
  simple: {
    userMessage: 'Create a login screen',
    expectedType: 'planner_task',
    context: {
      projectType: 'web',
      quality: 'standard'
    }
  },
  complex: {
    userMessage: 'Design a complete e-commerce checkout flow with payment integration',
    expectedType: 'architect_task',
    context: {
      projectType: 'e-commerce',
      quality: 'pro'
    }
  },
  analysis: {
    userMessage: 'Analyze the user flow for conversion optimization',
    expectedType: 'analyst_task',
    context: {
      hasData: true,
      metrics: ['conversion', 'bounce_rate']
    }
  },
  validation: {
    userMessage: 'Check if this design follows accessibility guidelines',
    expectedType: 'validator_task',
    context: {
      guidelines: ['WCAG2.1', 'ADA']
    }
  },
  visual: {
    userMessage: 'Create a dashboard with data visualization',
    expectedType: 'visual_task',
    context: {
      dataTypes: ['charts', 'graphs', 'metrics']
    }
  }
};

export const testAgentResponses = {
  manager: {
    success: {
      type: 'task_delegation',
      delegatedTo: 'planner',
      task: 'Create login screen with email and password fields',
      complexity: 'simple',
      estimatedTime: '15 minutes'
    },
    clarification: {
      type: 'clarification_needed',
      question: 'What type of authentication do you want to implement?',
      options: ['Email/Password', 'Social Login', 'SSO', 'Multi-factor']
    }
  },
  planner: {
    success: {
      type: 'flow_plan',
      steps: [
        { id: 1, action: 'Create form container', component: 'Container' },
        { id: 2, action: 'Add email input', component: 'TextInput' },
        { id: 3, action: 'Add password input', component: 'PasswordInput' },
        { id: 4, action: 'Add submit button', component: 'Button' },
        { id: 5, action: 'Add form validation', component: 'Validator' }
      ],
      estimatedNodes: 5
    }
  },
  classifier: {
    success: {
      type: 'classification',
      category: 'ui_creation',
      suggestedAgent: 'planner',
      confidence: 0.95,
      tags: ['form', 'authentication', 'user-input']
    }
  },
  synthesizer: {
    success: {
      type: 'synthesis',
      combinedFlow: {
        nodes: [
          { id: 'node1', type: 'start', position: { x: 0, y: 0 } },
          { id: 'node2', type: 'form', position: { x: 100, y: 0 } },
          { id: 'node3', type: 'end', position: { x: 200, y: 0 } }
        ],
        edges: [
          { source: 'node1', target: 'node2' },
          { source: 'node2', target: 'node3' }
        ]
      },
      summary: 'Combined login and registration flows'
    }
  },
  validator: {
    success: {
      type: 'validation_result',
      valid: true,
      issues: [],
      suggestions: [
        'Consider adding password strength indicator',
        'Add remember me checkbox for better UX'
      ],
      score: 95
    },
    withIssues: {
      type: 'validation_result',
      valid: false,
      issues: [
        { severity: 'error', message: 'Missing form labels for accessibility' },
        { severity: 'warning', message: 'Password field should have minimum length validation' }
      ],
      suggestions: [
        'Add aria-labels to all form inputs',
        'Implement client-side validation'
      ],
      score: 65
    }
  },
  architect: {
    success: {
      type: 'architecture',
      structure: {
        components: ['Header', 'Navigation', 'MainContent', 'Footer'],
        layout: 'responsive-grid',
        routing: ['/', '/login', '/dashboard', '/profile'],
        dataFlow: 'unidirectional',
        stateManagement: 'context-based'
      },
      recommendations: [
        'Use lazy loading for better performance',
        'Implement code splitting by route'
      ]
    }
  },
  uxExpert: {
    success: {
      type: 'ux_recommendations',
      principles: [
        'Consistency: Use the same design patterns throughout',
        'Feedback: Provide clear user feedback for all actions',
        'Simplicity: Keep the interface clean and uncluttered'
      ],
      improvements: [
        { area: 'Navigation', suggestion: 'Add breadcrumbs for better orientation' },
        { area: 'Forms', suggestion: 'Use inline validation for immediate feedback' }
      ],
      bestPractices: [
        'Follow 8px grid system',
        'Maintain 3:1 contrast ratio minimum',
        'Keep CTAs above the fold'
      ]
    }
  },
  analyst: {
    success: {
      type: 'analysis',
      metrics: {
        usability: 85,
        accessibility: 78,
        performance: 92,
        conversion_potential: 74
      },
      insights: [
        'High bounce rate on form pages indicates complexity',
        'Users spend average 45 seconds on checkout',
        'Mobile conversion is 40% lower than desktop'
      ],
      recommendations: [
        'Simplify form fields',
        'Add progress indicators',
        'Optimize mobile experience'
      ]
    }
  },
  visualInterpreter: {
    success: {
      type: 'visual_interpretation',
      elements: [
        { type: 'chart', subtype: 'line', data: 'sales_trend' },
        { type: 'chart', subtype: 'pie', data: 'category_distribution' },
        { type: 'metric', label: 'Total Revenue', value: '$45,231' }
      ],
      layout: {
        type: 'dashboard',
        columns: 3,
        rows: 2
      },
      colorScheme: {
        primary: '#007bff',
        secondary: '#6c757d',
        success: '#28a745',
        danger: '#dc3545'
      }
    }
  }
};

export const testContexts = {
  newProject: {
    projectId: 'proj_test_123',
    workspaceId: 'work_test_123',
    userId: 'user_test_123',
    projectType: 'web',
    history: [],
    preferences: {
      theme: 'light',
      complexity: 'balanced'
    }
  },
  existingProject: {
    projectId: 'proj_existing_123',
    workspaceId: 'work_test_123',
    userId: 'user_test_123',
    projectType: 'mobile',
    history: [
      { role: 'user', content: 'Create home screen' },
      { role: 'assistant', content: 'Home screen created with navigation' }
    ],
    currentFlow: {
      nodes: [
        { id: 'node1', type: 'screen', data: { title: 'Home' } }
      ],
      edges: []
    },
    preferences: {
      theme: 'dark',
      complexity: 'detailed'
    }
  }
};

export const testAIProviderResponses = {
  openai: {
    success: {
      choices: [{
        message: {
          content: JSON.stringify({
            type: 'response',
            content: 'Task completed successfully'
          })
        }
      }]
    },
    error: {
      error: {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded'
      }
    }
  },
  gemini: {
    success: {
      response: {
        text: () => JSON.stringify({
          type: 'response',
          content: 'Task completed successfully'
        })
      }
    },
    error: {
      error: {
        message: 'API key invalid',
        code: 401
      }
    }
  },
  claude: {
    success: {
      content: [{
        text: JSON.stringify({
          type: 'response',
          content: 'Task completed successfully'
        })
      }]
    },
    error: {
      error: {
        message: 'Model overloaded',
        type: 'overloaded_error'
      }
    }
  }
};

export const testPrompts = {
  manager: {
    input: 'Analyze this request: Create a login screen',
    expectedOutput: 'Task delegation to planner agent'
  },
  planner: {
    input: 'Create a step-by-step plan for: Login screen with email and password',
    expectedOutput: 'Flow plan with form components'
  },
  validator: {
    input: 'Validate this flow: [login form flow]',
    expectedOutput: 'Validation results with suggestions'
  }
};

export const mockServices = {
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  eventEmitter: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  },
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    has: jest.fn()
  },
  metrics: {
    increment: jest.fn(),
    gauge: jest.fn(),
    histogram: jest.fn(),
    timer: jest.fn()
  }
};

export default {
  testTasks,
  testAgentResponses,
  testContexts,
  testAIProviderResponses,
  testPrompts,
  mockServices
};