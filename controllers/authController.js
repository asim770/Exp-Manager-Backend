import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Transaction from '../models/Transaction.js';
import Borrow from '../models/Borrow.js';
import Lend from '../models/Lend.js';
import SavingsGoal from '../models/SavingsGoal.js';
import Notification from '../models/Notification.js';

const getOAuthClient = (redirectUri) => {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI
  );
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET || 'super_secret_expense_manager_jwt_key_2026_xyz987',
    { expiresIn: '30d' }
  );
};

// Helper to ensure profile and migrate any unassigned existing legacy data
const syncUserProfile = async (user) => {
  let profile = await Profile.findOne({ user: user._id });
  if (!profile) {
    // Check if an unassigned legacy profile exists
    const legacyProfile = await Profile.findOne({ user: { $exists: false } });
    if (legacyProfile) {
      legacyProfile.user = user._id;
      if (!legacyProfile.name || legacyProfile.name === 'Asim Maji' || legacyProfile.name === 'User') {
        legacyProfile.name = user.name;
      }
      await legacyProfile.save();
      profile = legacyProfile;
    } else {
      profile = await Profile.create({
        user: user._id,
        name: user.name,
        currency: 'USD',
        monthlyBudget: 2000,
        budgetAlertPercentage: 80,
        savingsGoal: 5000,
        theme: 'dark',
      });
    }
  }

  // Migrate legacy data without a user assignment to this first user
  try {
    await Transaction.updateMany({ user: { $exists: false } }, { user: user._id });
    await Borrow.updateMany({ user: { $exists: false } }, { user: user._id });
    await Lend.updateMany({ user: { $exists: false } }, { user: user._id });
    await SavingsGoal.updateMany({ user: { $exists: false } }, { user: user._id });
    await Notification.updateMany({ user: { $exists: false } }, { user: user._id });
  } catch (migErr) {
    console.error('Legacy data migration notice:', migErr.message);
  }

  return profile;
};

// Main Google Authentication (handles both GIS ID Token credential and OAuth code)
export const googleAuth = async (req, res) => {
  try {
    const { credential, code, redirectUri } = req.body;

    if (!credential && !code) {
      return res.status(400).json({ message: 'Google credential or authorization code is required' });
    }

    let payload = null;

    if (credential) {
      // 1. Direct ID token verification
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.warn('verifyIdToken failed, attempting fallback verify:', verifyErr.message);
        // Fallback using Google's public tokeninfo endpoint
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (!response.ok) {
          throw new Error('Invalid Google credential token');
        }
        payload = await response.json();
      }
    } else if (code) {
      // 2. Authorization code exchange
      const effectiveRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI;
      const oauth2Client = getOAuthClient(effectiveRedirectUri);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      if (tokens.id_token) {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } else {
        // Fetch user info via userinfo endpoint
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        payload = await userInfoRes.json();
      }
    }

    if (!payload || (!payload.sub && !payload.id)) {
      return res.status(400).json({ message: 'Failed to extract user profile from Google' });
    }

    const googleId = payload.sub || payload.id;
    const email = (payload.email || '').toLowerCase();
    const name = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture || '';

    if (!email) {
      return res.status(400).json({ message: 'Google account did not provide an email address' });
    }

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      user.googleId = googleId;
      user.name = name || user.name;
      user.avatar = avatar || user.avatar;
      user.lastLogin = new Date();
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        name,
        avatar,
        createdAt: new Date(),
        lastLogin: new Date(),
      });
    }

    const profile = await syncUserProfile(user);
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
      profile,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'Google authentication failed', error: error.message });
  }
};

// Generate Google OAuth URL for direct browser redirect
export const getGoogleOAuthUrl = (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || process.env.GOOGLE_REDIRECT_URI;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const scope = encodeURIComponent('openid email profile');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ message: 'Error generating Google OAuth URL', error: error.message });
  }
};

// Google Callback Endpoint (for direct OAuth redirect flow)
export const googleOAuthCallback = async (req, res) => {
  try {
    const { code, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${frontendUrl}/?auth_error=No+authorization+code+received`);
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const oauth2Client = getOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let payload = null;
    if (tokens.id_token) {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      payload = await userInfoRes.json();
    }

    const googleId = payload.sub || payload.id;
    const email = (payload.email || '').toLowerCase();
    const name = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture || '';

    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      user.googleId = googleId;
      user.name = name || user.name;
      user.avatar = avatar || user.avatar;
      user.lastLogin = new Date();
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        name,
        avatar,
      });
    }

    await syncUserProfile(user);
    const token = generateToken(user);

    const userParam = encodeURIComponent(JSON.stringify({
      _id: user._id,
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    }));

    return res.redirect(`${frontendUrl}/auth/callback?token=${token}&user=${userParam}`);
  } catch (error) {
    console.error('Google callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error.message)}`);
  }
};

// Get current authenticated user
export const getMe = async (req, res) => {
  try {
    const user = req.user;
    const profile = await Profile.findOne({ user: user._id });
    res.json({
      user: {
        _id: user._id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
      profile,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving current user', error: error.message });
  }
};
