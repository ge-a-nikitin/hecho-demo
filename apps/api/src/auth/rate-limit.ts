/**
 * Settings for the request limiter Better Auth runs in front of `/api/auth/*`.
 *
 * Better Auth enables that limiter only when `NODE_ENV` is "production", and the
 * API image runs without `NODE_ENV`, so every sign-in, sign-up and password
 * change used to be unlimited: an anonymous caller could guess the password of
 * the single administrator as fast as the network allowed, and each registration
 * paid for a password hash and database rows. The settings below are explicit, so
 * the control no longer depends on how the container is started, and they are
 * read from the environment, so an operator can raise a limit without a rebuild.
 *
 * The paths are Better Auth route paths relative to `basePath`, and `*` is its
 * wildcard. `/change-password` and `/change-email` keep the built-in rule of 3
 * attempts per 10 seconds, which is stricter than anything here.
 */

export interface AuthRateLimitRule {
  readonly window: number;
  readonly max: number;
}

export interface AuthRateLimitOptions {
  readonly enabled: boolean;
  readonly window: number;
  readonly max: number;
  readonly customRules: Readonly<Record<string, AuthRateLimitRule>>;
}

/** Documented defaults, mirrored in `.env.example` and the deployment docs. */
export const AUTH_RATE_LIMIT_DEFAULTS = {
  enabled: true,
  window: 60,
  max: 60,
  signInWindow: 60,
  signInMax: 5,
} as const;

const TRUE_VALUES = ["1", "true", "yes", "on"];
const FALSE_VALUES = ["0", "false", "no", "off"];

export function authRateLimitOptions(env: NodeJS.ProcessEnv = process.env): AuthRateLimitOptions {
  const credentials: AuthRateLimitRule = {
    window: positiveInteger(env, "AUTH_SIGN_IN_RATE_LIMIT_WINDOW", AUTH_RATE_LIMIT_DEFAULTS.signInWindow),
    max: positiveInteger(env, "AUTH_SIGN_IN_RATE_LIMIT_MAX", AUTH_RATE_LIMIT_DEFAULTS.signInMax),
  };

  return {
    enabled: booleanValue(env, "AUTH_RATE_LIMIT_ENABLED", AUTH_RATE_LIMIT_DEFAULTS.enabled),
    window: positiveInteger(env, "AUTH_RATE_LIMIT_WINDOW", AUTH_RATE_LIMIT_DEFAULTS.window),
    max: positiveInteger(env, "AUTH_RATE_LIMIT_MAX", AUTH_RATE_LIMIT_DEFAULTS.max),
    // Guessing a password and creating accounts are the cheap anonymous actions,
    // so the two credential endpoints share one stricter rule.
    customRules: {
      "/sign-in/*": credentials,
      "/sign-up/*": credentials,
    },
  };
}

/** Reads a setting, treating a blank value as "not configured". */
function readSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();

  return value ? value : undefined;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = readSetting(env, name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive whole number, got "${value}"`);
  }

  return parsed;
}

function booleanValue(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = readSetting(env, name)?.toLowerCase();

  if (value === undefined) {
    return fallback;
  }

  if (TRUE_VALUES.includes(value)) {
    return true;
  }

  if (FALSE_VALUES.includes(value)) {
    return false;
  }

  throw new Error(`${name} must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join("/")}, got "${value}"`);
}
