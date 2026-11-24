/**
 * What the pages show, read from the daemon: the machine's projects and
 * its slots, and the open project's board in one snapshot, read again on
 * each event the daemon sends. A change the owner makes is a request to
 * the daemon, and shows when the daemon tells of it.
 */
import { Building2, Folder, Layers, Palette, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "../design/components/toast.ts";
import type { ActivityEntry } from "./activity.ts";
import type { AgentSession, Doc, Fact, Milestone, Slots, ToolSetup } from "./model.ts";
import { PROJECT_COLORS, type Project } from "./projects.ts";
import { TOOL_LABEL, type Status, type Task, type TaskDetail, type Tool } from "./task.ts";

type Area = { path: string; name: string; files: number };

/** A project's board as its pages read it, at one moment of the daemon's clock. */
export type Board = {
  now: Date;
  project: Project;
  tasks: Task[];
  details: ReadonlyMap<string, TaskDetail>;
  activity: ActivityEntry[];
  numbers: Numbers;
  milestones: Milestone[];
  facts: Fact[];
  docs: Doc[];
  areas: Area[];
  sessions: AgentSession[];
  tools: ToolSetup[];
};

/** How the work of a project runs, read from its Logs and from what its checks recorded. */
type Numbers = {
  timeIn: { status: Status; tasks: number; medianMs: number; longestMs: number }[];
  reviews: { accepted: number; rejected: number; rejectedShare: number };
  wait: { runs: number; medianMs: number; longestMs: number };
  failing: { command: string; runs: number; failed: number }[];
};

const ICONS: Record<string, LucideIcon> = { layers: Layers, "building-2": Building2, palette: Palette, folder: Folder };
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** What the daemon sent, with each time as a Date. */
function read<T>(text: string): T {
  return JSON.parse(text, (_, value: unknown) => (typeof value === "string" && TIME.test(value) ? new Date(value) : value)) as T;
}

const toolOf = (worker: string) => worker.split("/")[0] as Tool;

type Sent = Record<string, any>;

function projectOf(sent: Sent): Project {
  return {
    ...sent,
    icon: ICONS[sent.icon] ?? Folder,
    color: PROJECT_COLORS[sent.color as keyof typeof PROJECT_COLORS] ?? PROJECT_COLORS.slate,
  } as Project;
}

/** A tree's place as its last two directories, and its base as git's short form. */
function detailOf(sent: Sent): TaskDetail {
  const tree = sent.tree && { ...sent.tree, path: String(sent.tree.path).split("/").slice(-2).join("/"), base: String(sent.tree.base).slice(0, 7) };
  return { ...sent, tree } as TaskDetail;
}

function boardOf(sent: Sent): Board {
  const sessions = sent.sessions as Sent[];
  const named = (id?: string) => {
    const by = sessions.find((session) => session.id === id);
    return id && by ? `${TOOL_LABEL[by.tool as Tool]} ${id}` : id;
  };
  return {
    now: sent.now,
    project: projectOf(sent.project),
    tasks: sent.tasks,
    details: new Map(Object.entries(sent.details as Record<string, Sent>).map(([id, detail]) => [id, detailOf(detail)])),
    activity: sent.activity,
    numbers: sent.numbers,
    milestones: sent.milestones,
    facts: (sent.facts as Sent[]).map((fact) => ({ ...fact, by: toolOf(fact.by), task: fact.task || undefined }) as Fact),
    docs: sent.documents,
    areas: sent.files.areas,
    sessions: sessions.map((session) => ({ ...session, by: named(session.by) }) as AgentSession),
    tools: sent.tools,
  };
}

function slotsOf(sent: Sent): Slots {
  const by = <T extends { by: string }>(each: T) => ({ ...each, by: toolOf(each.by) });
  return {
    ...sent,
    runs: sent.runs.map(by),
    queue: sent.queue.map(by),
    load: (sent.load as Sent[]).map((reading) => ({ ...reading, host: reading.host ?? reading.vm })),
  } as Slots;
}

/** What the owner is told of as it happens: a question asked, a check that failed, a task that waits for a review. */
type Notice = { kind: "question" | "check-failed" | "review"; task: string; title: string; text: string };

const NOTICE: Record<Notice["kind"], string> = { question: "asks you", "check-failed": "failed its checks", review: "waits for a review" };

/** Shows a notice in the page, and as a notification of the browser once the owner allowed those. */
function tell(notice: Notice) {
  const head = `${notice.task} ${NOTICE[notice.kind]}`;
  toast(`${head}: ${notice.kind === "review" ? notice.title : notice.text}`, { kind: notice.kind === "check-failed" ? "err" : "info", ms: 8000 });
  if (typeof Notification !== "undefined" && Notification.permission === "granted")
    new Notification(head, { body: `${notice.title}\n${notice.text}`, tag: `${notice.task}-${notice.kind}` });
}

/** Why there is nothing to show: the daemon is not there, the page carries no token of it, or the machine has no project. */
export type Trouble = "down" | "no-token" | "empty";

class Refused extends Error {}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path).catch(() => undefined);
  if (!response || response.status >= 500) throw new Refused("down" satisfies Trouble);
  if (response.status === 401 || response.status === 403) throw new Refused("no-token" satisfies Trouble);
  const text = await response.text();
  if (!response.ok) throw new Error((read<{ error?: string }>(text).error ?? text) || response.statusText);
  return read<T>(text);
}

