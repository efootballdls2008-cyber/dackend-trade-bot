/**
 * Migration: Add password reset token fields to users table
 * 
 * Adds:
 * - reset_token: Token for password reset (nullable)
 * - reset_token_expires: Expiration timestamp for the token (nullable)
 * - plain_password: Temporary plain text password storage (nullable, for admin view only)
 */

const pool = require('../pool');

async function up() {
  const connection = await pool.getConnection();
  try {
    console.log('[Migration] Adding password reset fields to users table...');
    
    await connection.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL,
      ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255) NULL COMMENT 'Temporary plain password for admin view - use sparingly'
    `);
    
    console.log('[Migration] ✓ Password reset fields added successfully');
  } catch (error) {
    console.error('[Migration] Error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  try {
    console.log('[Migration] Removing password reset fields from users table...');
    
    await connection.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS reset_token,
      DROP COLUMN IF EXISTS reset_token_expires,
      DROP COLUMN IF EXISTS plain_password
    `);
    
    console.log('[Migration] ✓ Password reset fields removed successfully');
  } catch (error) {
    console.error('[Migration] Error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { up, down };

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('[Migration] Complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migration] Failed:', error);
      process.exit(1);
    });
}
