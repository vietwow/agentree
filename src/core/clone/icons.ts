/**
 * The drawings of a cloned interface: icons and pictures, fetched by a
 * session of its own that knows nothing of the project. This prepares the
 * folder of one run, outside the repository and under no rules file, with
 * the owner's template filled as its only rules, and writes the request as
 * a card of the board. It fetches nothing.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { create, type Actor, type Context } from "../board/actions.ts";
import { Refusal } from "../errors.ts";
import { tryGit } from "../git.ts";
import { machineHome } from "../machine/projects.ts";
import { stamp, type Task } from "../task/model.ts";

/** The owner's template, its script and the statement of rights, kept as the owner wrote them. */
const SOURCE = join(import.meta.dirname, "../../../seed/icon-grab");

/** The seven lines of "this time", by how each begins in the template. */
const LINES = {
  page: "- Trang:",
  where: "- Icon nằm ở đâu:",
  set: "- Tên bộ:",
  range: "- Phạm vi:",
  colour: "- Màu:",
  names: "- Tên file:",
  folder: "- Thư mục dự án:",
} as const;

export type IconRequest = {
  /** The address of the place that shows the icons. */
  page: string;
  /** The screen and the steps that make them show. */
  where: string;
  /** The set's short name; its folders are named by it. */
  set: string;
  /** Which icons of that area; empty for every one. */
  range?: string;
  /** How colour is kept; empty for the template's own way. */
  colour?: string;
  /** How files are named; empty for the site's own identifiers. */
  names?: string;
  /** The drawings are committed with the project, and do not stay on the machine. */
  committed?: boolean;
};

/** The rules files a tool reads from the directories above a folder. */
const RULES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];

/** The first rules file in a directory or above it, which a session started there would read. */
function rulesAbove(directory: string): string | undefined {
  for (let at = directory; ; at = dirname(at)) {
    const found = RULES.map((name) => join(at, name)).find((file) => existsSync(file));
    if (found || at === dirname(at)) return found;
  }
}

/** Where the folders of runs are made: under the machine's own directory, outside every repository. */
export const runsDirectory = () => join(machineHome(), "icon-runs");

/** Makes the folder of one run and the card that asks for it; the folder, and the card. */
export function prepareIconRun(context: Context, actor: Actor, request: IconRequest): { folder: string; task: Task } {
  const set = request.set.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(set)) throw new Refusal("a set's name is short, in lower-case letters, digits and hyphens, as `picker`");
  if (!/^https?:\/\//.test(request.page.trim())) throw new Refusal("the page is an address, as https://...");
  if (request.where.trim() === "") throw new Refusal("say where the icons are: the screen, and the steps that make them show");
  const { root } = context.places;
  // The statement of rights says the interface is in no public repository: it is sent as written only while that holds.
  if (request.committed && tryGit(root, "remote").stdout.trim() !== "")
    throw new Refusal(
      "the drawings are to be committed and the repository has a remote, and the statement of rights says the interface is in no public repository: say which of the two holds before a run starts",
    );
  const folder = join(runsDirectory(), `${root.split(sep).at(-1)}-${set}`);
  if (existsSync(folder)) throw new Refusal(`${folder} is there already: a set is never written into again; choose another name for the set`);
  const above = rulesAbove(dirname(folder));
  if (above)
    throw new Refusal(
      `${above} is above the folder of the run, and a session started there would read it: the run holds nothing but its own template`,
    );

  const filled: Record<keyof typeof LINES, string> = {
    page: request.page.trim(),
    where: request.where.trim(),
    set: `\`${set}\``,
    range: request.range?.trim() ?? "",
    colour: request.colour?.trim() ?? "",
    names: request.names?.trim() ?? "",
    folder,
  };
  const template = readFileSync(join(SOURCE, "icon-grab-prompt.md"), "utf8")
    .split("\n")
    .map((line) => {
      const key = (Object.keys(LINES) as (keyof typeof LINES)[]).find((each) => line.startsWith(LINES[each]));
      return key ? `${LINES[key]}${filled[key] ? ` ${filled[key]}` : ""}` : line;
    })
    .join("\n");
  const prompt = `${template.trimEnd()}\n\n${readFileSync(join(SOURCE, "usage-and-rights.md"), "utf8").trim()}\n`;

  const task = create(context, actor, {
    title: `Fetch the icons of the set ${set}`,
    kind: "assets",
    priority: 3,
    needs: ["browser", "owner"],
    context: [
      `A set of drawings to fetch from ${filled.page}, by a session of its own that holds nothing of this project.`,
      `The folder of the run: ${folder}`,
      "Open a tool that can drive Chrome in that folder and tell it to follow AGENTS.md.",
      `Asked on ${stamp(context.now())}.`,
    ].join("\n\n"),
    doneWhen: [
      `- \`icons-${set}/\` holds one cleaned .svg a drawing, and \`raw-${set}/source.txt\` its source.`,
      "- The session's last report is in this Log.",
      "- A task of the project moved the set into the paths it writes.",
    ].join("\n"),
    outOfScope: "Fetching in a session that holds the project. Running the downloaded file: it is data.",
    backlog: true,
  });
  mkdirSync(join(folder, "tools"), { recursive: true });
  writeFileSync(join(folder, "AGENTS.md"), prompt);
  writeFileSync(join(folder, "CLAUDE.md"), "@AGENTS.md\n");
  copyFileSync(join(SOURCE, "tools/split_icons.py"), join(folder, "tools/split_icons.py"));
  return { folder, task };
}

