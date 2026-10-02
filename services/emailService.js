import nodemailer from 'nodemailer';
import { Resend } from 'resend';

/**
 * Creates and returns a nodemailer transporter based on environment variables.
 * Configured with strict timeouts so cloud platforms (e.g. Render) don't hang if SMTP ports are blocked.
 */
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || (host.includes('gmail') ? 465 : 587);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  const cleanPass = pass.replace(/\s+/g, '');
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user: user.trim(),
      pass: cleanPass,
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Sends a 6-digit OTP for password reset to the user's email.
 * 1. If RESEND_API_KEY is configured, sends via Resend REST API (HTTPS port 443, never blocked by Render/AWS).
 * 2. If SMTP is configured, sends via Nodemailer with strict timeouts.
 * 3. If SMTP ports are blocked by cloud firewalls or unconfigured, safely returns simulation fallback.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - Name of the user
 * @returns {Promise<{ delivered: boolean, message: string, reason?: string, error?: string }>}
 */
export const sendPasswordResetEmail = async (toEmail, otp, userName = 'Valued User') => {
  const emailUser = process.env.EMAIL_USER;
  const emailFrom = (process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes('no-reply@myexpmanager.com'))
    ? process.env.EMAIL_FROM
    : `"MyExpManager Security" <${emailUser || 'no-reply@myexpmanager.com'}>`;

  const textContent = `Hello ${userName},\n\n` +
    `You requested a password reset for your MyExpManager account.\n` +
    `Your 6-digit verification code is: ${otp}\n\n` +
    `This code will expire in 10 minutes.\n` +
    `If you did not request this password reset, please ignore this email or secure your account.\n\n` +
    `Best regards,\nThe MyExpManager Security Team`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }
        .container { max-width: 480px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .logo { font-size: 20px; font-weight: 800; color: #6366f1; margin-bottom: 24px; }
        h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
        p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px; }
        .otp-box { background: #1e1e38; border: 1px dashed #6366f1; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #818cf8; font-family: monospace; }
        .expiry-note { font-size: 12px; color: #e2e8f0; margin-top: 8px; }
        .footer { font-size: 11px; color: #64748b; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ MyExpManager</div>
        <h1>Password Reset Verification</h1>
        <p>Hello <strong>${userName}</strong>,</p>
        <p>We received a request to reset the password for your account associated with <strong>${toEmail}</strong>.</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div class="expiry-note">⏱ Code expires in <strong>10 minutes</strong></div>
        </div>
        <p>Enter this 6-digit code on the verification screen to proceed with setting a new password.</p>
        <p>If you did not request this code, you can safely ignore this email. Your account remains secure.</p>
        <div class="footer">
          © ${new Date().getFullYear()} MyExpManager. Bank-grade financial workspace & AI intelligence.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always log clearly to console for visibility
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📬 [EMAIL SERVICE] Password Reset OTP for: ${toEmail}`);
  console.log(`🔑 Verification Code: [ ${otp} ] (Valid for 10 minutes)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Try Resend Official SDK if configured (Bypasses Render/cloud SMTP port blocks via HTTPS port 443)
  const resendApiKey = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.trim() : null;
  if (resendApiKey) {
    try {
      console.log('🚀 [EMAIL SERVICE] Attempting email dispatch via Resend HTTPS API...');
      const resend = new Resend(resendApiKey);
      const resendSender = process.env.RESEND_FROM || 'MyExpManager <onboarding@resend.dev>';

      const { data, error } = await resend.emails.send({
        from: resendSender,
        to: [toEmail],
        subject: `Your MyExpManager Password Reset Code: ${otp}`,
        text: textContent,
        html: htmlContent,
      });

      if (!error && data?.id) {
        console.log(`✅ [EMAIL SERVICE] Successfully delivered via Resend API: ${data.id}`);
        return {
          delivered: true,
          messageId: data.id,
          message: 'Email successfully dispatched via Resend.',
        };
      } else if (error) {
        console.warn('⚠️ [EMAIL SERVICE] Resend API returned error:', error.message || error);
      }
    } catch (resendErr) {
      console.error('⚠️ [EMAIL SERVICE] Resend HTTP call failed:', resendErr.message);
    }
  }

  // 2. Try SMTP Transporter (Nodemailer) with strict timeout guard
  const transporter = createTransporter();
  if (!transporter) {
    console.log('ℹ️ [EMAIL SERVICE] SMTP credentials not set (EMAIL_USER / EMAIL_PASSWORD). Falling back to simulated OTP.');
    return {
      delivered: false,
      isSimulated: true,
      message: 'OTP generated and logged to server console (SMTP unconfigured).',
    };
  }

  try {
    // 5-second timeout guard against cloud firewall silent drops on ports 25/465/587
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP connection timed out after 5000ms. Outbound SMTP ports (25, 465, 587) are blocked by cloud firewall (e.g., Render Web Services).')), 5000)
    );

    const sendPromise = transporter.sendMail({
      from: emailFrom,
      to: toEmail,
      subject: `Your MyExpManager Password Reset Code: ${otp}`,
      text: textContent,
      html: htmlContent,
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    console.log(`✅ [EMAIL SERVICE] Email successfully dispatched via SMTP: ${info.messageId}`);
    return {
      delivered: true,
      messageId: info.messageId,
      message: 'Email successfully dispatched.',
    };
  } catch (error) {
    console.error('⚠️ [EMAIL SERVICE] Failed to deliver email via SMTP:', error.message);
    console.info('💡 TIP: Render blocks outbound SMTP ports (25, 465, 587). Add RESEND_API_KEY in Render Dashboard -> Environment for instant live email delivery over HTTPS.');

    return {
      delivered: false,
      isSimulated: true,
      error: error.message,
      reason: 'Cloud firewall blocked SMTP ports (25, 465, 587)',
      message: 'SMTP delivery failed; OTP was logged to server console.',
    };
  }
};
