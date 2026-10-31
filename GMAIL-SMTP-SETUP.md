# Gmail SMTP Setup Guide

## Overview
The backend now uses Gmail SMTP to send password reset emails and other notifications.

## Required Configuration

Your `.env.production` file needs these Gmail SMTP settings:

```env
EMAIL_ENABLED="true"
EMAIL_SERVICE="gmail"
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_SECURE="false"
EMAIL_USER="Paxfulexchangecompany@gmail.com"
EMAIL_PASS="YOUR_GMAIL_APP_PASSWORD_HERE"
EMAIL_FROM="Paxfulexchangecompany@gmail.com"
EMAIL_FROM_NAME="Charles Schwab Trading Platform"
```

## How to Get Gmail App Password

### Step 1: Enable 2-Step Verification
1. Go to your Google Account: https://myaccount.google.com
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google," click **2-Step Verification**
4. Follow the prompts to enable it (if not already enabled)

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. You may need to sign in again
3. In the "Select app" dropdown, choose **Mail**
4. In the "Select device" dropdown, choose **Other (Custom name)**
5. Enter a name like: `Charles Schwab Backend`
6. Click **Generate**
7. Google will display a 16-character password (like: `abcd efgh ijkl mnop`)
8. Copy this password (remove spaces: `abcdefghijklmnop`)

### Step 3: Update Your Environment Variables

**Option A: Update in Railway Dashboard**
1. Go to your Railway project
2. Click on your backend service
3. Navigate to **Variables** tab
4. Add/Update these variables:
   - `EMAIL_ENABLED` = `true`
   - `EMAIL_SERVICE` = `gmail`
   - `EMAIL_HOST` = `smtp.gmail.com`
   - `EMAIL_PORT` = `587`
   - `EMAIL_SECURE` = `false`
   - `EMAIL_USER` = `Paxfulexchangecompany@gmail.com`
   - `EMAIL_PASS` = `your-16-char-app-password` (paste the generated password)
   - `EMAIL_FROM` = `Paxfulexchangecompany@gmail.com`
   - `EMAIL_FROM_NAME` = `Charles Schwab Trading Platform`
5. Click **Deploy** to restart with new config

**Option B: Push Updated .env.production**
1. Update the `EMAIL_PASS` value in `.env.production` with your generated app password
2. Commit and push to GitHub
3. Your hosting platform will redeploy automatically

## Testing

After configuration, test the forgot password flow:
1. Go to your frontend: https://charlesschwab-wine.vercel.app/forgot-password
2. Enter a registered user's email
3. Click "Send Reset Link"
4. Check the email inbox (and spam folder)
5. Click the reset link in the email
6. Set a new password

## Troubleshooting

### Emails not sending?
- Verify `EMAIL_ENABLED="true"` is set
- Check that 2-Step Verification is enabled on your Gmail account
- Confirm the App Password is correct (16 characters, no spaces)
- Check backend logs for error messages

### "Less secure app" error?
- Use an App Password (not your regular Gmail password)
- App Passwords only work with 2-Step Verification enabled

### SMTP connection timeout?
- Verify `EMAIL_PORT="587"` and `EMAIL_SECURE="false"`
- Some hosting platforms block port 587; try port 465 with `EMAIL_SECURE="true"`

### Still not working?
- Check Railway/hosting logs for detailed error messages
- Verify the Gmail account isn't blocked or suspended
- Try sending a test email from the Gmail account manually

## Email Templates

The following emails are automatically sent:
- **Password Reset** - When user requests password reset
- **Welcome Email** - When new user registers
- **Deposit Notifications** - When deposits are processed
- **Withdrawal Notifications** - When withdrawals are processed  
- **Trading Notifications** - Bot trade updates
- **KYC Status Updates** - When KYC verification changes

## Security Notes

⚠️ **Never commit App Passwords to version control**
- Use environment variables only
- The `.env.production` file in this repo has a placeholder
- Always use App Passwords, never your actual Gmail password
- Rotate App Passwords periodically for security
