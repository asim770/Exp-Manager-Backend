import nodemailer from 'nodemailer';

/**
 * Creates and returns a nodemailer transporter based on environment variables.
 * Falls back safely to console logging if credentials are missing.
 */
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  // If Gmail, use nodemailer's dedicated Gmail preset and clean any spaces in the app password
  const cleanPass = pass.replace(/\s+/g, '');
  if (host.includes('gmail') || user.toLowerCase().endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass: cleanPass,
      },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: cleanPass,
    },
  });
};

/**
 * Sends a 6-digit OTP for password reset to the user's email.
 * If SMTP credentials are not configured or email delivery fails,
 * it logs the OTP in the server console for local testing.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - Name of the user
 * @returns {Promise<{ delivered: boolean, message: string }>}
 */
export const sendPasswordResetEmail = async (toEmail, otp, userName = 'Valued User') => {
  const emailUser = process.env.EMAIL_USER;
  const emailFrom = (process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes('no-reply@myexpmanager.com'))
    ? process.env.EMAIL_FROM
    : `"MyExpManager Security" <${emailUser || 'no-reply@myexpmanager.com'}>`;
  const transporter = createTransporter();

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

  // Always log clearly to console for development / testing visibility
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📬 [EMAIL SERVICE] Password Reset OTP for: ${toEmail}`);
  console.log(`🔑 Verification Code: [ ${otp} ] (Valid for 10 minutes)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!transporter) {
    console.log('ℹ️ [EMAIL SERVICE] SMTP credentials not set (EMAIL_USER / EMAIL_PASSWORD). Falling back to console-delivered OTP for local testing.');
    return {
      delivered: false,
      isSimulated: true,
      message: 'OTP generated and logged to development console.',
    };
  }

  try {
    const info = await transporter.sendMail({
      from: emailFrom,
      to: toEmail,
      subject: `Your MyExpManager Password Reset Code: ${otp}`,
      text: textContent,
      html: htmlContent,
    });

    console.log(`✅ [EMAIL SERVICE] Email successfully dispatched: ${info.messageId}`);
    return {
      delivered: true,
      messageId: info.messageId,
      message: 'Email successfully dispatched.',
    };
  } catch (error) {
    console.error('⚠️ [EMAIL SERVICE] Failed to deliver email via SMTP:', error.message);
    // Even if SMTP fails, return gracefully with simulated fallback so user/tester can proceed
    return {
      delivered: false,
      isSimulated: true,
      error: error.message,
      message: 'SMTP delivery failed; OTP was logged to server console.',
    };
  }
};
