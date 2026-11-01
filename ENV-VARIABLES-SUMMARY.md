# Environment Variables Summary

## 📋 Complete List of Required Variables

### ✅ Correct Variable Names (Used by Email Service)

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `EMAIL_ENABLED` | Enable/disable email system | `true` |
| `EMAIL_SERVICE` | Email service provider | `gmail` |
| `EMAIL_HOST` | SMTP server host | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP server port | `587` |
| `EMAIL_SECURE` | Use TLS | `false` (use STARTTLS) |
| `EMAIL_USER` | Gmail account for sending | `scchwabinvestments@gmail.com` |
| `EMAIL_PASS` | Gmail app password | `gekopsphfoirfqhi` (16 chars, no spaces) |
| `EMAIL_FROM` | Sender email address | `scchwabinvestments@gmail.com` |
| `EMAIL_FROM_NAME` | Sender display name | `Charles Schwab Trading Platform` |
| `ADMIN_EMAIL` | Admin notification recipient | `scchwabinvestments@gmail.com` |

### ❌ Incorrect Variable Names (Not Used)

These variables in your old `.env` are **NOT** used by the email service:
- ~~`GMAIL_USER`~~ → Use `EMAIL_USER` instead
- ~~`GMAIL_APP_PASSWORD`~~ → Use `EMAIL_PASS` instead

---

## 🔧 How Email Service Reads Variables

From `src/services/emailService.js`:

```javascript
// Line 19-21: Email configuration
this.fromEmail  = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@schwab-trading.com';
this.fromName   = process.env.EMAIL_FROM_NAME || 'Charles Schwab Trading Platform';
this.adminEmail = process.env.ADMIN_EMAIL || 'admin@schwab-trading.com';

// Line 29: Enable/disable emails
if (process.env.EMAIL_ENABLED !== 'true') {
  console.log('[EmailService] Email notifications disabled');
  return;
}

// Line 34-35: SMTP authentication
const emailUser = process.env.EMAIL_USER;  // ← Must be EMAIL_USER
const emailPass = process.env.EMAIL_PASS;  // ← Must be EMAIL_PASS

// Line 44-47: SMTP configuration
service: process.env.EMAIL_SERVICE || 'gmail',
host: process.env.EMAIL_HOST || 'smtp.gmail.com',
port: parseInt(process.env.EMAIL_PORT || '587'),
secure: process.env.EMAIL_SECURE === 'true',
```

---

## 📧 Support Feature Email Flow

When a user submits a support request:

1. **User fills form** → Name, email, subject, priority, message
2. **Frontend sends** → POST to `/api/support`
3. **Backend processes**:
   - Creates ticket reference (e.g., `SUP-1730000000-123`)
   - Saves to `support_messages` table
   - Sends email to `ADMIN_EMAIL` using credentials from `EMAIL_USER` and `EMAIL_PASS`
   - Creates admin notification
   - Creates user confirmation notification
4. **Admin receives email** at the address specified in `ADMIN_EMAIL`

---

## 🚀 Railway Setup Instructions

1. **Go to Railway Dashboard** → Your project → Variables tab

2. **Add/Update these email variables**:
   ```
   EMAIL_ENABLED=true
   EMAIL_SERVICE=gmail
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=scchwabinvestments@gmail.com
   EMAIL_PASS=gekopsphfoirfqhi
   EMAIL_FROM=scchwabinvestments@gmail.com
   EMAIL_FROM_NAME=Charles Schwab Trading Platform
   ADMIN_EMAIL=scchwabinvestments@gmail.com
   ```

3. **Remove/Delete old variables** (if they exist):
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`

4. **Deploy** → Railway will restart with new variables

5. **Verify** → Check logs for:
   ```
   [EmailService] SMTP initialized successfully
   ```

---

## 🔍 Testing Email Setup

### Test 1: Check Initialization
```bash
# In Railway logs, you should see:
[EmailService] SMTP initialized successfully
```

### Test 2: Send Support Request
1. Go to https://charlesschwabsoq.vercel.app
2. Click support button (bottom-right)
3. Fill form and submit
4. Check `scchwabinvestments@gmail.com` inbox

### Test 3: Verify Database
```sql
SELECT * FROM support_messages ORDER BY created_at DESC LIMIT 1;
SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 1;
```

---

## ⚠️ Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| No SMTP initialization message | `EMAIL_ENABLED` not set to `true` | Set `EMAIL_ENABLED=true` |
| "EMAIL_USER or EMAIL_PASS not set" | Wrong variable names | Use `EMAIL_USER` and `EMAIL_PASS` (not GMAIL_*) |
| "SMTP verification failed" | Wrong app password | Regenerate Gmail app password |
| "Invalid credentials" | Using regular password | Must use 16-char app password |
| No email received | Wrong `ADMIN_EMAIL` | Verify admin email address |
| Email sent but not received | Gmail spam folder | Check spam/promotions folders |

---

## 📝 Quick Reference

**Current Production Values** (from `.env.production`):
- Email Account: `scchwabinvestments@gmail.com`
- App Password: `gekopsphfoirfqhi` (16 characters, no spaces)
- Admin Notifications: `scchwabinvestments@gmail.com`

**Remember:**
- ✅ Always use `EMAIL_USER` and `EMAIL_PASS`
- ✅ Never use regular Gmail password
- ✅ App password has no spaces
- ✅ Set `EMAIL_ENABLED=true`
- ✅ ADMIN_EMAIL receives support tickets
