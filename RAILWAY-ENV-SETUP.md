# Railway Environment Variables Setup Guide

This guide lists all environment variables needed for the backend to work correctly on Railway.

## 🔐 Required Environment Variables

Copy and paste these into your Railway project's environment variables section:

### Server Configuration
```
NODE_ENV=production
```

### CORS Configuration
```
CORS_ORIGIN=https://charlesschwabsoq.vercel.app,https://schwabadminsoq.vercel.app
```

### JWT Configuration
⚠️ **IMPORTANT**: Use a strong random secret in production
```
JWT_SECRET=U5QRKD8DyNWtlPBbHwXD6ruZs0WEU4/7Z1XBsPbk7V4=
JWT_EXPIRES_IN=7d
```

### Public Railway URL
Replace with your actual Railway deployment URL:
```
RAILWAY_URL=https://soq-dackend-trade-bot-production.up.railway.app
```

### Database Configuration
⚠️ **Use Railway reference variables** - These will be automatically resolved by Railway:
```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
```

### Rate Limiting
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=500
AUTH_RATE_LIMIT_MAX=20
```

### Email Configuration (Gmail SMTP)
⚠️ **CRITICAL FOR SUPPORT FEATURE** - Support messages will be sent via email

**Step 1: Generate Gmail App Password**
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification if not already enabled
3. Go to https://myaccount.google.com/apppasswords
4. Create a new app password for "Mail"
5. Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

**Step 2: Set these variables in Railway:**
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

⚠️ **IMPORTANT NOTES:**
- `EMAIL_USER`: Your Gmail address
- `EMAIL_PASS`: The 16-character app password (remove spaces: `gekopsphfoirfqhi`)
- `EMAIL_FROM`: Same as EMAIL_USER (the sender email)
- `ADMIN_EMAIL`: Where support tickets and admin notifications will be sent
- `EMAIL_ENABLED`: Must be `true` for emails to work

### Frontend URL
```
FRONTEND_URL=https://charlesschwabsoq.vercel.app
```

### Admin Account Seeding
⚠️ Only used on first startup if no admin exists
```
ADMIN_SEED_EMAIL=larryrobert0742@gmail.com
ADMIN_SEED_PASSWORD=Password@123!
ADMIN_SEED_FIRST_NAME=Larry
ADMIN_SEED_LAST_NAME=Robert
```

---

## 📧 Email Setup Verification

After deploying with these variables, test the email system:

1. **Check Railway Logs** for this message:
   ```
   [EmailService] SMTP initialized successfully
   ```

2. **Test Support Feature**:
   - Go to your user website
   - Click the support button (bottom-right corner)
   - Fill out and submit a support request
   - Check if admin email receives the ticket

3. **Common Issues**:
   - ❌ `EMAIL_USER or EMAIL_PASS not set` → Check variable names are exact
   - ❌ `SMTP verification failed` → Verify app password is correct (no spaces)
   - ❌ `Invalid credentials` → Generate a new app password
   - ❌ `No email received` → Check ADMIN_EMAIL is correct

---

## 🔄 Quick Copy-Paste (Update values as needed)

```env
NODE_ENV=production
CORS_ORIGIN=https://charlesschwabsoq.vercel.app,https://schwabadminsoq.vercel.app
JWT_SECRET=U5QRKD8DyNWtlPBbHwXD6ruZs0WEU4/7Z1XBsPbk7V4=
JWT_EXPIRES_IN=7d
RAILWAY_URL=https://soq-dackend-trade-bot-production.up.railway.app
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=500
AUTH_RATE_LIMIT_MAX=20
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
FRONTEND_URL=https://charlesschwabsoq.vercel.app
ADMIN_SEED_EMAIL=larryrobert0742@gmail.com
ADMIN_SEED_PASSWORD=Password@123!
ADMIN_SEED_FIRST_NAME=Larry
ADMIN_SEED_LAST_NAME=Robert
```

---

## ✅ Checklist

- [ ] All environment variables added to Railway
- [ ] Gmail app password generated and added
- [ ] EMAIL_ENABLED set to `true`
- [ ] ADMIN_EMAIL is correct
- [ ] Deployment successful
- [ ] Check logs for "SMTP initialized successfully"
- [ ] Test support form submission
- [ ] Verify admin receives support email

---

## 📝 Notes

- **Do NOT** use your regular Gmail password for `EMAIL_PASS`
- **Always** use an app password generated from Google Account settings
- The app password should be 16 characters without spaces
- Support emails will be sent FROM: `scchwabinvestments@gmail.com`
- Admin notifications will be sent TO: `scchwabinvestments@gmail.com`
