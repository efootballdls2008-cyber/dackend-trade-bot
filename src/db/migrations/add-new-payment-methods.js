const pool = require('../pool');

async function up() {
  const connection = await pool.getConnection();
  try {
    console.log('[Migration] Adding new payment method fields...');
    
    // Add Zelle fields
    await connection.query(`
      ALTER TABLE platform_accounts 
      ADD COLUMN IF NOT EXISTS zelle_name VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS zelle_email VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS zelle_phone VARCHAR(50) NULL
    `);

    // Add PayPal fields
    await connection.query(`
      ALTER TABLE platform_accounts 
      ADD COLUMN IF NOT EXISTS paypal_name VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS paypal_email VARCHAR(255) NULL
    `);

    // Add Cash App field
    await connection.query(`
      ALTER TABLE platform_accounts 
      ADD COLUMN IF NOT EXISTS cashapp_username VARCHAR(255) NULL
    `);

    // Add Venmo field
    await connection.query(`
      ALTER TABLE platform_accounts 
      ADD COLUMN IF NOT EXISTS venmo_username VARCHAR(255) NULL
    `);

    // Add Cashier Check fields
    await connection.query(`
      ALTER TABLE platform_accounts 
      ADD COLUMN IF NOT EXISTS check_name VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS check_address TEXT NULL
    `);

    console.log('[Migration] ✓ New payment method fields added');
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
    console.log('[Migration] Removing new payment method fields...');
    
    await connection.query(`
      ALTER TABLE platform_accounts 
      DROP COLUMN IF EXISTS zelle_name,
      DROP COLUMN IF EXISTS zelle_email,
      DROP COLUMN IF EXISTS zelle_phone,
      DROP COLUMN IF EXISTS paypal_name,
      DROP COLUMN IF EXISTS paypal_email,
      DROP COLUMN IF EXISTS cashapp_username,
      DROP COLUMN IF EXISTS venmo_username,
      DROP COLUMN IF EXISTS check_name,
      DROP COLUMN IF EXISTS check_address
    `);

    console.log('[Migration] ✓ Payment method fields removed');
  } catch (error) {
    console.error('[Migration] Error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { up, down };

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
