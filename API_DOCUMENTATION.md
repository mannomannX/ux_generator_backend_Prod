# 📚 UX Flow Engine API Documentation

> **Comprehensive API reference for frontend developers integrating with the UX Flow Engine backend**

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [WebSocket Connection](#websocket-connection)
- [REST API Endpoints](#rest-api-endpoints)
- [Event System](#event-system)
- [Data Models](#data-models)
- [Frontend Integration Guide](#frontend-integration-guide)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Example Implementations](#example-implementations)

---

## Overview

The UX Flow Engine is a microservices-based backend that transforms natural language into structured UX flows using AI. It provides both REST APIs and WebSocket connections for real-time communication.

### Base URLs

| Environment | API Gateway | WebSocket |
|------------|-------------|-----------|
| **Development** | `http://localhost:3000` | `ws://localhost:3000` |
| **Staging** | `https://staging-api.uxflow.app` | `wss://staging-api.uxflow.app` |
| **Production** | `https://api.uxflow.app` | `wss://api.uxflow.app` |

### Service Architecture

```
Frontend → API Gateway → [Cognitive Core, Flow Service, Knowledge Service, User Management]
           ↓        ↑
        WebSocket ←→ Redis Event Bus
```

---

## Authentication

### JWT Token Authentication

All API requests require JWT authentication except public endpoints.

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "tier": "pro"
  },
  "expiresIn": 3600
}
```

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

#### Using the Token
Include the JWT token in all subsequent requests:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

#### Token Refresh
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## WebSocket Connection

Real-time bidirectional communication for conversations and flow updates.

### Establishing Connection

```javascript
// Frontend WebSocket connection example
const socket = new WebSocket('ws://localhost:3000');

// Authentication after connection
socket.onopen = () => {
  socket.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};

// Handle messages
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleServerMessage(data);
};
```

### WebSocket Message Types

#### Client → Server Messages

**Send User Message:**
```json
{
  "type": "user_message",
  "data": {
    "projectId": "proj_123",
    "message": "Create a login flow with social auth",
    "context": {
      "qualityMode": "standard" // or "pro"
    }
  }
}
```

**Approve/Reject Plan:**
```json
{
  "type": "plan_approval",
  "data": {
    "projectId": "proj_123",
    "approved": true,
    "feedback": "Looks good, but add a loading state"
  }
}
```

**Subscribe to Flow Updates:**
```json
{
  "type": "subscribe",
  "data": {
    "channel": "flow_updates",
    "projectId": "proj_123"
  }
}
```

#### Server → Client Messages

**AI Response:**
```json
{
  "type": "ai_response",
  "data": {
    "messageType": "plan_for_approval",
    "message": "I've created a login flow with the following steps:",
    "plan": [
      {
        "step": 1,
        "action": "CREATE_SCREEN",
        "details": "Login screen with email and password fields"
      }
    ],
    "metadata": {
      "complexity": "medium",
      "estimatedTime": 5000,
      "agentsInvolved": ["planner", "architect"]
    }
  }
}
```

**Flow Update:**
```json
{
  "type": "flow_update",
  "data": {
    "projectId": "proj_123",
    "flowId": "flow_456",
    "updateType": "nodes_added",
    "changes": {
      "nodes": [...],
      "edges": [...]
    }
  }
}
```

**Processing Status:**
```json
{
  "type": "processing_status",
  "data": {
    "status": "thinking",
    "agent": "planner",
    "progress": 45
  }
}
```

---

## REST API Endpoints

### Projects

#### Create Project
```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "E-commerce App",
  "description": "Online shopping platform",
  "settings": {
    "industry": "retail",
    "targetAudience": "general",
    "platform": "web"
  }
}
```

**Response:**
```json
{
  "id": "proj_123",
  "name": "E-commerce App",
  "description": "Online shopping platform",
  "ownerId": "user_123",
  "createdAt": "2024-01-15T10:00:00Z",
  "flow": {
    "id": "flow_456",
    "nodes": [],
    "edges": []
  }
}
```

#### Get Project
```http
GET /api/projects/:projectId
Authorization: Bearer <token>
```

#### List Projects
```http
GET /api/projects
Authorization: Bearer <token>

Query Parameters:
- page: number (default: 1)
- limit: number (default: 20)
- search: string (optional)
```

#### Update Project
```http
PUT /api/projects/:projectId
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

#### Delete Project
```http
DELETE /api/projects/:projectId
Authorization: Bearer <token>
```

### Flows

#### Get Flow
```http
GET /api/flows/:flowId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "flow_456",
  "projectId": "proj_123",
  "version": 12,
  "nodes": [
    {
      "id": "node_1",
      "type": "screen",
      "data": {
        "name": "Login Screen",
        "components": [
          {
            "type": "input",
            "props": {
              "label": "Email",
              "type": "email",
              "required": true
            }
          }
        ]
      },
      "position": { "x": 100, "y": 100 }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "label": "Submit"
    }
  ],
  "metadata": {
    "totalScreens": 5,
    "complexity": "medium",
    "lastModified": "2024-01-15T10:30:00Z"
  }
}
```

#### Export Flow
```http
GET /api/flows/:flowId/export
Authorization: Bearer <token>

Query Parameters:
- format: "json" | "figma" | "code" (default: "json")
```

#### Apply Flow Transaction
```http
POST /api/flows/:flowId/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "transactions": [
    {
      "type": "ADD_NODE",
      "payload": {
        "id": "node_new",
        "type": "screen",
        "data": { "name": "Dashboard" },
        "position": { "x": 300, "y": 200 }
      }
    }
  ]
}
```

### Conversations

#### Get Conversation History
```http
GET /api/conversations/:projectId
Authorization: Bearer <token>

Query Parameters:
- limit: number (default: 50)
- offset: number (default: 0)
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Create a login flow",
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "I'll create a login flow for you...",
      "timestamp": "2024-01-15T10:00:05Z",
      "metadata": {
        "processingTime": 2500,
        "agentsUsed": ["planner", "architect"]
      }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

#### Clear Conversation
```http
DELETE /api/conversations/:projectId
Authorization: Bearer <token>
```

### Knowledge Base

#### Search Knowledge
```http
POST /api/knowledge/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "best practices for login flows",
  "projectId": "proj_123",
  "limit": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "knowledge_1",
      "content": "Login flows should include...",
      "relevanceScore": 0.95,
      "source": "ux-patterns",
      "metadata": {
        "category": "authentication",
        "lastUpdated": "2024-01-10T00:00:00Z"
      }
    }
  ]
}
```

### User Management

#### Get User Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "preferences": {
    "theme": "dark",
    "qualityMode": "pro"
  }
}
```