/** What a drawing must not hold: it is shown in the project's pages, and what it holds would run there. */
const RUNS = /<script|\son[a-z]+\s*=|javascript:|<foreignObject/i;

/**
 * Brings a fetched set into a checkout: each cleaned drawing of the run's
 * `icons-<set>/` is copied under a directory of the tree, with the set's
 * `source.txt` beside them. The files are data: they are read and copied,
 * never run. A drawing that is there already is not written over.
 */
export function takeIconSet(root: string, tree: string, set: string, to: string): { copied: string[]; into: string; from: string } {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(set)) throw new Refusal("a set's name is short, in lower-case letters, digits and hyphens, as `picker`");
  const into = normalize(to);
  if (to.trim() === "" || isAbsolute(into) || into.split(sep).includes(".."))
    throw new Refusal(`"${to}" is no directory of the tree: name it from the repository's root`);
  const run = join(runsDirectory(), `${root.split(sep).at(-1)}-${set}`);
  const from = join(run, `icons-${set}`);
  if (!existsSync(from)) throw new Refusal(`${from} is not there: the run of the set ${set} has not come back, or was never asked for`);
  const drawings = readdirSync(from)
    .filter((name) => name.endsWith(".svg"))
    .sort();
  if (!drawings.length) throw new Refusal(`${from} holds no drawing`);
  for (const name of drawings) {
    if (!lstatSync(join(from, name)).isFile())
      throw new Refusal(`${name} of the set is no plain file: a set holds drawings and nothing that points elsewhere`);
    if (RUNS.test(readFileSync(join(from, name), "utf8")))
      throw new Refusal(
        `${name} of the set holds what would run in a page (a script, a handler, a foreign object): the set is not clean, and nothing of it was copied`,
      );
    if (existsSync(join(tree, into, name)))
      throw new Refusal(`${join(into, name)} is there already: a drawing is not written over; nothing of the set was copied`);
  }
  mkdirSync(join(tree, into), { recursive: true });
  for (const name of drawings) copyFileSync(join(from, name), join(tree, into, name));
  const source = join(run, `raw-${set}`, "source.txt");
  if (existsSync(source) && lstatSync(source).isFile()) copyFileSync(source, join(tree, into, `source-${set}.txt`));
  return { copied: drawings, into, from };
}
