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

// POST /support - Authenticated user support request
router.post(
  '/',
  authenticate,
  [
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
      const { subject, message, priority = 'medium' } = req.body;
      const userId = req.user.id;

      // Get user info
      const [[user]] = await pool.query(
        'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
        [userId]
      );

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Generate ticket reference
      const timestamp = Date.now();
      const ticketRef = `SUP-${timestamp}-${userId}`;

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
        user: {
          id: user.id,
          fullName: `${user.first_name} ${user.last_name}`,
          email: user.email,
          isVerified: user.is_verified
        }
      });

      // Create admin notification
      await notificationService.createAdminNotification({
        title: 'New Support Request',
        message: `${user.first_name} ${user.last_name} submitted a support request: ${subject}`,
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