#### Get Usage Statistics
```http
GET /api/users/usage
Authorization: Bearer <token>
```

**Response:**
```json
{
  "tier": "pro",
  "usage": {
    "requestsToday": 45,
    "requestsThisMonth": 1234,
    "tokensUsed": 456789,
    "projectsCreated": 12
  },
  "limits": {
    "dailyRequests": 1000,
    "monthlyRequests": 30000,
    "maxProjects": 50
  }
}
```

---

## Event System

### Event Types

The backend emits various events through WebSocket for real-time updates:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `user_message_received` | User sent a message | `{ message, projectId, userId }` |
| `ai_response_ready` | AI generated response | `{ response, type, metadata }` |
| `flow_updated` | Flow structure changed | `{ flowId, changes, version }` |
| `processing_started` | AI processing began | `{ agent, taskId }` |
| `processing_completed` | AI processing finished | `{ agent, taskId, duration }` |
| `error_occurred` | Error in processing | `{ error, context }` |

### Subscribing to Events

```javascript
// Frontend event subscription
socket.send(JSON.stringify({
  type: 'subscribe',
  channels: ['flow_updates', 'ai_responses'],
  projectId: 'proj_123'
}));

// Handle specific events
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'flow_updated':
      updateFlowVisualization(data.data);
      break;
    case 'ai_response_ready':
      displayAIResponse(data.data);
      break;
    case 'processing_status':
      updateProcessingIndicator(data.data);
      break;
  }
};
```

---

## Data Models

