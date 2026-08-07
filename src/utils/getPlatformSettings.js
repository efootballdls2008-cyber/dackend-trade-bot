const pool = require('../db/pool');

let cache = null;
let cacheTime = 0;
const TTL_MS = 60_000;

function asBool(val) {
  return val === true || val === 1 || val === '1';
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    deposits_enabled: asBool(row.deposits_enabled),
    withdrawals_enabled: asBool(row.withdrawals_enabled),
    trading_enabled: asBool(row.trading_enabled),
    kyc_required: asBool(row.kyc_required),
    maintenance_mode: asBool(row.maintenance_mode),
    registration_enabled: asBool(row.registration_enabled),
    bot_trading_enabled: asBool(row.bot_trading_enabled),
    welcome_bonus_enabled: asBool(row.welcome_bonus_enabled),
    notify_on_new_deposit: asBool(row.notify_on_new_deposit),
    notify_on_new_withdrawal: asBool(row.notify_on_new_withdrawal),
    notify_on_new_user: asBool(row.notify_on_new_user),
    notify_on_new_order: asBool(row.notify_on_new_order),
    max_login_attempts: parseInt(row.max_login_attempts, 10) || 5,
    session_timeout_minutes: parseInt(row.session_timeout_minutes, 10) || 60,
    trading_fee_percent: parseFloat(row.trading_fee_percent) || 0,
    withdrawal_fee_percent: parseFloat(row.withdrawal_fee_percent) || 0,
    min_deposit_amount: parseFloat(row.min_deposit_amount) || 0,
    max_deposit_amount: parseFloat(row.max_deposit_amount) || 0,
    min_withdrawal_amount: parseFloat(row.min_withdrawal_amount) || 0,
    max_withdrawal_amount: parseFloat(row.max_withdrawal_amount) || 0,
  };
}

async function getPlatformSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && now - cacheTime < TTL_MS) {
    return cache;
  }
  await pool.query('INSERT IGNORE INTO platform_settings (id) VALUES (1)');
  const [[row]] = await pool.query('SELECT * FROM platform_settings LIMIT 1');
  cache = normalizeRow(row);
  cacheTime = now;
  return cache;
}

function invalidatePlatformSettingsCache() {
  cache = null;
  cacheTime = 0;
}

module.exports = { getPlatformSettings, invalidatePlatformSettingsCache, asBool, normalizeRow };
