export function redisNamespace() {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const segment = /^(production|preview|development|test)$/.test(environment)
    ? environment
    : "development";
  return `line-bot:${segment}`;
}
