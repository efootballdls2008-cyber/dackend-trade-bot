const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
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

// ══════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS - Support Ticket Management
// ══════════════════════════════════════════════════════════════

// GET /support/admin - Get all support tickets (admin only)
router.get(
  '/admin',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { status, priority, search } = req.query;
      
      let query = `
        SELECT 
          sm.*,
          u.email as user_email,
          u.first_name,
          u.last_name,
          resolver.email as resolved_by_email,
          resolver.first_name as resolver_first_name,
          resolver.last_name as resolver_last_name
        FROM support_messages sm
        LEFT JOIN users u ON sm.user_id = u.id
        LEFT JOIN users resolver ON sm.resolved_by = resolver.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND sm.status = ?';
        params.push(status);
      }

      if (priority) {
        query += ' AND sm.priority = ?';
        params.push(priority);
      }

      if (search) {
        query += ' AND (sm.ticket_ref LIKE ? OR sm.subject LIKE ? OR sm.message LIKE ? OR u.email LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      query += ' ORDER BY sm.created_at DESC';

      const [tickets] = await pool.query(query, params);

      res.json({
        success: true,
        tickets: tickets.map(ticket => ({
          ...ticket,
          userFullName: ticket.user_id 
            ? `${ticket.first_name} ${ticket.last_name}`
            : 'Guest User',
          resolvedByName: ticket.resolved_by
            ? `${ticket.resolver_first_name} ${ticket.resolver_last_name}`
            : null
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /support/admin/:id - Get single support ticket details (admin only)
router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  [param('id').isInt().withMessage('Invalid ticket ID')],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const [[ticket]] = await pool.query(
        `SELECT 
          sm.*,
          u.email as user_email,
          u.first_name,
          u.last_name,
          u.phone,
          resolver.email as resolved_by_email,
          resolver.first_name as resolver_first_name,
          resolver.last_name as resolver_last_name
        FROM support_messages sm
        LEFT JOIN users u ON sm.user_id = u.id
        LEFT JOIN users resolver ON sm.resolved_by = resolver.id
        WHERE sm.id = ?`,
        [id]
      );

      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Support ticket not found' });
      }

      res.json({
        success: true,
        ticket: {
          ...ticket,
          userFullName: ticket.user_id 
            ? `${ticket.first_name} ${ticket.last_name}`
            : 'Guest User',
          resolvedByName: ticket.resolved_by
            ? `${ticket.resolver_first_name} ${ticket.resolver_last_name}`
            : null
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /support/admin/:id/status - Update ticket status (admin only)
router.patch(
  '/admin/:id/status',
  authenticate,
  requireAdmin,
  [
    param('id').isInt().withMessage('Invalid ticket ID'),
    body('status')
      .isIn(['pending', 'in_progress', 'resolved', 'closed'])
      .withMessage('Invalid status'),
    body('adminNotes').optional().trim(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const adminId = req.user.id;

      // Check if ticket exists
      const [[ticket]] = await pool.query('SELECT * FROM support_messages WHERE id = ?', [id]);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Support ticket not found' });
      }

      // Update ticket
      const updateFields = ['status = ?'];
      const updateParams = [status];

      if (adminNotes) {
        updateFields.push('admin_notes = ?');
        updateParams.push(adminNotes);
      }

      if (status === 'resolved' || status === 'closed') {
        updateFields.push('resolved_at = NOW()', 'resolved_by = ?');
        updateParams.push(adminId);
      }

      updateParams.push(id);

      await pool.query(
        `UPDATE support_messages SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateParams
      );

      // Notify user if they're registered
      if (ticket.user_id) {
        await notificationService.createUserNotification({
          userId: ticket.user_id,
          title: 'Support Ticket Updated',
          message: `Your support ticket ${ticket.ticket_ref} status has been updated to: ${status}`,
          type: 'system',
          category: 'system_alerts',
          priority: 'medium',
          relatedId: ticket.ticket_ref,
          relatedType: 'support_ticket',
          metadata: { ticketRef: ticket.ticket_ref, status, adminNotes }
        });
      }

      res.json({
        success: true,
        message: 'Support ticket updated successfully'
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /support/admin/:id - Update ticket details (admin only)
router.patch(
  '/admin/:id',
  authenticate,
  requireAdmin,
  [
    param('id').isInt().withMessage('Invalid ticket ID'),
    body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
    body('adminNotes').optional().trim(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { priority, adminNotes } = req.body;

      // Check if ticket exists
      const [[ticket]] = await pool.query('SELECT * FROM support_messages WHERE id = ?', [id]);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Support ticket not found' });
      }

      const updateFields = [];
      const updateParams = [];

      if (priority) {
        updateFields.push('priority = ?');
        updateParams.push(priority);
      }

      if (adminNotes !== undefined) {
        updateFields.push('admin_notes = ?');
        updateParams.push(adminNotes);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      updateParams.push(id);

      await pool.query(
        `UPDATE support_messages SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateParams
      );

      res.json({
        success: true,
        message: 'Support ticket updated successfully'
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /support/admin/:id - Delete support ticket (admin only)
router.delete(
  '/admin/:id',
  authenticate,
  requireAdmin,
  [param('id').isInt().withMessage('Invalid ticket ID')],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const [[ticket]] = await pool.query('SELECT * FROM support_messages WHERE id = ?', [id]);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Support ticket not found' });
      }

      await pool.query('DELETE FROM support_messages WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Support ticket deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /support/admin/stats - Get support statistics (admin only)
router.get(
  '/admin/stats/overview',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const [[stats]] = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN priority = 'high' AND status IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as urgent
        FROM support_messages
      `);

      res.json({
        success: true,
        stats
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
