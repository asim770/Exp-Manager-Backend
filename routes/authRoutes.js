import express from 'express';
import {
  googleAuth,
  getGoogleOAuthUrl,
  googleOAuthCallback,
  getMe,
} from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Exchange GIS credential or code for JWT
router.post('/google', googleAuth);

// Get Google OAuth consent URL for redirect flow
router.get('/google/url', getGoogleOAuthUrl);

// Google OAuth callback endpoint
router.get('/google/callback', googleOAuthCallback);

// Current user info
router.get('/me', authenticateUser, getMe);

export default router;