### User Model
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  preferences: {
    theme: 'light' | 'dark';
    qualityMode: 'standard' | 'pro';
    language: string;
  };
  createdAt: string;
  lastActive: string;
}
```

### Project Model
```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  collaborators: string[];
  flowId: string;
  settings: {
    industry: string;
    targetAudience: string;
    platform: 'web' | 'mobile' | 'desktop';
  };
  metadata: {
    lastModified: string;
    version: number;
    totalScreens: number;
    complexity: 'simple' | 'medium' | 'complex';
  };
  createdAt: string;
  updatedAt: string;
}
```

### Flow Model
```typescript
interface Flow {
  id: string;
  projectId: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: {
    totalScreens: number;
    complexity: string;
    aiGenerated: boolean;
    lastModified: string;
  };
}

interface FlowNode {
  id: string;
  type: 'screen' | 'component' | 'decision' | 'api';
  data: {
    name: string;
    description?: string;
    components?: Component[];
    actions?: Action[];
  };
  position: { x: number; y: number };
  style?: Record<string, any>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'default' | 'conditional' | 'error';
  data?: Record<string, any>;
}
```

### Conversation Model
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  projectId: string;
  metadata?: {
    processingTime?: number;
    agentsUsed?: string[];
    aiProvider?: string;
    complexity?: string;
    tokenCount?: number;
  };
}

interface Conversation {
  projectId: string;
  messages: Message[];
  context: {
    currentFlow?: Flow;
    userPreferences: Record<string, any>;
    sessionData: Record<string, any>;
  };
  state: 'idle' | 'processing' | 'waiting_for_approval' | 'error';
}
```

---

## Frontend Integration Guide

### Initial Setup

