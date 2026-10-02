import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Transaction from '../models/Transaction.js';
import Borrow from '../models/Borrow.js';
import Lend from '../models/Lend.js';
import SavingsGoal from '../models/SavingsGoal.js';
import Notification from '../models/Notification.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

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
      if (!user.authProvider) user.authProvider = 'google';
      user.lastLogin = new Date();
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        name,
        avatar,
        authProvider: 'google',
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
        authProvider: user.authProvider || 'google',
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
      if (!user.authProvider) user.authProvider = 'google';
      user.lastLogin = new Date();
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        name,
        avatar,
        authProvider: 'google',
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
      authProvider: user.authProvider || 'google',
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
        authProvider: user.authProvider || (user.googleId ? 'google' : 'local'),
      },
      profile,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving current user', error: error.message });
  }
};

// 1. Sign Up with Name, Email, Password
export const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Standard email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (existingUser.password) {
        return res.status(400).json({ message: 'An account with this email already exists. Please log in.' });
      } else if (existingUser.googleId) {
        return res.status(400).json({ message: 'This account was registered via Google Sign-In. Please sign in with Google.' });
      }
    }

    // Hash password securely with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: 'local',
      createdAt: new Date(),
      lastLogin: new Date(),
    });

    const profile = await syncUserProfile(user);
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authProvider: 'local',
      },
      profile,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Failed to create account', error: error.message });
  }
};

// 2. Login with Email & Password
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if this account was registered only via Google
    if (!user.password && user.googleId) {
      return res.status(400).json({
        message: 'This account uses Google Sign-In. Please continue with Google.',
        isGoogleAccount: true,
      });
    }

    if (!user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    const profile = await syncUserProfile(user);
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authProvider: user.authProvider || (user.googleId ? 'google' : 'local'),
      },
      profile,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// 3. Forgot Password - Request 6-digit OTP
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: 'No registered account found with this email address' });
    }

    // Check if account is Google-only
    if (!user.password && user.googleId) {
      return res.status(400).json({
        message: 'This account uses Google Sign-In. Please continue with Google.',
        isGoogleAccount: true,
      });
    }

    // Resend cooldown check (60s)
    if (user.resetOtpCooldownUntil && user.resetOtpCooldownUntil > new Date()) {
      const remainingSeconds = Math.ceil((user.resetOtpCooldownUntil.getTime() - Date.now()) / 1000);
      return res.status(429).json({
        message: `Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
        retryAfter: remainingSeconds,
      });
    }

    // Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    user.resetOtpHash = otpHash;
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    user.resetOtpAttempts = 0;
    user.resetOtpCooldownUntil = new Date(Date.now() + 60 * 1000); // 60s resend cooldown
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    await user.save();

    // Dispatch email
    const emailRes = await sendPasswordResetEmail(user.email, otp, user.name);

    res.json({
      success: true,
      delivered: emailRes.delivered,
      message: emailRes.delivered
        ? 'A 6-digit verification code has been sent to your email.'
        : (emailRes.reason
            ? `Cloud firewall blocked SMTP. Temporary code: ${otp}`
            : `Email service unconfigured. Temporary code: ${otp}`),
      cooldownSeconds: 60,
      ...(!emailRes.delivered ? { devOtp: otp } : {}),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process password reset request', error: error.message });
  }
};

// 4. Verify 6-digit OTP
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and 6-digit OTP code are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanedOtp = otp.toString().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.resetOtpHash || !user.resetOtpExpires) {
      return res.status(400).json({ message: 'No active OTP verification found. Please request a new code.' });
    }

    if (new Date() > user.resetOtpExpires) {
      user.resetOtpHash = null;
      user.resetOtpExpires = null;
      await user.save();
      return res.status(400).json({ message: 'The verification OTP has expired. Please request a new code.' });
    }

    if ((user.resetOtpAttempts || 0) >= 5) {
      user.resetOtpHash = null;
      user.resetOtpExpires = null;
      user.resetOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: 'Too many incorrect attempts. This OTP has been invalidated. Please request a new code.' });
    }

    const candidateHash = crypto.createHash('sha256').update(cleanedOtp).digest('hex');
    if (candidateHash !== user.resetOtpHash) {
      user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
      await user.save();
      const remaining = 5 - user.resetOtpAttempts;
      return res.status(400).json({
        message: remaining > 0 ? `Invalid OTP code. ${remaining} attempt(s) remaining.` : 'Too many incorrect attempts. OTP has been invalidated.',
        attemptsRemaining: Math.max(0, remaining),
      });
    }

    // OTP is valid - invalidate OTP to prevent reuse
    user.resetOtpHash = null;
    user.resetOtpExpires = null;
    user.resetOtpAttempts = 0;

    // Issue single-use short-lived reset authorization token (15 mins)
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    user.resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken: rawResetToken,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Failed to verify OTP', error: error.message });
  }
};

// 5. Reset Password with valid reset authorization token
export const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, password, confirmPassword } = req.body;

    if (!email || !resetToken || !password) {
      return res.status(400).json({ message: 'Email, reset token, and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.resetTokenHash || !user.resetTokenExpires) {
      return res.status(400).json({ message: 'Reset authorization is missing or expired. Please verify your OTP again.' });
    }

    if (new Date() > user.resetTokenExpires) {
      user.resetTokenHash = null;
      user.resetTokenExpires = null;
      await user.save();
      return res.status(400).json({ message: 'Password reset authorization has expired. Please restart the process.' });
    }

    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    if (tokenHash !== user.resetTokenHash) {
      return res.status(400).json({ message: 'Invalid or expired password reset authorization.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Invalidate reset token
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    if (!user.authProvider) user.authProvider = 'local';
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};
