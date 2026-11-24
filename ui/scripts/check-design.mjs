// Fails when a colour, font size, z-index, duration or palette read is written outside the tokens.
// Tokens live in src/design/tokens/ and page themes in src/themes/; sample data in src/board/ may hold colours.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "src");

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

const all = files(src).map((f) => relative(root, f));
const isTheme = (f) => f.startsWith("src/design/tokens/") || f.startsWith("src/themes/");
const isData = (f) => f.startsWith("src/board/");

const palette = readFileSync(join(src, "design/tokens/palette.css"), "utf8");
const hues = [...new Set([...palette.matchAll(/--([a-z]+)-\d+\s*:/g)].map((m) => m[1]))];
const paletteRead = new RegExp(`var\\(--(${hues.join("|")})-\\d+\\)`);

const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|:\s*(white|black)\b/i;
const MAX_LOCAL_Z = 9;

const problems = [];
const report = (file, line, what, text) => problems.push(`${file}:${line}: ${what}: ${text.trim()}`);

function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

// A shorthand's first time is its duration and the second its delay; a delay may be a literal, and 0s is no choice.
function literalDuration(value) {
  return value.split(",").some((part) => {
    const first = part.match(/var\(--dur[\w-]*\)|(?<![\w-])[\d.]+m?s\b/);
    return first !== null && !first[0].startsWith("var(") && Number.parseFloat(first[0]) !== 0;
  });
}

function checkCss(file) {
  const text = blankComments(readFileSync(join(root, file), "utf8"));
  for (const m of text.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
    const [declaration, property, value] = m;
    const line = text.slice(0, m.index).split("\n").length;
    const at = (what) => report(file, line, what, declaration.replace(/\s+/g, " "));
    if (COLOUR.test(`:${value}`)) at("colour literal");
    if (paletteRead.test(value)) at("palette read outside a theme");
    if (/^font(-size)?$/.test(property) && /(?<![\w-])[\d.]+(px|rem)\b/.test(value)) at("font size literal");
    if (property === "z-index" && /^\d+$/.test(value.trim()) && Number(value) > MAX_LOCAL_Z) at("z-index literal");
    if (/^(transition|animation)(-duration)?$/.test(property) && literalDuration(value)) at("duration literal");
  }
}

const CLASS_LITERALS = [
  [/\btext-\[[\d.]+(px|rem|em)?\]/, "font size literal"],
  [/\bz-(\d+|\[\d+\])/, "z-index literal"],
  [/\b(bg|text|border|fill|stroke|ring|outline|shadow|from|via|to|decoration|accent|caret)-\[(#|rgb|hsl|oklch)/, "colour literal"],
  [/\b(duration|delay)-(\d+|\[[\d.]+m?s\])/, "duration literal"],
];

function checkTs(file) {
  const text = readFileSync(join(root, file), "utf8");
  const lines = text.split("\n");
  lines.forEach((source, i) => {
    const line = i + 1;
    if (!isData(file) && COLOUR.test(source.replace(/\/\/.*$/, ""))) report(file, line, "colour literal", source);
    if (paletteRead.test(source)) report(file, line, "palette read outside a theme", source);
    for (const [pattern, what] of CLASS_LITERALS) if (pattern.test(source)) report(file, line, what, source);
  });
  for (const m of text.matchAll(/style=\{\{([^{}]*)\}\}/g)) {
    const line = text.slice(0, m.index).split("\n").length;
    for (const entry of m[1].split(",")) {
      const value = entry.split(":").slice(1).join(":").trim();
      if (/^("[^"]*"|'[^']*'|-?[\d.]+)$/.test(value)) report(file, line, "static inline style", m[0]);
    }
  }
}

for (const file of all) {
  if (file.endsWith(".css") && !isTheme(file)) checkCss(file);
  if (/\.tsx?$/.test(file)) checkTs(file);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} design literal(s) outside the tokens.`);
  process.exit(1);
}
console.log("check-design: no literals outside the tokens.");