```javascript
// 1. Configure API client
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 2. Add auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 3. Add response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refreshToken
          });
          localStorage.setItem('authToken', data.token);
          error.config.headers.Authorization = `Bearer ${data.token}`;
          return apiClient(error.config);
        } catch (refreshError) {
          // Redirect to login
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

### WebSocket Manager

```javascript
class WebSocketManager {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.socket = new WebSocket(this.url);
    
    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.authenticate();
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  authenticate() {
    this.send({
      type: 'auth',
      token: this.token
    });
  }

  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.error('WebSocket not connected');
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  off(eventType, callback) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  handleMessage(data) {
    const callbacks = this.listeners.get(data.type) || [];
    callbacks.forEach(callback => callback(data.data));
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Usage
const wsManager = new WebSocketManager(WS_URL, authToken);
wsManager.connect();

// Subscribe to events
wsManager.on('ai_response', (data) => {
  console.log('AI Response:', data);
});

wsManager.on('flow_update', (data) => {
  console.log('Flow Updated:', data);
});
```

### React Hook Example

```javascript
import { useState, useEffect, useCallback } from 'react';

function useUXFlowEngine(projectId) {
  const [messages, setMessages] = useState([]);
  const [flow, setFlow] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wsManager, setWsManager] = useState(null);

  useEffect(() => {
    // Initialize WebSocket
    const token = localStorage.getItem('authToken');
    const manager = new WebSocketManager(WS_URL, token);
    manager.connect();
    
    // Subscribe to events
    manager.on('ai_response', handleAIResponse);
    manager.on('flow_update', handleFlowUpdate);
    manager.on('processing_status', handleProcessingStatus);
    
    setWsManager(manager);
    
    // Load initial data
    loadProject(projectId);
    loadConversation(projectId);
    
    return () => {
      manager.disconnect();
    };
  }, [projectId]);

  const handleAIResponse = useCallback((data) => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: data.message,
      metadata: data.metadata
    }]);
    setIsProcessing(false);
  }, []);

  const handleFlowUpdate = useCallback((data) => {
    setFlow(data.flow);
  }, []);

  const handleProcessingStatus = useCallback((data) => {
    setIsProcessing(data.status === 'processing');
  }, []);

  const sendMessage = useCallback((message) => {
    if (!wsManager) return;
    
    // Add user message to UI
    setMessages(prev => [...prev, {
      role: 'user',
      content: message
    }]);
    
    // Send to backend
    wsManager.send({
      type: 'user_message',
      data: {
        projectId,
        message,
        context: {
          qualityMode: 'standard'
        }
      }
    });
    
    setIsProcessing(true);
  }, [wsManager, projectId]);

  const approvePlan = useCallback((approved, feedback) => {
    if (!wsManager) return;
    
    wsManager.send({
      type: 'plan_approval',
      data: {
        projectId,
        approved,
        feedback
      }
    });
  }, [wsManager, projectId]);

  const loadProject = async (projectId) => {
    try {
      const response = await apiClient.get(`/api/projects/${projectId}`);
      setFlow(response.data.flow);
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  };

  const loadConversation = async (projectId) => {
    try {
      const response = await apiClient.get(`/api/conversations/${projectId}`);
      setMessages(response.data.conversations);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  return {
    messages,
    flow,
    isProcessing,
    sendMessage,
    approvePlan
  };
}
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description | Action |
|------|-------------|-------------|--------|
| `UNAUTHORIZED` | 401 | Invalid or expired token | Refresh token or re-login |
| `FORBIDDEN` | 403 | Insufficient permissions | Check user tier/role |
| `NOT_FOUND` | 404 | Resource not found | Verify ID exists |
| `VALIDATION_ERROR` | 400 | Invalid input data | Check request format |
| `RATE_LIMIT` | 429 | Too many requests | Implement backoff |
| `SERVER_ERROR` | 500 | Internal server error | Retry with backoff |
| `AI_PROCESSING_ERROR` | 500 | AI processing failed | Retry or contact support |
| `INSUFFICIENT_CREDITS` | 402 | Out of API credits | Upgrade plan |

### Error Handling Example

```javascript
// Centralized error handler
class ErrorHandler {
  static handle(error) {
    const errorCode = error.response?.data?.error?.code;
    
    switch (errorCode) {
      case 'UNAUTHORIZED':
        // Attempt token refresh
        return this.refreshAuth();
        
      case 'RATE_LIMIT':
        // Show rate limit message
        this.showNotification('Please wait before making more requests');
        return this.retryWithBackoff(error.config);
        
      case 'INSUFFICIENT_CREDITS':
        // Prompt upgrade
        this.showUpgradePrompt();
        break;
        
      case 'AI_PROCESSING_ERROR':
        // Show friendly error
        this.showNotification('AI is having trouble understanding. Please try rephrasing.');
        break;
        
      default:
        // Generic error handling
        this.showNotification('Something went wrong. Please try again.');
        console.error('Unhandled error:', error);
    }
  }
  
  static async retryWithBackoff(config, attempt = 1) {
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      return await apiClient(config);
    } catch (error) {
      if (attempt < 3) {
        return this.retryWithBackoff(config, attempt + 1);
      }
      throw error;
    }
  }
}
```

---

## Best Practices

### 1. Connection Management

```javascript
// Implement connection state management
class ConnectionManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.wsConnected = false;
    
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }
  
  handleOnline() {
    this.isOnline = true;
    if (!this.wsConnected) {
      this.reconnectWebSocket();
    }
  }
  
  handleOffline() {
    this.isOnline = false;
    this.queueMessages();
  }
  
  queueMessages() {
    // Store messages locally for retry when online
  }
}
```

### 2. Optimistic Updates

```javascript
// Apply changes immediately, rollback on error
const updateFlow = async (flowId, changes) => {
  // Optimistic update
  setFlow(prev => ({
    ...prev,
    ...changes
  }));
  
  try {
    const response = await apiClient.put(`/api/flows/${flowId}`, changes);
    setFlow(response.data);
  } catch (error) {
    // Rollback on error
    setFlow(prev => ({
      ...prev,
      ...originalFlow
    }));
    ErrorHandler.handle(error);
  }
};
```

### 3. Request Debouncing

```javascript
// Debounce search requests
import { debounce } from 'lodash';

const searchKnowledge = debounce(async (query) => {
  try {
    const response = await apiClient.post('/api/knowledge/search', {
      query,
      projectId: currentProjectId
    });
    setSearchResults(response.data.results);
  } catch (error) {
    ErrorHandler.handle(error);
  }
}, 300);
```

### 4. Caching Strategy

```javascript
// Implement client-side caching
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

---

## Example Implementations

### Complete Chat Interface

```javascript
import React, { useState, useEffect, useRef } from 'react';
import { useUXFlowEngine } from './hooks/useUXFlowEngine';

function ChatInterface({ projectId }) {
  const [input, setInput] = useState('');
  const [showPlanApproval, setShowPlanApproval] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const messagesEndRef = useRef(null);
  
  const {
    messages,
    flow,
    isProcessing,
    sendMessage,
    approvePlan
  } = useUXFlowEngine(projectId);
  
  useEffect(() => {
    // Check for plan approval needed
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.metadata?.type === 'plan_for_approval') {
      setShowPlanApproval(true);
      setCurrentPlan(lastMessage.plan);
    }
  }, [messages]);
  
  useEffect(() => {
    // Scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSend = () => {
    if (input.trim() && !isProcessing) {
      sendMessage(input);
      setInput('');
    }
  };
  
  const handlePlanResponse = (approved) => {
    approvePlan(approved, input);
    setShowPlanApproval(false);
    setCurrentPlan(null);
    setInput('');
  };
  
  return (
    <div className="chat-interface">
      <div className="messages">
        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`message ${message.role}`}
          >
            <div className="message-content">
              {message.content}
            </div>
            {message.metadata && (
              <div className="message-metadata">
                <span className="processing-time">
                  {message.metadata.processingTime}ms
                </span>
                <span className="agents">
                  {message.metadata.agentsUsed?.join(', ')}
                </span>
              </div>
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="message assistant processing">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {showPlanApproval && currentPlan && (
        <div className="plan-approval">
          <h3>Review Plan</h3>
          <div className="plan-steps">
            {currentPlan.map((step, index) => (
              <div key={index} className="plan-step">
                <span className="step-number">{step.step}</span>
                <span className="step-action">{step.action}</span>
                <span className="step-details">{step.details}</span>
              </div>
            ))}
          </div>
          <div className="plan-actions">
            <button 
              onClick={() => handlePlanResponse(true)}
              className="approve-btn"
            >
              Approve Plan
            </button>
            <button 
              onClick={() => handlePlanResponse(false)}
              className="reject-btn"
            >
              Request Changes
            </button>
          </div>
        </div>
      )}
      
      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            showPlanApproval 
              ? "Provide feedback for the plan..." 
              : "Describe what you want to build..."
          }
          disabled={isProcessing}
        />
        <button 
          onClick={showPlanApproval ? () => handlePlanResponse(false) : handleSend}
          disabled={isProcessing || !input.trim()}
        >
          {showPlanApproval ? 'Send Feedback' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

### Flow Visualization Component

```javascript
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

function FlowVisualization({ flow, onNodeClick, onEdgeClick }) {
  const svgRef = useRef(null);
  
  useEffect(() => {
    if (!flow || !flow.nodes) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const width = 800;
    const height = 600;
    
    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 2])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    const container = svg.append('g');
    
    // Draw edges
    const edges = container.selectAll('.edge')
      .data(flow.edges)
      .enter()
      .append('g')
      .attr('class', 'edge')
      .on('click', (event, d) => onEdgeClick?.(d));
    
    edges.append('line')
      .attr('x1', d => {
        const source = flow.nodes.find(n => n.id === d.source);
        return source?.position.x || 0;
      })
      .attr('y1', d => {
        const source = flow.nodes.find(n => n.id === d.source);
        return source?.position.y || 0;
      })
      .attr('x2', d => {
        const target = flow.nodes.find(n => n.id === d.target);
        return target?.position.x || 0;
      })
      .attr('y2', d => {
        const target = flow.nodes.find(n => n.id === d.target);
        return target?.position.y || 0;
      })
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');
    
    // Draw nodes
    const nodes = container.selectAll('.node')
      .data(flow.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.position.x}, ${d.position.y})`)
      .on('click', (event, d) => onNodeClick?.(d))
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));
    
    // Add node rectangles
    nodes.append('rect')
      .attr('width', 120)
      .attr('height', 60)
      .attr('x', -60)
      .attr('y', -30)
      .attr('rx', 5)
      .attr('fill', d => {
        switch(d.type) {
          case 'screen': return '#4CAF50';
          case 'component': return '#2196F3';
          case 'decision': return '#FF9800';
          case 'api': return '#9C27B0';
          default: return '#757575';
        }
      })
      .attr('stroke', '#333')
      .attr('stroke-width', 2);
    
    // Add node labels
    nodes.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', 'white')
      .attr('font-size', '14px')
      .text(d => d.data.name);
    
    // Define arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 13)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 13)
      .attr('markerHeight', 13)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#999');
    
    // Drag functions
    function dragStarted(event, d) {
      d3.select(this).raise().attr('stroke', 'black');
    }
    
    function dragged(event, d) {
      d.position.x = event.x;
      d.position.y = event.y;
      d3.select(this).attr('transform', `translate(${d.position.x}, ${d.position.y})`);
      updateEdges();
    }
    
    function dragEnded(event, d) {
      // Send position update to backend
      updateNodePosition(d.id, d.position);
    }
    
    function updateEdges() {
      edges.selectAll('line')
        .attr('x1', d => {
          const source = flow.nodes.find(n => n.id === d.source);
          return source?.position.x || 0;
        })
        .attr('y1', d => {
          const source = flow.nodes.find(n => n.id === d.source);
          return source?.position.y || 0;
        })
        .attr('x2', d => {
          const target = flow.nodes.find(n => n.id === d.target);
          return target?.position.x || 0;
        })
        .attr('y2', d => {
          const target = flow.nodes.find(n => n.id === d.target);
          return target?.position.y || 0;
        });
    }
    
  }, [flow, onNodeClick, onEdgeClick]);
  
  const updateNodePosition = async (nodeId, position) => {
    try {
      await apiClient.post(`/api/flows/${flow.id}/transactions`, {
        transactions: [{
          type: 'UPDATE_NODE',
          payload: {
            id: nodeId,
            position
          }
        }]
      });
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  };
  
  return (
    <div className="flow-visualization">
      <svg 
        ref={svgRef}
        width="100%"
        height="600"
        style={{ border: '1px solid #ddd' }}
      />
    </div>
  );
}
```

---

## Testing Your Integration

### API Health Check

```bash
# Check if backend is running
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "services": {
    "api-gateway": "ok",
    "cognitive-core": "ok",
    "flow-service": "ok",
    "knowledge-service": "ok",
    "user-management": "ok"
  }
}
```

### Test Authentication

```javascript
// Test login
const testAuth = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    
    const data = await response.json();
    console.log('Auth successful:', data);
    return data.token;
  } catch (error) {
    console.error('Auth failed:', error);
  }
};
```

### Test WebSocket Connection

```javascript
// Test WebSocket
const testWebSocket = (token) => {
  const ws = new WebSocket('ws://localhost:3000');
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    ws.send(JSON.stringify({ type: 'auth', token }));
  };
  
  ws.onmessage = (event) => {
    console.log('Received:', JSON.parse(event.data));
  };
  
  // Send test message
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'user_message',
      data: {
        projectId: 'test_project',
        message: 'Hello, AI!'
      }
    }));
  }, 1000);
};
```

---

## Rate Limiting

The API implements rate limiting to ensure fair usage:

| Tier | Requests/Min | Requests/Day | Concurrent Connections |
|------|--------------|--------------|------------------------|
| Free | 10 | 100 | 1 |
| Basic | 30 | 1,000 | 3 |
| Pro | 60 | 10,000 | 5 |
| Enterprise | Unlimited | Unlimited | Unlimited |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1642291200
```

---

## Support & Resources

### Documentation
- [System Architecture](./docs/ARCHITECTURE.md)
- [WebSocket Protocol](./docs/WEBSOCKET_PROTOCOL.md)
- [Event System](./docs/EVENTS.md)
- [Flow Transaction Spec](./services/flow-service/TRANSACTIONS.md)

### SDKs & Libraries
- [React SDK](https://github.com/ux-flow-engine/react-sdk)
- [Vue SDK](https://github.com/ux-flow-engine/vue-sdk)
- [TypeScript Types](https://github.com/ux-flow-engine/types)

### Contact
- **API Support**: api-support@uxflow.app
- **Bug Reports**: https://github.com/ux-flow-engine/issues
- **Discord Community**: https://discord.gg/uxflow

---

> **Last Updated**: February 2024  
> **API Version**: 2.1.0  
> **Status**: Production Ready