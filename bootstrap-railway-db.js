/**
 * One-time Railway production database bootstrap.
 * Creates all tables from init.sql and seeds platform_settings + admin user.
 *
 * Run:
 *   ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... \
 *     railway run --service MySQL node bootstrap-railway-db.js
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { resolveRailwayMysqlConfig } = require('./railway-mysql-config');

function loadInitSql() {
  const raw = fs.readFileSync(path.join(__dirname, 'src/db/init.sql'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/CREATE DATABASE[\s\S]*?;/i, '')
    .replace(/USE\s+\w+\s*;/i, '');
}

async function seedPlatformSettings(connection) {
  await connection.query(`
    INSERT IGNORE INTO platform_settings (id) VALUES (1)
  `);
}

async function seedAdmin(connection) {
  const email = (process.env.ADMIN_SEED_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    console.log('⏭️  Skipping admin seed (set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD)');
    return;
  }

  const [[existing]] = await connection.query(
    "SELECT id FROM users WHERE role = 'Admin' LIMIT 1"
  );
  if (existing) {
    console.log(`✅ Admin already exists (id=${existing.id})`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const firstName = process.env.ADMIN_SEED_FIRST_NAME || 'Admin';
  const lastName = process.env.ADMIN_SEED_LAST_NAME || 'Schwab';

  await connection.query(
    `INSERT INTO users (email, password, first_name, last_name, role)
     VALUES (?, ?, ?, ?, 'Admin')`,
    [email, hash, firstName, lastName]
  );
  console.log(`✅ Admin account created: ${email}`);
}

async function main() {
  const config = resolveRailwayMysqlConfig();
  console.log(`📡 Bootstrapping database at ${config.host}:${config.port}/${config.database}`);

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    const sql = loadInitSql();
    console.log('🔄 Running init.sql schema...');
    await connection.query(sql);
    console.log('✅ Schema created');

    await seedPlatformSettings(connection);
    console.log('✅ Platform settings row ensured');

    await seedAdmin(connection);

    const [tables] = await connection.query('SHOW TABLES');
    console.log(`📋 Tables (${tables.length}):`, tables.map((t) => Object.values(t)[0]).join(', '));
    console.log('🎉 Railway database bootstrap complete');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('❌ Bootstrap failed:', err.message);
  process.exit(1);
});
