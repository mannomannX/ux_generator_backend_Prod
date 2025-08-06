// ==========================================
// services/user-management/tests/integration/auth-routes.test.js
// ==========================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import authRoutes from '../../src/routes/auth.js';
import { testUsers } from '../fixtures/users.js';

describe('Auth Routes Integration', () => {
  let app;
  let server;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    
    // Mock services
    app.use((req, res, next) => {
      req.userManager = {
        createUser: jest.fn(),
        authenticateUser: jest.fn(),
        getUserProfile: jest.fn(),
      };
      req.correlationId = 'test-correlation-id';
      next();
    });

    app.use('/auth', authRoutes);
    
    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user123',
        email: testUsers.validUser.email,
        firstName: testUsers.validUser.firstName,
        lastName: testUsers.validUser.lastName,
      };

      app.request.userManager.createUser.mockResolvedValue(mockUser);
      app.request.userManager.authenticateUser.mockResolvedValue({
        user: mockUser,
        tokens: {
          accessToken: 'mock-token',
          expiresIn: '7d',
        },
      });

      const response = await request(app)
        .post('/auth/register')
        .send(testUsers.validUser)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
    });

    it('should return validation error for invalid data', async () => {
      const invalidUser = {
        email: 'invalid-email',
        password: '123', // Too short
      };

      const response = await request(app)
        .post('/auth/register')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockAuthResult = {
        user: {
          id: 'user123',
          email: testUsers.validUser.email,
          firstName: testUsers.validUser.firstName,
        },
        tokens: {
          accessToken: 'mock-token',
          expiresIn: '7d',
        },
      };

      app.request.userManager.authenticateUser.mockResolvedValue(mockAuthResult);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUsers.validUser.email,
          password: testUsers.validUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
    });

    it('should return error for invalid credentials', async () => {
      app.request.userManager.authenticateUser.mockRejectedValue(
        new Error('Invalid email or password')
      );

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });
  });
});