/**
 * Runs a case with environment overrides, restoring the previous values
 * afterwards. Services read their settings in the constructor, so the case calls
 * `withEnv` around the construction and the assertions that depend on it.
 */
export async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}
