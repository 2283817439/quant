function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !name || !user) {
    return "";
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `mysql://${auth}@${host}:${port}/${name}`;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: resolveDatabaseUrl(),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  OPENCLAW_MODEL: process.env.OPENCLAW_MODEL,
  OPENCLAW_ENDPOINT: process.env.OPENCLAW_ENDPOINT,
  QMT_API_BASE_URL: process.env.QMT_API_BASE_URL,
  AI_BROWSER_WHITELIST: process.env.AI_BROWSER_WHITELIST,
  AI_DEFAULT_TIMEOUT_MS: process.env.AI_DEFAULT_TIMEOUT_MS,
};
