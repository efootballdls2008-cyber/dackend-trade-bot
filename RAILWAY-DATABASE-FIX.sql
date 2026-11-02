-- ═══════════════════════════════════════════════════════════════
-- Railway Database Migration - Fix Missing Columns
-- Charles Schwab Trading Platform
-- ═══════════════════════════════════════════════════════════════
-- Run these commands on your Railway MySQL database to fix:
-- 1. Password reset functionality (reset_token columns)
-- 2. Guest support messages (user_id optional)
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Add Password Reset Columns to Users Table
-- ───────────────────────────────────────────────────────────────
-- These columns store the password reset token and expiration time
-- for the forgot password feature

-- Check if columns exist first, then add them
-- Run these one at a time or as a batch

-- Add reset_token column
ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL;

-- Add reset_token_expires column
ALTER TABLE users 
ADD COLUMN reset_token_expires DATETIME DEFAULT NULL;

-- Add index for faster token lookups
ALTER TABLE users 
ADD INDEX idx_reset_token (reset_token);

-- ───────────────────────────────────────────────────────────────
-- 2. Make support_messages.user_id Optional for Guest Users
-- ───────────────────────────────────────────────────────────────
-- This allows guest users (not logged in) to submit support requests

ALTER TABLE support_messages 
MODIFY COLUMN user_id INT DEFAULT NULL;

-- ───────────────────────────────────────────────────────────────
-- Verification Queries
-- ───────────────────────────────────────────────────────────────
-- Run these to verify the changes were applied successfully:

-- Check users table structure
-- DESCRIBE users;

-- Check support_messages table structure
-- DESCRIBE support_messages;

-- Check if reset_token column exists
-- SELECT COUNT(*) AS has_reset_token 
-- FROM information_schema.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
--   AND TABLE_NAME = 'users' 
--   AND COLUMN_NAME = 'reset_token';

-- ═══════════════════════════════════════════════════════════════
-- Notes:
-- ═══════════════════════════════════════════════════════════════
-- - These changes are safe to run multiple times (IF NOT EXISTS)
-- - No existing data will be lost
-- - All existing columns remain unchanged
-- - You can run these via Railway's MySQL console or any MySQL client
-- ═══════════════════════════════════════════════════════════════
