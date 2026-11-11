import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { API_URL, waitForApi } from "./stack.js";

/**
 * Starts docker-compose.test.yml before the suite and removes it afterwards, so
 * the integration run needs no manual preparation. Set TEST_STACK_MANAGED=false
 * to reuse a stack you started yourself, and TEST_STACK_KEEP=true to inspect the
 * containers after a failure.
 */

const execFileAsync = promisify(execFile);

const composeFile =
  process.env.TEST_COMPOSE_FILE ?? resolve(process.cwd(), "../../docker-compose.test.yml");

async function compose(...args: string[]): Promise<void> {
  await execFileAsync("docker", ["compose", "-f", composeFile, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function setup(): Promise<void> {
  if (process.env.TEST_STACK_MANAGED === "false") {
    console.log(`[integration] reusing the stack at ${API_URL}`);
    await waitForApi();
    return;
  }

  console.log(`[integration] starting the ephemeral stack from ${composeFile}`);
  await compose("up", "-d", "--build", "--wait");
  await waitForApi();
}

export async function teardown(): Promise<void> {
  if (process.env.TEST_STACK_MANAGED === "false" || process.env.TEST_STACK_KEEP === "true") return;

  console.log("[integration] removing the ephemeral stack and its volumes");
  await compose("down", "-v", "--remove-orphans");
}
