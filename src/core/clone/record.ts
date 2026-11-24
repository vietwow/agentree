/**
 * The record of a part of a reference interface, and the comparison of a
 * built page with it. A record holds every element of the part as it was
 * read: its box, its computed style by a fixed list of properties, its
 * role, name, text and state attributes. A state file holds only what
 * differs from its base. Expected values are never written by hand: both
 * sides of a comparison are read by the same reader.
 */

export type Box = { x: number; y: number; width: number; height: number };

export type Element = {
  /** A path, `part/…/segment`, unique within a part. */
  id: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  /** In CSS pixels of the viewport; a pseudo-element has none. */
  box?: Box;
  style: Record<string, string>;
  attrs: Record<string, string>;
  /** A short hash of a drawing's markup, and what names it. */
  icon?: Record<string, string | number | boolean>;
};

/** An element of a state that is a difference: only what differs from the base, or all of an element the base lacks. */
export type Changed =
  ({ change: "modified" } & Pick<Element, "id"> & Partial<Element>) | ({ change: "added" } & Element) | { change: "removed"; id: string };

export type PartRecord = {
  part: string;
  state: string;
  /** The state this file is a difference from; absent in a whole record. */
  base?: string;
  capturedAt: string;
  /** The address it was read at, without its query string. */
  source: string;
  viewport: { width: number; height: number };
  theme: string;
  elements: (Element | Changed)[];
  /** What was not read, each with its reason; never filled in. */
  notMeasured: { id: string; reason: string }[];
};

/** The elements of a state in full: a whole record as it is, a difference applied to the elements of its base. */
export function elementsOf(record: PartRecord, base?: Element[]): Element[] {
  if (record.base === undefined) return record.elements as Element[];
  if (!base) throw new Error(`the state ${record.state} of ${record.part} is a difference from ${record.base}, which was not given`);
  const changes = new Map((record.elements as Changed[]).map((element) => [element.id, element]));
  const kept = base.flatMap((element): Element[] => {
    const change = changes.get(element.id);
    if (!change) return [element];
    if (change.change === "removed") return [];
    const { change: _, style, attrs, ...fields } = change as { change: string } & Partial<Element>;
    return [{ ...element, ...fields, style: { ...element.style, ...style }, attrs: attrs ?? element.attrs }];
  });
  const added = (record.elements as Changed[]).flatMap((element): Element[] => {
    if (element.change !== "added") return [];
    const { change: _, ...whole } = element;
    return [whole];
  });
  return [...kept, ...added];
}

export type Difference = { id: string; what: string; expected: string; actual: string };

export type Comparison = {
  /** How many values were compared, and how many of them matched. */
  compared: number;
  matched: number;
  differences: Difference[];
  /** The record's elements the page does not mark with their id. */
  missing: string[];
};

export type Holds = {
  /** The colours are the reference's too, not the project's own. */
  colours: boolean;
  /** The font family is the reference's too. */
  font: boolean;
  /** The ids whose differences are exceptions, each with its stated reason. */
  exceptions?: Record<string, string>;
};

/** A box's sides may differ by this much, in CSS pixels: a reading has one decimal. */
const BOX_TOLERANCE = 0.5;

const COLOUR = /colou?r$|^fill$|^stroke$|^box-shadow$|^background-image$/;

/** Whether a property is one a project keeps its own, and the comparison leaves out. */
const own = (property: string, holds: Holds) => (!holds.colours && COLOUR.test(property)) || (!holds.font && property === "font-family");

/**
 * Compares what was read on the project's page with the record's elements,
 * each matched by its id. Positions are compared from the part's root, the
 * record's first element, since the two pages need not put the part at
 * one place of the window.
 */
export function compare(expected: Element[], actual: Element[], holds: Holds): Comparison {
  const read = new Map(actual.map((element) => [element.id, element]));
  const differences: Difference[] = [];
  const missing: string[] = [];
  let compared = 0;
  const from = (elements: Element[]) => elements.find((element) => element.box)?.box ?? { x: 0, y: 0, width: 0, height: 0 };
  const [rootWas, rootIs] = [from(expected), from(actual)];
  for (const was of expected) {
    if (holds.exceptions?.[was.id]) continue;
    const is = read.get(was.id);
    if (!is) {
      missing.push(was.id);
      continue;
    }
    const differ = (what: string, a: string, b: string) => {
      compared++;
      if (a !== b) differences.push({ id: was.id, what, expected: a, actual: b });
    };
    differ("tag", was.tag, is.tag);
    differ("role", was.role, is.role);
    differ("name", was.name, is.name);
    differ("text", was.text, is.text);
    if (was.box) {
      const sides: [keyof Box, number][] = [
        ["x", rootWas.x - rootIs.x],
        ["y", rootWas.y - rootIs.y],
        ["width", 0],
        ["height", 0],
      ];
      for (const [side, moved] of sides) {
        compared++;
        const shown = is.box ? is.box[side] + moved : Number.NaN;
        if (!(Math.abs(was.box[side] - shown) <= BOX_TOLERANCE))
          differences.push({
            id: was.id,
            what: `box.${side}`,
            expected: String(was.box[side]),
            actual: is.box ? String(Math.round(shown * 10) / 10) : "no box",
          });
      }
    }
    for (const [property, value] of Object.entries(was.style)) if (!own(property, holds)) differ(property, value, is.style[property] ?? "not read");
    for (const [name, value] of Object.entries(was.attrs)) differ(`[${name}]`, value, is.attrs[name] ?? "absent");
    if (was.icon?.hash !== undefined) differ("icon", String(was.icon.hash), String(is.icon?.hash ?? "no drawing"));
  }
  return { compared, matched: compared - differences.length, differences, missing };
}

/** A comparison in a few lines: its share, then each difference and each element that is missing. */
export function report(part: string, state: string, comparison: Comparison): string {
  const { compared, matched, differences, missing } = comparison;
  const share = compared ? Math.floor((matched / compared) * 1000) / 10 : 100;
  return [
    `${part}, ${state}: ${matched} of ${compared} values match (${differences.length || missing.length ? share : 100}%)${missing.length ? `; ${missing.length} elements are not on the page` : ""}.`,
    ...missing.map((id) => `  missing  ${id}`),
    ...differences.map((each) => `  differs  ${each.id}  ${each.what}: ${each.actual}, the record has ${each.expected}`),
  ].join("\n");
}
