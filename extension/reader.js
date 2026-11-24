// The reader of a part of an interface, run in the page: on the reference to make a record, and on the
// project's page to compare it with one. It reads the DOM and computed styles and nothing else: no storage,
// no cookie, no request. It defines window.__agentree.
(() => {
  /** The computed properties every element is read by. */
  const ALWAYS = [
    "display",
    "position",
    "box-sizing",
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "gap",
    "row-gap",
    "column-gap",
    "flex-direction",
    "flex-wrap",
    "align-items",
    "align-self",
    "justify-content",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "overflow-x",
    "overflow-y",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
    "box-shadow",
    "outline-width",
    "outline-style",
    "outline-color",
    "outline-offset",
    "background-color",
    "background-image",
    "color",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-transform",
    "text-align",
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-color",
    "white-space",
    "text-overflow",
    "cursor",
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "transition-delay",
    "transform",
    "z-index",
    "visibility",
    "pointer-events",
    "vertical-align",
  ];
  /** The properties read only where they apply. */
  const GRID = ["grid-template-columns", "grid-template-rows", "grid-auto-flow"];
  const INSETS = ["top", "right", "bottom", "left"];
  const BACKGROUND = ["background-size", "background-position", "background-repeat"];
  const SVG = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin"];
  /** The attributes that tell an element's state. */
  const STATE = [
    "aria-expanded",
    "aria-selected",
    "aria-current",
    "aria-haspopup",
    "aria-hidden",
    "aria-checked",
    "aria-pressed",
    "aria-disabled",
    "disabled",
    "tabindex",
    "type",
    "placeholder",
  ];
  /** The role HTML gives a tag that names none. */
  const ROLES = {
    a: "link",
    button: "button",
    nav: "navigation",
    hr: "separator",
    ul: "list",
    ol: "list",
    li: "listitem",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    input: "textbox",
    textarea: "textbox",
    select: "combobox",
    img: "img",
    table: "table",
    main: "main",
    header: "banner",
    footer: "contentinfo",
    aside: "complementary",
    dialog: "dialog",
  };
  /** The roles whose name is their text when nothing else names them. */
  const NAMED_BY_TEXT = ["button", "link", "tab", "menuitem", "option", "heading"];
  const MARK = "data-record";

  const short = (text, most) => text.replace(/\s+/g, " ").trim().slice(0, most);
  const round = (value) => Math.round(value * 10) / 10;

  /** A short hash of a text: the same text gives the same hash on both pages, and the text is not kept. */
  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  const roleOf = (el) => el.getAttribute("role") || ROLES[el.tagName.toLowerCase()] || "";

  function nameOf(el, role) {
    const labelled = el.getAttribute("aria-labelledby");
    const named =
      el.getAttribute("aria-label") ||
      (labelled &&
        labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")) ||
      el.getAttribute("alt") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      (NAMED_BY_TEXT.includes(role) ? el.textContent : "");
    return short(named || "", 80);
  }

  /** An element's own text: its direct text nodes; all its text when it holds no element. */
  function textOf(el) {
    if (!el.children.length) return short(el.textContent || "", 200);
    return short(
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" "),
      200,
    );
  }

  function styleOf(el) {
    const computed = getComputedStyle(el);
    const read = {};
    const take = (names) => names.forEach((name) => (read[name] = computed.getPropertyValue(name)));
    take(ALWAYS);
    if (/grid/.test(computed.display)) take(GRID);
    if (computed.position !== "static") take(INSETS);
    if (computed.backgroundImage !== "none") take(BACKGROUND);
    if (computed.filter !== "none") take(["filter"]);
    if (computed.backdropFilter && computed.backdropFilter !== "none") take(["backdrop-filter"]);
    if (el instanceof SVGElement) take(SVG);
    return read;
  }

  function iconOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "svg")
      return {
        inline: true,
        viewBox: el.getAttribute("viewBox") || "",
        shapes: el.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse").length,
        hash: hash(el.innerHTML.replace(/\s+/g, " ").trim()),
      };
    if (tag === "img")
      return {
        inline: false,
        width: el.naturalWidth,
        height: el.naturalHeight,
        hash: hash((el.currentSrc || el.src || "").split("?")[0].split("/").pop() || ""),
      };
    return undefined;
  }

  /** One element as the record holds it. */
  function element(el, id) {
    const role = roleOf(el);
    const box = el.getBoundingClientRect();
    const attrs = {};
    for (const name of STATE) if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name) || "";
    if (el.tagName === "A" && el.getAttribute("href")) attrs.href = el.getAttribute("href").split("?")[0];
    const icon = iconOf(el);
    return {
      id,
      tag: el.tagName.toLowerCase(),
      role,
      name: nameOf(el, role),
      text: textOf(el),
      box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      style: styleOf(el),
      attrs,
      ...(icon ? { icon } : {}),
    };
  }

  /** An element's segment of an id: `role[name]` when it has a role, else what it is. */
  function segment(el) {
    const role = roleOf(el);
    const tag = el.tagName.toLowerCase();
    if (tag === "svg") return "icon";
    if (role && role !== "img") {
      const name = nameOf(el, role);
      return name ? `${role}[${name}]` : role;
    }
    if (tag === "img") return "image";
    return !el.children.length && short(el.textContent || "", 1) ? "text" : tag;
  }

  /**
   * Every element under a root, each with an id that is a path from the part's name: the record of a part at
   * rest, or of a state shown in full. An element that is not drawn is left out, with all it holds; a drawing
   * is one element, whatever shapes it holds.
   */
  function capture(root, part) {
    const elements = [];
    const used = new Map();
    const walk = (el, id) => {
      const style = getComputedStyle(el);
      if (style.display === "none") return;
      const seen = used.get(id) || 0;
      used.set(id, seen + 1);
      const own = seen ? `${id}~${seen + 1}` : id;
      elements.push(element(el, own));
      if (el.tagName.toLowerCase() === "svg") return;
      for (const child of el.children) walk(child, `${own}/${segment(child)}`);
    };
    walk(root, part);
    return elements;
  }

  /** The elements the page marks with a record's id, each read as the record's are: what a comparison reads. */
  const read = () => [...document.querySelectorAll(`[${MARK}]`)].map((el) => element(el, el.getAttribute(MARK)));

  /** Marks every element under a root with the id `capture` would give it, so that a page can be read as its own record. */
  function mark(root, part) {
    const ids = capture(root, part).map((each) => each.id);
    const elements = [];
    const walk = (el) => {
      if (getComputedStyle(el).display === "none") return;
      elements.push(el);
      if (el.tagName.toLowerCase() !== "svg") for (const child of el.children) walk(child);
    };
    walk(root);
    elements.forEach((el, index) => el.setAttribute(MARK, ids[index]));
    return ids.length;
  }

  window.__agentree = { capture, read, mark, element };
})();
