const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const createAdminNotification = require('../utils/createAdminNotification');
const createUserNotification = require('../utils/createUserNotification');
const emailService = require('../services/emailService');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────
// Accepts the 3-step registration payload:
//   Step 1 — Personal Info: username, firstName, lastName, email, phone
//   Step 2 — Location:      country
//   Step 3 — Security:      password, confirmPassword (CAPTCHA verified client-side)
router.post(
  '/register',
  [
    // Personal Info
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Username can only contain letters, numbers, dots, dashes, and underscores'),
    body('firstName')
      .trim()
      .notEmpty().withMessage('First name is required')
      .isLength({ max: 100 }).withMessage('First name too long'),
    body('lastName')
      .trim()
      .notEmpty().withMessage('Last name is required')
      .isLength({ max: 100 }).withMessage('Last name too long'),
    body('email')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),
    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Enter a valid phone number'),
    // Location
    body('country')
      .trim()
      .notEmpty().withMessage('Country is required')
      .isLength({ max: 100 }).withMessage('Country name too long'),
    body('currency')
      .optional()
      .trim()
      .isLength({ max: 10 }).withMessage('Currency code too long'),
    // Security
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
      .matches(/[\d\W]/).withMessage('Password must contain a number or special character'),
    body('confirmPassword')
      .notEmpty().withMessage('Please confirm your password')
      .custom((value, { req }) => {
        if (value !== req.body.password) throw new Error('Passwords do not match');
        return true;
      }),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Check registration enabled
      const [[settings]] = await pool.query(
        'SELECT registration_enabled FROM platform_settings LIMIT 1'
      );
      if (settings && !settings.registration_enabled) {
        return res.status(403).json({
          success: false,
          message: 'Registration is currently disabled. Please try again later.',
        });
      }

      const { username, firstName, lastName, email, phone, country, currency, password } = req.body;

      // Check email uniqueness
      const [[existingEmail]] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          field: 'email',
          message: 'An account with this email already exists.',
        });
      }

      // Check username uniqueness (only if username is provided)
      if (username && username.trim()) {
        const [[existingUsername]] = await pool.query(
          'SELECT id FROM users WHERE username = ?',
          [username]
        );
        if (existingUsername) {
          return res.status(409).json({
            success: false,
            field: 'username',
            message: 'This username is already taken.',
          });
        }
      }

      const hashed = await bcrypt.hash(password, 12);
      const memberSince = new Date().toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const [result] = await pool.query(
        `INSERT INTO users
           (email, password, first_name, last_name, phone, country, currency,
            role, account_status, member_since)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Member', 'active', ?)`,
        [email, hashed, firstName, lastName, phone, country, currency || 'USD', memberSince]
      );

      const userId = result.insertId;

      // ── Apply starting balance & welcome bonus ───────────────
      const [[ps]] = await pool.query(
        `SELECT default_starting_balance, welcome_bonus_amount, welcome_bonus_enabled
         FROM platform_settings LIMIT 1`
      );
      if (ps) {
        const starting = parseFloat(ps.default_starting_balance) || 0;
        const bonus    = ps.welcome_bonus_enabled ? (parseFloat(ps.welcome_bonus_amount) || 0) : 0;
        const total    = starting + bonus;

        if (total > 0) {
          await pool.query(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [total, userId]
          );
        }

        if (starting > 0) {
          createUserNotification({
            userId,
            title: 'Starting Balance Credited',
            message: `Your account has been funded with a starting balance of $${starting.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Start trading today!`,
            type: 'system',
          }).catch(err => console.error('[Notification Error]', err));
        }

        if (bonus > 0) {
          createUserNotification({
            userId,
            title: 'Welcome Bonus Received',
            message: `Congratulations! A welcome bonus of $${bonus.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been added to your account.`,
            type: 'system',
          }).catch(err => console.error('[Notification Error]', err));
        }
      }

      // Create default bot settings
      await pool.query('INSERT INTO bot_settings (user_id) VALUES (?)', [userId]);

      // Welcome notification
      createUserNotification({
        userId,
        title: 'Welcome to Charles Schwab Trading Platform! 🎉',
        message: `Hi ${firstName}! Welcome aboard. We're excited to have you join our trading community. Explore our platform features, check out the market overview, and start your trading journey today. If you need any help, our support team is here for you 24/7.`,
        type: 'system',
      }).catch(err => console.error('[Notification Error]', err));

      // Send welcome email (fire-and-forget)
      emailService.sendWelcomeEmail(userId, email, firstName)
        .catch(emailErr => console.error('[Email Error] sendWelcomeEmail:', emailErr));

      // Admin notification
      createAdminNotification({
        title: 'New User Registered',
        message: `${firstName} ${lastName} (${email}) from ${country} just created an account.`,
        type: 'user_registration',
        relatedId: userId,
        relatedType: 'user',
      }).catch(err => console.error('[Notification Error]', err));

      emailService.sendAdminNotification(
        'New User Registered',
        `${firstName} ${lastName} (${email}) — ${country} just created an account.`,
        'user',
        userId
      ).catch(emailErr => console.error('[Email Error] sendAdminNotification:', emailErr));

      const token = jwt.sign(
        { id: userId, email, role: 'Member' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return res.status(201).json({ success: true, token, userId });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/login ─────────────────────────────────────────
// Per-account brute-force constants
const LOGIN_MAX_ATTEMPTS  = parseInt(process.env.LOGIN_MAX_ATTEMPTS)  || 10;
const LOGIN_LOCKOUT_MINS  = parseInt(process.env.LOGIN_LOCKOUT_MINS)  || 15;

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // SELECT * so the query doesn't fail if the brute-force columns
      // (failed_login_attempts, locked_until) haven't been migrated yet.
      const [[user]] = await pool.query(
        `SELECT * FROM users WHERE email = ?`,
        [email]
      );

      if (!user) {
        // Respond with the same message to avoid user enumeration
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.account_status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Account suspended. Contact support.',
        });
      }

      // Per-account lockout check (gracefully skipped if columns not yet migrated)
      try {
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          const remaining = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
          return res.status(429).json({
            success: false,
            message: `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`,
          });
        }
      } catch { /* columns not yet migrated — skip lockout check */ }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        // Increment failed attempt counter; lock account after threshold.
        // Wrapped in try/catch — if the columns don't exist yet, just return 401.
        try {
          const attempts = (user.failed_login_attempts || 0) + 1;
          if (attempts >= LOGIN_MAX_ATTEMPTS) {
            const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINS * 60 * 1000);
            await pool.query(
              'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
              [attempts, lockedUntil, user.id]
            );
            return res.status(429).json({
              success: false,
              message: `Too many failed attempts. Account locked for ${LOGIN_LOCKOUT_MINS} minutes.`,
            });
          }
          await pool.query(
            'UPDATE users SET failed_login_attempts = ? WHERE id = ?',
            [attempts, user.id]
          );
        } catch { /* columns not yet migrated — skip counter update */ }
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Successful login — reset lockout counters (best-effort)
      pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
        [user.id]
      ).catch(() => { /* columns not yet migrated — safe to ignore */ });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Welcome-back notification: throttled to once per day
      const today = new Date().toISOString().slice(0, 10);
      const [[recentWelcome]] = await pool.query(
        `SELECT id FROM user_notifications
         WHERE user_id = ? AND type = 'system' AND title = 'Welcome Back! 👋'
           AND DATE(created_at) = ?
         LIMIT 1`,
        [user.id, today]
      );
      if (!recentWelcome) {
        createUserNotification({
          userId: user.id,
          title: 'Welcome Back! 👋',
          message: `Hi ${user.first_name}! You've successfully logged in. Check out the latest market trends and manage your portfolio.`,
          type: 'system',
        }).catch(err => console.error('[Notification Error]', err));
      }

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /auth/me ─────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar, balance, currency,
              phone, date_of_birth, country, address, member_since, account_status
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ────────────────────────────────────────
router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT id, email, role, account_status FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.account_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/forgot-password ──────────────────────────────
// Public endpoint - User requests password reset via email
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const [[user]] = await pool.query(
        'SELECT id, email, first_name FROM users WHERE email = ?',
        [email]
      );

      // Always return success (security: don't reveal if email exists)
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      }

      // Generate reset token (random 32-char hex string)
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      await pool.query(
        'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [resetToken, resetTokenExpires, user.id]
      );

      // Send reset email
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      const emailHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0d0824 0%, #1a0f3e 100%); padding: 40px 30px; text-align: center; border-bottom: 3px solid #a28539;">
      <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, #a28539, #c9a84c); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(162,133,57,0.3);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0d0824" stroke-width="2.5">
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </div>
      <h1 style="color: #a28539; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">
        CHARLES SCHWAB
      </h1>
      <p style="color: #cbd5e1; margin-top: 8px; font-size: 14px; letter-spacing: 0.5px;">
        Smart Trading • Crypto • Stocks • Automated Strategies
      </p>
    </div>

    <!-- Body -->
    <div style="background: #ffffff; padding: 40px 35px; color: #1e293b;">
      <h2 style="color: #0d0824; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">
        🔐 Password Reset Request
      </h2>
      
      <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #334155;">
        Hi <strong style="color: #0d0824;">${user.first_name}</strong>,
      </p>
      
      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.7; color: #475569;">
        We received a request to reset your password for your Charles Schwab Trading account. 
        Click the button below to create a new password and regain access to your account.
      </p>

      <!-- Info Box -->
      <div style="background: linear-gradient(135deg, rgba(162,133,57,0.1) 0%, rgba(201,168,76,0.05) 100%); border-left: 4px solid #a28539; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 32px;">
        <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <strong style="color: #a28539; display: block; margin-bottom: 6px;">⏰ Security Notice</strong>
          This password reset link will expire in <strong>1 hour</strong> for your security.
          If you didn't request this reset, please ignore this email and your password will remain unchanged.
        </p>
      </div>

      <!-- Reset Button -->
      <div style="text-align: center; margin: 36px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #a28539 0%, #c9a84c 100%); color: #0d0824; padding: 16px 48px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 16px rgba(162,133,57,0.3); transition: all 0.3s ease;">
          Reset My Password
        </a>
      </div>

      <!-- Alternative Link -->
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-top: 32px; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; font-weight: 600;">
          Button not working? Copy and paste this link:
        </p>
        <p style="margin: 0; font-size: 12px; color: #475569; word-break: break-all; font-family: 'Courier New', monospace; background: #ffffff; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
          ${resetLink}
        </p>
      </div>

      <!-- Security Tips -->
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #0d0824; font-weight: 600;">
          🛡️ Security Tips:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: #64748b; font-size: 13px; line-height: 1.8;">
          <li>Never share your password with anyone</li>
          <li>Use a strong, unique password for your account</li>
          <li>Enable two-factor authentication for extra security</li>
          <li>If you didn't request this, contact our support team immediately</li>
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: linear-gradient(135deg, #0d0824 0%, #1a0f3e 100%); padding: 30px; text-align: center;">
      <p style="color: #a28539; font-size: 16px; margin: 0 0 8px 0; font-weight: 700; letter-spacing: 1px;">
        CHARLES SCHWAB TRADING
      </p>
      <p style="color: #cbd5e1; font-size: 13px; margin: 0 0 16px 0;">
        Professional Trading Platform for Stocks, Crypto & Automated Strategies
      </p>
      
      <!-- Social Links -->
      <div style="margin: 20px 0;">
        <a href="${frontendUrl}" style="color: #4ade80; text-decoration: none; margin: 0 12px; font-size: 13px; font-weight: 500;">
          🌐 Website
        </a>
        <a href="${frontendUrl}/support" style="color: #4ade80; text-decoration: none; margin: 0 12px; font-size: 13px; font-weight: 500;">
          💬 Support
        </a>
        <a href="${frontendUrl}/dashboard" style="color: #4ade80; text-decoration: none; margin: 0 12px; font-size: 13px; font-weight: 500;">
          📊 Dashboard
        </a>
      </div>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="color: #64748b; font-size: 11px; margin: 0; line-height: 1.6;">
          © ${new Date().getFullYear()} Charles Schwab Trading Platform. All rights reserved.<br>
          This is an automated message, please do not reply to this email.
        </p>
      </div>
    </div>

  </div>

  <!-- Fallback for older email clients -->
  <div style="max-width: 600px; margin: 20px auto; text-align: center;">
    <p style="color: #64748b; font-size: 12px; margin: 0;">
      Having trouble viewing this email? 
      <a href="${frontendUrl}" style="color: #4ade80; text-decoration: none;">Visit our website</a>
    </p>
  </div>
</body>
</html>`;

      await emailService.sendEmail({
        to: user.email,
        subject: '🔐 Password Reset Request - Charles Schwab Trading',
        html: emailHTML,
      });

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (err) {
      console.error('[Auth] Forgot password error:', err);
      // Don't reveal errors to user
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
  }
);

// ── POST /auth/reset-password ───────────────────────────────
// Public endpoint - User resets password using token
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token required'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { token, password } = req.body;

      const [[user]] = await pool.query(
        'SELECT id, email, first_name, reset_token_expires FROM users WHERE reset_token = ?',
        [token]
      );

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token.',
        });
      }

      // Check if token expired
      if (new Date() > new Date(user.reset_token_expires)) {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired. Please request a new one.',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update password and clear reset token
      await pool.query(
        'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, user.id]
      );

      // Notify user
      await createUserNotification(
        user.id,
        'security',
        'Password Changed',
        'Your password was successfully reset.',
        '/user/settings'
      );

      res.json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/admin-reset-password ─────────────────────────
// Admin-only endpoint - Admin resets any user's password
router.post(
  '/admin-reset-password',
  authenticate,
  [
    body('userId').isInt({ min: 1 }).withMessage('Valid user ID required'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Only admins can reset passwords
      if (req.user.role !== 'Admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
      }

      const { userId, newPassword } = req.body;

      const [[targetUser]] = await pool.query(
        'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
        [userId]
      );

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and clear reset tokens
      await pool.query(
        'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, userId]
      );

      // Notify user
      await createUserNotification(
        userId,
        'security',
        'Password Reset by Admin',
        'Your password was reset by an administrator. Please change it after logging in.',
        '/user/settings'
      );

      // Notify admin
      await createAdminNotification(
        'user_update',
        'Password Reset',
        `Admin ${req.user.email} reset password for ${targetUser.first_name} ${targetUser.last_name} (${targetUser.email})`,
        `/admin/users/${userId}`
      );

      res.json({
        success: true,
        message: `Password reset for ${targetUser.first_name} ${targetUser.last_name}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /auth/admin-view-passwords ──────────────────────────
// Admin-only endpoint - Get all users (passwords are hashed for security)
router.get('/admin-view-passwords', authenticate, async (req, res, next) => {
  try {
    // Only admins
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const [users] = await pool.query(
      `SELECT id, email, first_name, last_name, created_at, account_status 
       FROM users 
       ORDER BY id DESC`
    );

    res.json({
      success: true,
      data: users,
      note: 'Passwords are securely hashed and cannot be retrieved. Use admin-reset-password to reset a user password.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
