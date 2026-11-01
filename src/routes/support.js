const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const pool = require('../db/pool');

const router = express.Router();

// Subject options
const SUBJECT_OPTIONS = [
  'Account Issue',
  'Deposit / Withdrawal',
  'Trading Problem',
  'KYC Verification',
  'Technical Issue',
  'Billing',
  'Other'
];

// POST /support - Support request (works for both authenticated and guest users)
router.post(
  '/',
  // Optional authentication - works for both logged-in and guest users
  (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      // Try to authenticate if token is provided
      const { authenticate } = require('../middleware/auth');
      return authenticate(req, res, (err) => {
        if (err) {
          // Token is invalid, treat as guest
          req.user = null;
        }
        next();
      });
    } else {
      // No token, treat as guest
      req.user = null;
      next();
    }
  },
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be 1-100 characters'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Valid email required for guest users'),
    body('subject')
      .trim()
      .notEmpty()
      .withMessage('Subject required')
      .isIn(SUBJECT_OPTIONS)
      .withMessage('Invalid subject category'),
    body('message')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Message must be 10-2000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Invalid priority level'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { subject, message, priority = 'medium', name, email } = req.body;
      
      let user;
      let userId = null;

      if (req.user) {
        // Authenticated user
        userId = req.user.id;
        const [[dbUser]] = await pool.query(
          'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
          [userId]
        );
        if (!dbUser) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        user = {
          id: dbUser.id,
          fullName: `${dbUser.first_name} ${dbUser.last_name}`,
          email: dbUser.email,
          isVerified: dbUser.is_verified
        };
      } else {
        // Guest user - require name and email
        if (!name || !email) {
          return res.status(400).json({ 
            success: false, 
            message: 'Name and email are required for guest users' 
          });
        }
        user = {
          id: 0, // Guest user
          fullName: name,
          email: email,
          isVerified: false
        };
      }

      // Generate ticket reference
      const timestamp = Date.now();
      const ticketRef = `SUP-${timestamp}-${userId || 'GUEST'}`;

      // Optional: Save to database (if support_messages table exists)
      try {
        await pool.query(
          `INSERT INTO support_messages (user_id, ticket_ref, subject, message, priority, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [userId, ticketRef, subject, message, priority]
        );
      } catch (dbErr) {
        // Non-fatal — if the table doesn't exist, just skip DB storage
        console.warn('[Support] Could not save to database:', dbErr.message);
      }

      // Send branded email to admin
      await emailService.sendSupportRequestEmail({
        ticketRef,
        subject,
        message,
        priority,
        user
      });

      // Create admin notification (only if user is authenticated)
      if (userId) {
        await notificationService.createAdminNotification({
          title: 'New Support Request',
          message: `${user.fullName} submitted a support request: ${subject}`,
          type: 'support_request',
          priority,
          relatedId: ticketRef,
          relatedType: 'support_ticket',
          userId,
          metadata: { ticketRef, subject, message }
        });

        // Create user confirmation notification
        await notificationService.createUserNotification({
          userId,
          title: 'Support Request Received',
          message: `Your support request has been submitted. Reference: ${ticketRef}`,
          type: 'system',
          category: 'system_alerts',
          priority: 'medium',
          relatedId: ticketRef,
          relatedType: 'support_ticket',
          metadata: { ticketRef, subject }
        });
      }

      res.json({
        success: true,
        message: 'Support request submitted successfully',
        ticketRef
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
