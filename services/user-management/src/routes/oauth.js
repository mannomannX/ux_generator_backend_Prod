// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/oauth.js
// ==========================================

import express from 'express';
import passport from 'passport';

const router = express.Router();

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  async (req, res) => {
    try {
      // Generate tokens
      const tokens = await req.app.locals.oauthStrategies.generateTokens(req.user);
      
      // Redirect to frontend with tokens
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/success?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
  }
);

// GitHub OAuth
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
  async (req, res) => {
    try {
      // Generate tokens
      const tokens = await req.app.locals.oauthStrategies.generateTokens(req.user);
      
      // Redirect to frontend with tokens
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/success?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
  }
);

// OAuth failure
router.get('/failure', (req, res) => {
  res.status(401).json({
    error: 'Authentication failed',
    message: 'OAuth authentication failed. Please try again.',
  });
});

export default router;