/** Asks the daemon for a change and gives back its answer; what it refuses is said in a toast, in its own words, and nothing is given back. */
export async function post<T>(path: string, body: unknown = {}): Promise<T | undefined> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(
    () => undefined,
  );
  const answer = response ? ((await response.json().catch(() => ({}))) as T & { error?: string }) : undefined;
  if (response?.ok) return answer;
  toast(answer?.error ?? "The daemon did not answer", { kind: "err", ms: 6000 });
  return undefined;
}

/** Asks the daemon for a change; whether it was made. */
export const send = async (path: string, body: unknown = {}): Promise<boolean> => (await post(path, body)) !== undefined;

/** What the kickstart of a new project asks, and where on this machine new projects are made. */
export type Machine = { projects: string | null; tools: Tool[]; stack: string[] };

export const machine = () => get<Machine>("/api/machine");

let current: Board | undefined;
let currentSlots: Slots | undefined;

/** The open project's board, for a part that is given no board of its own. */
export function board(): Board {
  if (!current) throw new Error("no board is read yet");
  return current;
}

/** What a card opened shows, for a task of the open project's board. */
export const detail = (task: Pick<Task, "id">): TaskDetail => board().details.get(task.id)!;

/** The titles of the tasks that have parts, by their ids. */
export function parentTitles(): Record<string, string> {
  const parents = new Set(board().tasks.map((task) => task.parent));
  return Object.fromEntries(
    board()
      .tasks.filter((task) => parents.has(task.id))
      .map((task) => [task.id, task.title]),
  );
}

/** The machine's slots as last read. */
export const slots = (): Slots => currentSlots!;

export type Daemon = { projects: Project[]; board: Board; slots: Slots } | { trouble: Trouble } | undefined;

/** How long the reads wait after an event, so that a burst of them is one read. */
const SETTLE_MS = 80;
const RETRY_MS = 3000;

/** Reads the daemon for a project, and again on each of its events; nothing while the first read runs. */
export function useDaemon(project: string | undefined): Daemon {
  const [daemon, setDaemon] = useState<Daemon>();
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const projects = (await get<Sent[]>("/api/projects")).map(projectOf);
        const id = projects.find((each) => each.id === project)?.id ?? projects[0]?.id;
        if (!id) throw new Refused("empty" satisfies Trouble);
        const [snapshot, queue] = await Promise.all([get<Sent>(`/api/projects/${id}/snapshot`), get<Sent>("/api/slots")]);
        if (!live) return;
        current = boardOf(snapshot);
        currentSlots = slotsOf(queue);
        setDaemon({ projects, board: current, slots: currentSlots });
      } catch (error) {
        if (!live) return;
        if (!(error instanceof Refused)) throw error;
        setDaemon({ trouble: error.message as Trouble });
        timer = setTimeout(() => void load(), RETRY_MS);
      }
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), SETTLE_MS);
    };
    void load();
    const events = new EventSource("/api/events");
    events.addEventListener("change", (event) => {
      const change = read<{ what: string; notice?: Notice }>((event as MessageEvent<string>).data);
      if (change.what === "notice" && change.notice) tell(change.notice);
      else soon();
    });
    return () => {
      live = false;
      clearTimeout(timer);
      events.close();
    };
  }, [project]);
  return daemon;
}
