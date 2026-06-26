function resolveRailwayMysqlConfig() {
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway';
  const user = process.env.MYSQLUSER || process.env.DB_USER || 'root';
  const password =
    process.env.RAILWAY_MYSQL_PASSWORD ||
    process.env.MYSQLPASSWORD ||
    process.env.MYSQL_ROOT_PASSWORD ||
    process.env.DB_PASSWORD;

  if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
    return {
      host: process.env.RAILWAY_TCP_PROXY_DOMAIN,
      port: parseInt(process.env.RAILWAY_TCP_PROXY_PORT, 10),
      database,
      user,
      password,
    };
  }

  const publicUrl = process.env.MYSQL_PUBLIC_URL;
  if (publicUrl) {
    const parsed = new URL(publicUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '3306', 10),
      database: parsed.pathname.replace(/^\//, '') || database,
      user: decodeURIComponent(parsed.username || user),
      password: decodeURIComponent(parsed.password || password || ''),
    };
  }

  const host = process.env.DB_HOST || process.env.MYSQLHOST;
  if (host && !host.includes('.railway.internal')) {
    return {
      host,
      port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
      database,
      user,
      password,
    };
  }

  throw new Error(
    'No public MySQL endpoint found in the current Railway service env. ' +
      'Run: railway run --service MySQL node <script>.js'
  );
}

module.exports = { resolveRailwayMysqlConfig };
