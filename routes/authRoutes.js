import express from 'express';
import {
  googleAuth,
  getGoogleOAuthUrl,
  googleOAuthCallback,
  getMe,
  signup,
  login,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// --- Local Authentication Routes ---
router.post('/signup', signup);
router.post('/login', login);

// --- Password Reset & OTP Routes ---
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// --- Google OAuth Routes (Preserved) ---
// Exchange GIS credential or code for JWT
router.post('/google', googleAuth);

// Get Google OAuth consent URL for redirect flow
router.get('/google/url', getGoogleOAuthUrl);

// Google OAuth callback endpoint
router.get('/google/callback', googleOAuthCallback);

// --- Authenticated User Route ---
router.get('/me', authenticateUser, getMe);

export default router;
