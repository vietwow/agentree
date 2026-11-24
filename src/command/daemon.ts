/** The command's way to the daemon of this machine: what it asks of it, and whether it is there. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../core/errors.ts";
import { machineHome, projects } from "../core/machine/projects.ts";
import { DEFAULT_PORT } from "../daemon/serve.ts";

const address = () => `http://127.0.0.1:${process.env.AGENTREE_PORT ?? DEFAULT_PORT}`;

function token(): string | undefined {
  const file = join(machineHome(), "token");
  return process.env.AGENTREE_TOKEN ?? (existsSync(file) ? readFileSync(file, "utf8").trim() : undefined);
}

/** Asks the daemon; nothing when no daemon answers, and a refusal in the daemon's own words when it refuses. */
export async function ask<T>(path: string, body?: unknown): Promise<T | undefined> {
  const bearer = token();
  if (!bearer) return undefined;
  const response = await fetch(`${address()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${bearer}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => undefined);
  if (!response) return undefined;
  const answer = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Refusal(answer.error ?? `the daemon answered ${response.status}`);
  return answer;
}

/** The id this machine's list gives the project a main checkout is; one not registered has none. */
export const projectIdOf = (root: string) => projects().find((project) => project.root === root)?.id;
