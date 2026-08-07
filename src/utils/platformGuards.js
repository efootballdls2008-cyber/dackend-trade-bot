const pool = require('../db/pool');
const { isAdmin } = require('../middleware/auth');
const { getPlatformSettings } = require('./getPlatformSettings');

function deny(res, status, message) {
  res.status(status).json({ success: false, message });
  return false;
}

async function assertPlatformOpen(req, res) {
  if (req.user && isAdmin(req.user)) return true;
  const settings = await getPlatformSettings();
  if (settings.maintenance_mode) {
    return deny(res, 503, 'Platform is under maintenance. Please try again later.');
  }
  return true;
}

function assertTradingEnabled(settings, res) {
  if (settings.trading_enabled) return true;
  return deny(res, 403, 'Trading is currently disabled on this platform.');
}

function assertBotTradingEnabled(settings, res) {
  if (settings.bot_trading_enabled) return true;
  return deny(res, 403, 'Bot trading is currently disabled on this platform.');
}

async function assertKycIfRequired(userId, settings, res) {
  if (!settings.kyc_required) return true;

  const [[user]] = await pool.query(
    'SELECT kyc_verified FROM users WHERE id = ?',
    [userId]
  );
  if (user?.kyc_verified) return true;

  const [[submission]] = await pool.query(
    `SELECT status FROM kyc_submissions
     WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`,
    [userId]
  );
  if (submission?.status === 'approved') return true;

  return deny(
    res,
    403,
    'Identity verification (KYC) is required before this action.'
  );
}

function calcTradingFee(subtotal, settings) {
  const pct = parseFloat(settings.trading_fee_percent) || 0;
  const fee = Math.round(subtotal * pct) / 100;
  return { fee, totalWithFee: subtotal + fee };
}

function calcWithdrawalDeduction(amount, settings) {
  const pct = parseFloat(settings.withdrawal_fee_percent) || 0;
  const fee = Math.round(amount * pct) / 100;
  return { amount, fee, totalDeducted: amount + fee };
}

function shouldNotifyAdmin(type, settings) {
  const map = {
    user_registration: 'notify_on_new_user',
    user_deposit: 'notify_on_new_deposit',
    user_withdrawal: 'notify_on_new_withdrawal',
    buy_stocks: 'notify_on_new_order',
    buy_crypto: 'notify_on_new_order',
  };
  const key = map[type];
  if (!key) return true;
  return !!settings[key];
}

function getJwtExpiresIn(settings) {
  const mins = parseInt(settings.session_timeout_minutes, 10);
  if (mins > 0) return `${mins}m`;
  return process.env.JWT_EXPIRES_IN || '7d';
}

function getLoginMaxAttempts(settings) {
  const fromSettings = parseInt(settings.max_login_attempts, 10);
  if (fromSettings > 0) return fromSettings;
  return parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 10;
}

function getLoginLockoutMinutes() {
  return parseInt(process.env.LOGIN_LOCKOUT_MINS, 10) || 15;
}

function validateLimitRanges(updates, current) {
  const merged = { ...current, ...updates };
  const pairs = [
    ['min_deposit_amount', 'max_deposit_amount', 'Deposit'],
    ['min_withdrawal_amount', 'max_withdrawal_amount', 'Withdrawal'],
  ];
  for (const [minKey, maxKey, label] of pairs) {
    const min = parseFloat(merged[minKey]);
    const max = parseFloat(merged[maxKey]);
    if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) {
      return `${label} minimum cannot exceed maximum`;
    }
  }
  return null;
}

module.exports = {
  assertPlatformOpen,
  assertTradingEnabled,
  assertBotTradingEnabled,
  assertKycIfRequired,
  calcTradingFee,
  calcWithdrawalDeduction,
  shouldNotifyAdmin,
  getJwtExpiresIn,
  getLoginMaxAttempts,
  getLoginLockoutMinutes,
  validateLimitRanges,
};
