const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const emailService = require('../services/emailService');

const router = express.Router();

// POST /api/support - Send support message to admin
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('subject').trim().notEmpty().withMessage('Subject required'),
    body('message').trim().notEmpty().withMessage('Message required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, subject, message } = req.body;

      const supportEmail = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <h2 style="color:#0d0824;margin-top:0;">🆘 New Support Message</h2>
    <div style="background:#f8fafc;padding:15px;border-left:4px solid #a28539;margin:20px 0;">
      <p style="margin:0;"><strong>From:</strong> ${name}</p>
      <p style="margin:5px 0 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
    </div>
    <h3 style="color:#0d0824;">Subject:</h3>
    <p style="color:#1e293b;">${subject}</p>
    <h3 style="color:#0d0824;">Message:</h3>
    <p style="color:#1e293b;white-space:pre-wrap;">${message}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:25px 0;">
    <p style="color:#64748b;font-size:13px;margin:0;">Reply directly to this email to respond to ${name}.</p>
  </div>
</body>
</html>`;

      await emailService.sendEmail({
        to: supportEmail,
        subject: `[Support] ${subject}`,
        html,
        replyTo: email,
      });

      res.json({
        success: true,
        message: 'Support message sent successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
