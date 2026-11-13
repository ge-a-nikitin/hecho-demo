/**
 * Readers for the numeric settings the API takes from the environment.
 *
 * The image ships without a schema layer, so a mistyped value can only be caught
 * where it is read. The auth limiter and the upload quotas want the same rule -
 * a positive whole number, a blank value meaning "not configured" - and both
 * prefer a failed start to a security control that is quietly weaker than the
 * one the documentation promises.
 */

/** Reads a setting, treating a blank value as "not configured". */
export function readSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();

  return value ? value : undefined;
}

export function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
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
