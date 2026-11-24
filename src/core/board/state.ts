/**
 * The machine's state of a board: who holds which task, who reviews it,
 * and the owner's token. Small JSON files under the git common directory;
 * a beat rewrites one of them and commits nothing.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Places } from "./places.ts";

/** A claim, or a review mark: the worker, its session, and when it last said it was there. */
export type Hold = {
  by: string;
  /** The session's id as its tool gives it, or the empty string for a worker that has none. */
  session: string;
  since: string;
  beat: string;
};

/** A claim also names the task's tree, its branch and the commit of `main` it was made at. */
export type Claim = Hold & { tree: string; branch: string; base: string };

type Kind = "claims" | "reviews";

const directory = (places: Places, kind: Kind) => join(places.state, kind);
const fileOf = (places: Places, kind: Kind, id: string) => join(directory(places, kind), `${id}.json`);

function read<T>(places: Places, kind: Kind, id: string): T | undefined {
  const file = fileOf(places, kind, id);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
}

function all<T>(places: Places, kind: Kind): Map<string, T> {
  const found = new Map<string, T>();
  if (!existsSync(directory(places, kind))) return found;
  for (const name of readdirSync(directory(places, kind)).sort()) {
    if (name.endsWith(".json")) found.set(name.slice(0, -5), read<T>(places, kind, name.slice(0, -5))!);
  }
  return found;
}

/** Writes a file so that a reader sees the old text or the new, never half of one. */
function replace(file: string, value: unknown) {
  const draft = `${file}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(draft, file);
}

/** Creates a hold that is not there yet; false when another worker created it first. */
function create(places: Places, kind: Kind, id: string, value: Hold): boolean {
  mkdirSync(directory(places, kind), { recursive: true });
  try {
    writeFileSync(fileOf(places, kind, id), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export const claimOf = (places: Places, id: string) => read<Claim>(places, "claims", id);
export const claims = (places: Places) => all<Claim>(places, "claims");
export const createClaim = (places: Places, id: string, claim: Claim) => create(places, "claims", id, claim);
export const removeClaim = (places: Places, id: string) => rmSync(fileOf(places, "claims", id), { force: true });

export const reviewOf = (places: Places, id: string) => read<Hold>(places, "reviews", id);
export const reviews = (places: Places) => all<Hold>(places, "reviews");
export const createReview = (places: Places, id: string, mark: Hold) => create(places, "reviews", id, mark);
export const removeReview = (places: Places, id: string) => rmSync(fileOf(places, "reviews", id), { force: true });

/** Sets the beat of a claim or a review mark to a time. */
export function beat(places: Places, kind: Kind, id: string, at: string) {
  const hold = read<Hold>(places, kind, id);
  if (hold) replace(fileOf(places, kind, id), { ...hold, beat: at });
}

const TOKEN = "owner-token";

/** The token that tells the owner from a worker; written once, readable by the user alone. */
export function ownerToken(places: Places): string {
  const file = join(places.state, TOKEN);
  if (!existsSync(file)) {
    mkdirSync(places.state, { recursive: true });
    writeFileSync(file, `${randomBytes(24).toString("hex")}\n`, { mode: 0o600, flag: "wx" });
  }
  return readFileSync(file, "utf8").trim();
}
