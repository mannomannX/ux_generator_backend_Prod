import { UXFlowDocument } from '@/types/uxflow';

export const completeExampleFlow: UXFlowDocument = {
  metadata: {
    flowName: 'E-Commerce Complete Flow Example',
    version: '1.0.0',
    description: 'Comprehensive example showcasing all node types',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: 'Demo Team',
    tags: ['example', 'demo', 'all-nodes'],
    personas: [
      {
        id: 'persona-1',
        name: 'Regular Shopper',
        description: 'Frequent buyer who knows the platform',
        color: '#3B82F6'
      },
      {
        id: 'persona-2',
        name: 'Guest User',
        description: 'First-time visitor browsing products',
        color: '#10B981'
      },
      {
        id: 'persona-3',
        name: 'Premium Member',
        description: 'VIP customer with special privileges',
        color: '#8B5CF6'
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
    // Start Node
    {
      id: 'start-main',
      type: 'start',
      title: 'Start',
      position: { x: 50, y: 400 },
      style: {
        backgroundColor: '#10B981',
        borderRadius: 50
      }
    },
    
    // Screen Nodes
    {
      id: 'screen-homepage',
      type: 'screen',
      title: 'Homepage',
      description: 'Main landing page with product categories',
      position: { x: 200, y: 380 },
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
            name: 'Mobile View',
            type: 'custom',
            screenshot: ''
          },
          {
            id: 'var-2',
            name: 'Holiday Theme',
            type: 'custom',
            screenshot: ''
          }
        ]
      }
    },
    
    // Decision Node
    {
      id: 'decision-user-type',
      type: 'decision',
      title: 'User Type?',
      description: 'Determine if user is logged in or guest',
      position: { x: 450, y: 380 },
      size: { width: 140, height: 80 },
      style: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
        borderWidth: 2
      }
    },
    
    // Frame Node (containing multiple screens)
    {
      id: 'frame-product-browse',
      type: 'frame',
      title: 'Product Browsing Area',
      position: { x: 650, y: 200 },
      size: { width: 600, height: 400 },
      style: {
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: '#3B82F6',
        borderWidth: 2,
        borderRadius: 12,
        borderStyle: 'dashed'
      }
    },
    
    // Screen inside frame
    {
      id: 'screen-product-list',
      type: 'screen',
      title: 'Product Listing',
      description: 'Grid view of products with filters',
      position: { x: 700, y: 250 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-1', 'persona-2'],
      uiMetadata: {
        responsiveVersion: 'desktop',
        completionStatus: 'done'
      }
    },
    
    // Enhanced Screen Node
    {
      id: 'enhanced-product-detail',
      type: 'enhanced-screen',
      title: 'Product Detail Page',
      description: 'Detailed product view with reviews and recommendations',
      position: { x: 950, y: 250 },
      size: { width: 200, height: 100 },
      data: {
        components: ['ImageGallery', 'ReviewSection', 'AddToCart', 'Recommendations'],
        interactions: ['Zoom', 'Swipe', 'Tap', 'Scroll'],
        dataBindings: ['ProductAPI', 'ReviewsAPI', 'InventoryAPI']
      },
      style: {
        backgroundColor: '#E0E7FF',
        borderColor: '#6366F1',
        borderWidth: 3,
        borderRadius: 12
      }
    },
    
    // Action Node
    {
      id: 'action-add-to-cart',
      type: 'action',
      title: 'Add to Cart',
      description: 'Process adding item to shopping cart',
      position: { x: 700, y: 380 },
      size: { width: 160, height: 60 },
      style: {
        backgroundColor: '#EDE9FE',
        borderColor: '#8B5CF6',
        borderWidth: 2
      }
    },
    
    // Condition Node
    {
      id: 'condition-stock-check',
      type: 'condition',
      title: 'Stock Available?',
      position: { x: 950, y: 380 },
      size: { width: 140, height: 80 },
      data: {
        conditions: [
          { id: 'cond-1', label: 'In Stock', targetNodeId: 'screen-cart' },
          { id: 'cond-2', label: 'Out of Stock', targetNodeId: 'screen-waitlist' },
          { id: 'cond-3', label: 'Low Stock', targetNodeId: 'screen-urgent' }
        ]
      },
      style: {
        backgroundColor: '#FEE2E2',
        borderColor: '#DC2626',
        borderWidth: 2
      }
    },
    
    // SubFlow Node
    {
      id: 'subflow-checkout',
      type: 'subflow',
      title: 'Checkout Process',
      description: 'Complete checkout subflow',
      position: { x: 1300, y: 250 },
      size: { width: 200, height: 100 },
      data: {
        subflowId: 'checkout-flow-001',
        steps: ['Shipping', 'Payment', 'Review', 'Confirmation']
      },
      style: {
        backgroundColor: '#D1FAE5',
        borderColor: '#10B981',
        borderWidth: 3,
        borderRadius: 8,
        borderStyle: 'double'
      }
    },
    
    // Note Nodes
    {
      id: 'note-security',
      type: 'note',
      title: 'Security Requirements',
      description: 'All payment processing must use PCI-compliant APIs with SSL encryption',
      position: { x: 1300, y: 100 },
      size: { width: 200, height: 80 },
      style: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
        borderWidth: 1,
        borderRadius: 4
      }
    },
    
    {
      id: 'note-analytics',
      type: 'note',
      title: 'Analytics Tracking',
      description: 'Track user journey through Google Analytics 4 events',
      position: { x: 700, y: 500 },
      size: { width: 180, height: 70 },
      style: {
        backgroundColor: '#E0E7FF',
        borderColor: '#6366F1',
        borderWidth: 1,
        borderRadius: 4
      }
    },
    
    // Additional screens for completeness
    {
      id: 'screen-cart',
      type: 'screen',
      title: 'Shopping Cart',
      description: 'Review items before checkout',
      position: { x: 1300, y: 380 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-1', 'persona-3']
    },
    
    {
      id: 'screen-waitlist',
      type: 'screen',
      title: 'Join Waitlist',
      description: 'Sign up for restock notification',
      position: { x: 950, y: 500 },
      size: { width: 180, height: 80 }
    },
    
    {
      id: 'screen-urgent',
      type: 'screen',
      title: 'Limited Stock Alert',
      description: 'Urgency messaging for low stock',
      position: { x: 1150, y: 450 },
      size: { width: 180, height: 80 },
      style: {
        backgroundColor: '#FEE2E2',
        borderColor: '#DC2626',
        borderWidth: 2
      }
    },
    
    {
      id: 'screen-account',
      type: 'screen',
      title: 'Account Dashboard',
      description: 'User account management',
      position: { x: 450, y: 250 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-1', 'persona-3']
    },
    
    {
      id: 'screen-guest-checkout',
      type: 'screen',
      title: 'Guest Checkout',
      description: 'Checkout without account',
      position: { x: 450, y: 500 },
      size: { width: 180, height: 80 },
      personaIds: ['persona-2']
    },
    
    // End Nodes
    {
      id: 'end-success',
      type: 'end',
      title: 'Order Complete',
      position: { x: 1600, y: 270 },
      style: {
        backgroundColor: '#10B981',
        borderRadius: 50
      }
    },
    
    {
      id: 'end-abandoned',
      type: 'end',
      title: 'Cart Abandoned',
      position: { x: 1600, y: 400 },
      style: {
        backgroundColor: '#EF4444',
        borderRadius: 50
      }
    },
    
    // Additional Notes with different priorities
    {
      id: 'note-performance',
      type: 'note',
      title: 'Performance Target',
      description: 'Page load time < 2s, Time to Interactive < 3s',
      priority: 'important',
      position: { x: 200, y: 250 },
      data: {}
    },
    {
      id: 'note-security',
      type: 'note',
      title: 'Security Alert',
      description: 'Implement CSRF protection on all forms',
      priority: 'critical',
      position: { x: 1000, y: 50 },
      data: {}
    },
    {
      id: 'note-info',
      type: 'note',
      title: 'API Documentation',
      description: 'REST API docs available at /api/docs',
      priority: 'info',
      position: { x: 600, y: 50 },
      data: {}
    }
  ],
  edges: [
    {
      id: 'e1',
      source: 'start-main',
      target: 'screen-homepage',
      type: 'smoothstep'
    },
    {
      id: 'e2',
      source: 'screen-homepage',
      target: 'decision-user-type',
      label: 'Browse'
    },
    {
      id: 'e3',
      source: 'decision-user-type',
      target: 'screen-account',
      label: 'Logged In',
      style: { stroke: '#10B981' }
    },
    {
      id: 'e4',
      source: 'decision-user-type',
      target: 'screen-product-list',
      label: 'Continue as Guest',
      style: { stroke: '#6B7280' }
    },
    {
      id: 'e5',
      source: 'decision-user-type',
      target: 'screen-guest-checkout',
      label: 'Guest Checkout',
      style: { stroke: '#F59E0B' }
    },
    {
      id: 'e6',
      source: 'screen-account',
      target: 'screen-product-list',
      label: 'Shop'
    },
    {
      id: 'e7',
      source: 'screen-product-list',
      target: 'enhanced-product-detail',
      label: 'View Product'
    },
    {
      id: 'e8',
      source: 'enhanced-product-detail',
      target: 'action-add-to-cart',
      label: 'Add to Cart'
    },
    {
      id: 'e9',
      source: 'action-add-to-cart',
      target: 'condition-stock-check'
    },
    {
      id: 'e10',
      source: 'condition-stock-check',
      target: 'screen-cart',
      sourceHandle: 'cond-1',
      label: 'In Stock',
      style: { stroke: '#10B981' }
    },
    {
      id: 'e11',
      source: 'condition-stock-check',
      target: 'screen-waitlist',
      sourceHandle: 'cond-2',
      label: 'Out of Stock',
      style: { stroke: '#EF4444', strokeDasharray: '5 5' }
    },
    {
      id: 'e12',
      source: 'condition-stock-check',
      target: 'screen-urgent',
      sourceHandle: 'cond-3',
      label: 'Low Stock',
      style: { stroke: '#F59E0B' }
    },
    {
      id: 'e13',
      source: 'screen-cart',
      target: 'subflow-checkout',
      label: 'Proceed to Checkout'
    },
    {
      id: 'e14',
      source: 'subflow-checkout',
      target: 'end-success',
      label: 'Complete',
      style: { stroke: '#10B981', strokeWidth: 3 }
    },
    {
      id: 'e15',
      source: 'screen-cart',
      target: 'end-abandoned',
      label: 'Exit',
      style: { stroke: '#EF4444', strokeDasharray: '5 5' }
    },
    {
      id: 'e16',
      source: 'screen-urgent',
      target: 'screen-cart',
      label: 'Quick Buy'
    },
    {
      id: 'e17',
      source: 'screen-guest-checkout',
      target: 'subflow-checkout',
      label: 'Guest Checkout'
    },
    {
      id: 'e18',
      source: 'screen-waitlist',
      target: 'end-abandoned',
      label: 'Exit',
      style: { stroke: '#6B7280', strokeDasharray: '3 3' }
    }
  ],
  frames: [
    {
      id: 'frame-product-browse',
      title: 'Product Browsing Area',
      position: { x: 650, y: 200 },
      size: { width: 600, height: 400 },
      style: {
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: '#3B82F6',
        borderWidth: 2,
        borderRadius: 12
      },
      containedNodes: ['screen-product-list', 'enhanced-product-detail', 'action-add-to-cart', 'condition-stock-check', 'note-analytics']
    }
  ]
};