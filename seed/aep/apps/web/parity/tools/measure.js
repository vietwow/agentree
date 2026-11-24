// In-page measurement library for the parity record (see ../README.md).
// Paste into the page's console, or inject it with an automation tool. It
// reads the DOM, computed styles and CSS rules, and nothing else: no storage,
// no cookies, no requests. It defines window.__parity.
/* oxlint-disable no-underscore-dangle -- `__parity` is the one name the library adds to the page it is pasted into */
/* oxlint-disable unicorn/consistent-function-scoping -- the library is one function, so that pasting it into a page adds no other name there */
(() => {
  const P = (window.__parity = {
    runs: {},
    files: {},
    ids: new WeakMap(),
    used: new Set(),
    anchors: new WeakSet(),
  });
  const r1 = n => Math.round(n * 10) / 10;
  const clean = s => String(s).replace(/\s+/g, ' ').trim();
  const cls = el =>
    String(
      el.className && el.className.baseVal !== undefined
        ? el.className.baseVal
        : el.className,
    );
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  P.props = [
    'display',
    'position',
    'box-sizing',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'flex-direction',
    'flex-wrap',
    'align-items',
    'align-self',
    'justify-content',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'overflow-x',
    'overflow-y',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
    'box-shadow',
    'outline-width',
    'outline-style',
    'outline-color',
    'outline-offset',
    'background-color',
    'background-image',
    'color',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-transform',
    'text-align',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-color',
    'white-space',
    'text-overflow',
    'cursor',
    'transition-property',
    'transition-duration',
    'transition-timing-function',
    'transition-delay',
    'transform',
    'z-index',
    'visibility',
    'pointer-events',
    'vertical-align',
  ];
  const GRID = [
    'grid-template-columns',
    'grid-template-rows',
    'grid-auto-flow',
  ];
  const INSET = ['top', 'right', 'bottom', 'left'];
  const BG = ['background-size', 'background-position', 'background-repeat'];
  const SVG = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'marker-start',
    'marker-end',
  ];
  const ATTRS = [
    'aria-expanded',
    'aria-selected',
    'aria-current',
    'aria-pressed',
    'aria-checked',
    'aria-haspopup',
    'aria-disabled',
    'aria-hidden',
    'data-state',
    'data-active',
    'data-selected',
    'disabled',
    'type',
    'placeholder',
    'tabindex',
  ];
  const IMPLICIT = {
    a: 'link',
    button: 'button',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    hr: 'separator',
    img: 'img',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    input: 'textbox',
    textarea: 'textbox',
    select: 'combobox',
    dialog: 'dialog',
  };
  const NAMED_BY_TEXT = [
    'button',
    'link',
    'menuitem',
    'tab',
    'option',
    'heading',
    'checkbox',
    'switch',
    'radio',
    'treeitem',
    'menuitemcheckbox',
    'menuitemradio',
    'label',
  ];
  const NAMED_TAGS = [
    'button',
    'a',
    'input',
    'textarea',
    'select',
    'nav',
    'main',
    'header',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'label',
    'dialog',
  ];

  P.hash = s => {
    let h = 5381;
    for (let i = 0; i < s.length; i++)
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  };
  P.role = el =>
    el.getAttribute('role') || IMPLICIT[el.tagName.toLowerCase()] || '';
  P.aname = el => {
    const lb = el.getAttribute('aria-labelledby');
    const byId = lb
      ? lb
          .split(/\s+/)
          .map(i => document.getElementById(i))
          .filter(Boolean)
          .map(n => n.textContent)
          .join(' ')
      : '';
    const viaText = NAMED_BY_TEXT.includes(
      P.role(el) || el.tagName.toLowerCase(),
    )
      ? el.textContent
      : '';
    return clean(
      el.getAttribute('aria-label') ||
        byId ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        viaText ||
        '',
    ).slice(0, 80);
  };
  P.text = el =>
    clean(
      el.children.length
        ? [...el.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent)
            .join(' ')
        : el.textContent,
    ).slice(0, 200);
  P.style = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    const st = {};
    const add = list => list.forEach(p => (st[p] = cs.getPropertyValue(p)));
    add(P.props);
    if (st.display.includes('grid')) add(GRID);
    if (st.position !== 'static') add(INSET);
    if (st['background-image'] !== 'none') add(BG);
    for (const p of ['backdrop-filter', 'filter']) {
      const v = cs.getPropertyValue(p);
      if (v && v !== 'none') st[p] = v;
    }
    if (el instanceof SVGElement && !pseudo) add(SVG);
    if (pseudo) st.content = cs.getPropertyValue('content');
    return st;
  };
  P.icon = (el, r) => {
    const t = el.tagName.toLowerCase();
    if (t === 'svg') {
      const shapes = [
        ...el.querySelectorAll(
          'path,circle,rect,line,polyline,polygon,ellipse',
        ),
      ];
      const stroked = shapes.find(s => getComputedStyle(s).stroke !== 'none');
      const title = el.querySelector('title');
      return {
        inline: true,
        width: r1(r.width),
        height: r1(r.height),
        viewBox: el.getAttribute('viewBox') || '',
        strokeWidth: stroked
          ? getComputedStyle(stroked).strokeWidth
          : 'none (filled shapes)',
        fillAttr: el.getAttribute('fill') || '',
        shapes: shapes.length,
        hash: P.hash(el.innerHTML),
        name: clean(
          el.getAttribute('aria-label') ||
            (title && title.textContent) ||
            el.getAttribute('data-icon') ||
            el.getAttribute('data-testid') ||
            el.getAttribute('class') ||
            '',
        ),
      };
    }
    if (t === 'img') {
      let file = '';
      try {
        file = new URL(el.currentSrc || el.src, location.href).pathname
          .split('/')
          .pop();
      } catch {
        file = '';
      }
      return {
        inline: false,
        width: r1(r.width),
        height: r1(r.height),
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        file,
        hash: P.hash(file),
        name: el.getAttribute('alt') || '',
      };
    }
    return null;
  };
  P.rec = (el, id) => {
    const r = el.getBoundingClientRect();
    const o = {
      id,
      tag: el.tagName.toLowerCase(),
      role: P.role(el),
      name: P.aname(el),
      text: P.text(el),
      box: { x: r1(r.x), y: r1(r.y), width: r1(r.width), height: r1(r.height) },
      style: P.style(el),
    };
    const ic = P.icon(el, r);
    if (ic) o.icon = ic;
    const attrs = {};
    for (const a of ATTRS)
      if (el.hasAttribute(a)) attrs[a] = el.getAttribute(a);
    if (el.tagName === 'A' && el.getAttribute('href'))
      attrs.href = el.getAttribute('href').split('?')[0];
    if (Object.keys(attrs).length) o.attrs = attrs;
    const tid = el.getAttribute('data-testid');
    if (cls(el) || tid)
      o.sourceHint = {
        ...(tid ? { testid: tid } : {}),
        ...(cls(el) ? { class: clean(cls(el)) } : {}),
      };
    return o;
  };

  // Ids. An anchor is an element given its id by hand; a named element is one
  // with a role or a landmark tag. Either starts a new id stem.
  P.anchor = (el, id) => {
    P.ids.set(el, id);
    P.used.add(id);
    P.anchors.add(el);
  };
  P.reset = () => {
    P.ids = new WeakMap();
    P.used = new Set();
    P.anchors = new WeakSet();
  };
  P.seg = el => {
    const t = el.tagName.toLowerCase();
    const anchor = P.anchors.has(el);
    if (t === 'svg') return ['icon', anchor];
    if (t === 'img') return ['image', anchor];
    const explicit = el.getAttribute('role');
    if (
      (NAMED_TAGS.includes(t) || explicit) &&
      explicit !== 'none' &&
      explicit !== 'presentation'
    ) {
      const nm = P.aname(el)
        .slice(0, 40)
        .replace(/[/[\]]/g, ' ');
      return [(P.role(el) || t) + (nm ? '[' + nm + ']' : ''), true];
    }
    if (!el.children.length && clean(el.textContent)) return ['text', anchor];
    return [t, anchor];
  };
  P.idFor = (el, parentId, namedId) => {
    if (P.ids.has(el)) return P.ids.get(el);
    const [seg, named] = P.seg(el);
    const stem = (named ? namedId : parentId) + '/' + seg;
    let id = stem;
    for (let n = 2; P.used.has(id); n++) id = stem + '~' + n;
    P.used.add(id);
    P.ids.set(el, id);
    return id;
  };

  // roots: [[element, id], ...]. opts.skip(el) leaves a subtree out;
  // opts.deepSvg(el) walks into an <svg> that is a drawing, not an icon.
  P.capture = (name, roots, opts = {}) => {
    const els = [];
    const refs = new Map();
    const walk = (el, id, namedId) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0 || cs.display === 'contents') {
        els.push(P.rec(el, id));
        refs.set(id, el);
        for (const ps of ['::before', '::after']) {
          const c = getComputedStyle(el, ps).getPropertyValue('content');
          if (c && c !== 'none' && c !== 'normal')
            els.push({
              id: id + '/' + ps,
              tag: ps,
              role: '',
              name: '',
              text: c,
              style: P.style(el, ps),
            });
        }
      }
      if (
        el.tagName.toLowerCase() === 'svg' &&
        !(opts.deepSvg && opts.deepSvg(el))
      )
        return;
      const nextNamed = P.seg(el)[1] ? id : namedId;
      for (const c of el.children) {
        if (opts.skip && opts.skip(c)) continue;
        walk(c, P.idFor(c, id, nextNamed), nextNamed);
      }
    };
    for (const [el, id] of roots) {
      if (!P.ids.has(el)) P.anchor(el, id);
      walk(el, P.ids.get(el), P.ids.get(el));
    }
    P.runs[name] = { els, refs, roots: roots.map(r => r[0]) };
    return els.length;
  };

  // What differs from the base run: modified (changed fields only), added,
  // removed. A pointer-events change that the whole part inherits from its
  // root (a modal dialog is open) is kept on the root only.
  P.diff = (baseName, name) => {
    const base = P.runs[baseName];
    const run = P.runs[name];
    const b = new Map(base.els.map(e => [e.id, e]));
    const seen = new Set();
    let out = [];
    for (const e of run.els) {
      seen.add(e.id);
      const o = b.get(e.id);
      if (!o) {
        out.push({ ...e, change: 'added' });
        continue;
      }
      const d = { id: e.id, change: 'modified' };
      for (const k of ['role', 'name', 'text']) if (e[k] !== o[k]) d[k] = e[k];
      if (JSON.stringify(e.box) !== JSON.stringify(o.box)) d.box = e.box;
      if (JSON.stringify(e.attrs || {}) !== JSON.stringify(o.attrs || {}))
        d.attrs = e.attrs || {};
      if (JSON.stringify(e.icon || {}) !== JSON.stringify(o.icon || {}))
        d.icon = e.icon;
      const st = {};
      for (const k of new Set([
        ...Object.keys(e.style),
        ...Object.keys(o.style),
      ]))
        if (e.style[k] !== o.style[k])
          st[k] = e.style[k] === undefined ? null : e.style[k];
      if (Object.keys(st).length) d.style = st;
      if (Object.keys(d).length > 2) out.push(d);
    }
    for (const [id, el] of base.refs) {
      if (seen.has(id) || id.includes('/::')) continue;
      if (
        !el.isConnected ||
        getComputedStyle(el).display === 'none' ||
        run.roots.some(r => r === el || r.contains(el))
      )
        out.push({ id, change: 'removed' });
    }
    const root = out.find(
      e =>
        e.change === 'modified' &&
        e.style &&
        e.style['pointer-events'] &&
        !e.id.includes('/'),
    );
    if (root) {
      const v = root.style['pointer-events'];
      out = out.filter(e => {
        if (
          e === root ||
          e.change !== 'modified' ||
          !e.style ||
          e.style['pointer-events'] !== v
        )
          return true;
        delete e.style['pointer-events'];
        if (!Object.keys(e.style).length) delete e.style;
        return Object.keys(e).length > 2;
      });
    }
    return out;
  };

  // Custom properties referenced by the CSS rules that match a run's elements.
  P.vars = name => {
    const found = {};
    const rules = [];
    const collect = list => {
      for (const r of list) {
        if (r.selectorText && r.style && r.style.cssText.includes('var('))
          rules.push(r);
        if (r.cssRules && r.cssRules.length) collect(r.cssRules);
      }
    };
    for (const sh of document.styleSheets) {
      try {
        collect(sh.cssRules);
      } catch {
        found['(unreadable stylesheet)'] = {
          value: '',
          usedBy: [],
          properties: [],
        };
      }
    }
    for (const [id, el] of P.runs[name].refs) {
      const cs = getComputedStyle(el);
      for (const r of rules) {
        let ok = false;
        try {
          ok = el.matches(r.selectorText);
        } catch {
          ok = false;
        }
        if (!ok) continue;
        for (let i = 0; i < r.style.length; i++) {
          const prop = r.style[i];
          for (const m of r.style
            .getPropertyValue(prop)
            .matchAll(/var\(\s*(--[\w-]+)/g)) {
            const f = (found[m[1]] = found[m[1]] || {
              value: clean(cs.getPropertyValue(m[1])),
              usedBy: [],
              properties: [],
            });
            if (!f.usedBy.includes(id) && f.usedBy.length < 12)
              f.usedBy.push(id);
            if (!prop.startsWith('--') && !f.properties.includes(prop))
              f.properties.push(prop);
          }
        }
      }
    }
    return Object.keys(found)
      .toSorted()
      .map(k => ({ name: k, ...found[k] }));
  };

  // One record file. base: the state this file is a difference from.
  P.file = (part, state, notMeasured = [], base = null, extra = {}) => {
    const run = part + ':' + state;
    const f = {
      part,
      state,
      ...(base ? { base } : {}),
      capturedAt: new Date().toISOString(),
      source: location.origin + location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      theme: 'light',
      ...extra,
      elements: base ? P.diff(part + ':' + base, run) : P.runs[run].els,
      notMeasured,
    };
    P.files[part + '/' + state] = f;
    return f.elements.length;
  };

  // Things rendered outside the part's root while a state is shown: tooltips,
  // menus, dialogs. Third-party widgets of the page are left out.
  P.overlays = () => {
    const app = document.querySelector('#root');
    const known = new Set([app, app.firstElementChild, P.assistant]);
    return [...document.body.children, ...app.children].filter(
      c =>
        !['SCRIPT', 'IFRAME', 'STYLE', 'LINK', 'NOSCRIPT'].includes(
          c.tagName,
        ) &&
        !known.has(c) &&
        c.id !== '__parity_cv' &&
        !/intercom|kapa/.test(c.id + ' ' + cls(c)) &&
        !c.querySelector('.grecaptcha-badge') &&
        [...c.querySelectorAll('*')].some(x => {
          const r = x.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        }),
    );
  };

  // Capture the part in the state it is in now. keep: overlays keep the ids
  // they got in an earlier state (to compare a menu with itself).
  P.snap = (part, state, base, keep, notMeasured) => {
    const def = P.parts[part];
    const ov = P.overlays();
    ov.forEach((o, i) => {
      if (keep && P.ids.has(o)) return;
      o.querySelectorAll('*').forEach(x => P.ids.delete(x));
      P.anchor(o, part + '/overlay[' + state + ']' + (i ? '~' + (i + 1) : ''));
    });
    const n = P.capture(
      part + ':' + state,
      [...def.roots(), ...ov.map(o => [o, P.ids.get(o)])],
      def.options(),
    );
    return [
      n,
      P.file(
        part,
        state,
        notMeasured || [],
        base === undefined ? 'base' : base,
        def.extra ? def.extra() : {},
      ),
      ov.length,
    ];
  };
  // Keyboard focus: press Tab once by hand first, so that the browser is in
  // keyboard modality; the state is recorded only if :focus-visible matches.
  P.focusSnap = async (part, state, el, base) => {
    el.focus();
    await sleep(1100);
    return [
      document.activeElement === el && el.matches(':focus-visible'),
      ...P.snap(part, state, base),
    ];
  };

  // Two cuts of repeated siblings. The record uses the first for every state
  // but those of an expanded node (set `sampling` to 'rows' before init()
  // for them): more than eight children of one tag keep their first two.
  // The second keeps the first three of more than six children of one tag
  // and class.
  const repeated = (el, sampling) => {
    const p = el.parentElement;
    if (!p) return false;
    if (sampling !== 'rows') {
      const first = p.children[0];
      return (
        p.children.length > 8 &&
        [...p.children].every(c => c.tagName === first.tagName) &&
        [...p.children].indexOf(el) >= 2
      );
    }
    if (p.children.length <= 6) return false;
    const key = c => c.tagName + '|' + cls(c);
    const same = [...p.children].filter(c => key(c) === key(el));
    return same.length > 6 && same.indexOf(el) >= 3;
  };

  P.parts = {
    // The frame of every page. init() gives the landmarks their ids; call it
    // again whenever the page re-creates them (another area, pin and unpin).
    shell: {
      init: () => {
        P.reset();
        const q = s => document.querySelector(s);
        const root = q('#root > div');
        const panels = [
          ...document.querySelectorAll('[data-testid=LayoutSidebarPanel]'),
        ];
        const overlay = panels.find(
          p => getComputedStyle(p).position === 'absolute',
        );
        const pinned = panels.find(
          p => getComputedStyle(p).position !== 'absolute',
        );
        const main = q('main');
        const top = q('#top-nav');
        P.assistant = q('#support-button').parentElement;
        P.anchor(root, 'shell');
        P.anchor(q('nav[aria-label="Skip navigation"]'), 'shell/skip-nav');
        P.anchor(top, 'shell/top-nav');
        P.anchor(q('[data-testid=AppLayoutSideNav]'), 'shell/rail');
        P.anchor(top.nextElementSibling, 'shell/row');
        P.anchor(top.nextElementSibling.children[1], 'shell/body');
        if (overlay) P.anchor(overlay, 'shell/panel-overlay');
        if (pinned) P.anchor(pinned, 'shell/panel');
        P.anchor(q('[data-testid=BreadcrumbNavigation]'), 'shell/topbar');
        P.anchor(main, 'shell/main');
        P.anchor(main.firstElementChild, 'shell/main/page-surface');
        P.anchor(P.assistant, 'shell/assistant-button');
        const banner = root.children[1];
        // Left out: the demo's marketing bar, the page itself, the hidden copy
        // of the panel (set withFlyout to record it), list rows after the fifth.
        P.parts.shell.withFlyout = false;
        P.parts.shell.skip = el => {
          const p = el.parentElement;
          if (el === banner || p === main.firstElementChild) return true;
          if (p === overlay) return !P.parts.shell.withFlyout;
          return (
            !!p &&
            p.getAttribute('data-testid') === 'virtuoso-item-list' &&
            [...p.children].indexOf(el) >= 5
          );
        };
        P.parts.shell.roots = () => [
          [root, 'shell'],
          [P.assistant, 'shell/assistant-button'],
        ];
      },
      options: () => ({ skip: P.parts.shell.skip }),
    },
    // The Data model page. Three nodes and three edges of each kind are
    // recorded; repeated rows are cut to three plus one per type badge.
    'data-model': {
      init: () => {
        P.reset();
        const q = s => document.querySelector(s);
        const def = P.parts['data-model'];
        const root = q('main').firstElementChild.firstElementChild;
        const flow = q('[data-testid=rf__wrapper]');
        P.assistant = q('#support-button').parentElement;
        P.anchor(root, 'data-model');
        P.anchor(q('[data-testid=PageHeader]'), 'data-model/header');
        const graph = q('[data-testid=BlueprintsGraph]');
        if (graph) {
          P.anchor(graph, 'data-model/graph');
          const filter = [...graph.children].find(c =>
            c.querySelector('[data-testid^=BlueprintsQuickSearch]'),
          );
          if (filter) P.anchor(filter, 'data-model/filter');
        }
        def.nodes = new Set();
        def.edges = new Set();
        def.rows = new Set();
        if (flow) {
          P.anchor(flow, 'data-model/canvas');
          P.anchor(q('[data-testid=rf__controls]'), 'data-model/controls');
          P.anchor(
            q('[data-testid=rf__background]'),
            'data-model/canvas-background',
          );
          const titles = {
            _team: 'Team',
            service: 'Service',
            jiraIssue: 'Jira Issue',
          };
          for (const n of flow.querySelectorAll('.react-flow__node')) {
            const title = titles[n.getAttribute('data-id')];
            if (title) {
              P.anchor(n, 'data-model/node[' + title + ']');
              def.nodes.add(n);
            }
          }
          const edges = [...flow.querySelectorAll('.react-flow__edge')];
          const kind = e =>
            e.querySelector('foreignObject') ? 'dashed' : 'solid';
          // The recorded edges are named, so that their ids hold whatever
          // order the page draws its edges in.
          const recorded = [
            ['jiraIssue to service', 'solid'],
            ['jiraIssue to githubPullRequest', 'solid'],
            ['_virtual_mcp_server to _virtual_mcp_tool', 'solid'],
            ['_ai_agent to _team', 'dashed'],
            ['service to group', 'dashed'],
            ['factory_stage to _team', 'dashed'],
          ];
          for (const [label, wanted] of recorded) {
            const e = edges.find(
              x =>
                x.getAttribute('aria-label') === 'Edge from ' + label &&
                kind(x) === wanted,
            );
            if (!e) continue;
            const svg = e.closest('svg');
            P.anchor(
              svg,
              'data-model/edge[' +
                e.getAttribute('aria-label').replace('Edge from ', '') +
                '][' +
                kind(e) +
                ']',
            );
            def.edges.add(svg);
          }
          const seen = new Set();
          for (const li of def.sampling === 'rows'
            ? flow.querySelectorAll('.react-flow__node li')
            : []) {
            const badge = li.innerText
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean)
              .pop();
            if (!seen.has(badge)) {
              seen.add(badge);
              def.rows.add(li);
            }
          }
        }
        def.roots = () => [[root, 'data-model']];
      },
      options: () => {
        const def = P.parts['data-model'];
        return {
          skip: el => {
            if (def.rows.has(el)) return false;
            const pc = el.parentElement ? cls(el.parentElement) : '';
            if (pc.includes('react-flow__nodes')) return !def.nodes.has(el);
            if (pc.includes('react-flow__edges')) return !def.edges.has(el);
            return (
              !pc.includes('react-flow') &&
              !el.closest('[data-testid=PageHeader]') &&
              repeated(el, def.sampling)
            );
          },
          deepSvg: el =>
            /react-flow__(background|marker)/.test(
              el.getAttribute('class') || '',
            ) ||
            (!!el.parentElement &&
              cls(el.parentElement).includes('react-flow__edges')),
        };
      },
      // The graph's zoom, its background pattern and its edge markers.
      extra: () => {
        const viewport = document.querySelector('.react-flow__viewport');
        if (!viewport) return { canvas: null };
        const m = new DOMMatrix(getComputedStyle(viewport).transform);
        const at = (el, names) =>
          Object.fromEntries(names.map(n => [n, el.getAttribute(n)]));
        const pattern = document.querySelector(
          '.react-flow__background pattern',
        );
        const markers = [
          ...new Map(
            [
              ...document.querySelectorAll('[data-testid=rf__wrapper] marker'),
            ].map(k => [k.id.split('=')[0], k]),
          ).values(),
        ];
        return {
          canvas: {
            library: 'React Flow (class names react-flow__*, xyflow__viewport)',
            zoom: m.a,
            translate: { x: m.e, y: m.f },
            nodeCount: document.querySelectorAll('.react-flow__node').length,
            edgeCount: document.querySelectorAll('.react-flow__edge').length,
            backgroundPattern: pattern
              ? {
                  ...at(pattern, [
                    'x',
                    'y',
                    'width',
                    'height',
                    'patternUnits',
                    'patternTransform',
                  ]),
                  shape: pattern.firstElementChild.tagName,
                  ...at(pattern.firstElementChild, ['cx', 'cy', 'r', 'class']),
                  fill: getComputedStyle(pattern.firstElementChild).fill,
                }
              : null,
            markers: markers.map(k => ({
              idStem: k.id.split('__')[0].slice(0, 12),
              ...at(k, [
                'markerWidth',
                'markerHeight',
                'viewBox',
                'markerUnits',
                'orient',
                'refX',
                'refY',
              ]),
              shape: k.firstElementChild.tagName,
              shapeAttrs: at(k.firstElementChild, [
                'class',
                'fill',
                'stroke',
                'stroke-width',
                'stroke-linecap',
                'stroke-linejoin',
                'points',
              ]),
              shapeFill: getComputedStyle(k.firstElementChild).fill,
              shapeStroke: getComputedStyle(k.firstElementChild).stroke,
              hash: P.hash(k.innerHTML),
            })),
          },
        };
      },
    },
  };

  // Export for an automated capture, which cannot copy text out of the page:
  // gzip the files, then draw the bytes as coloured cells (4 CSS pixels wide,
  // 2 bits in each of red, green and blue) that a lossless capture of the
  // viewport carries to disk. tools/decode.py reads the captures back. By
  // hand, copy(JSON.stringify(__parity.files)) in the console does the same.
  const CELL = 4,
    COLS = 420,
    ROWS = 225,
    HEAD = 9,
    CAP = (COLS * ROWS * 6) / 8 - HEAD;
  P.pack = async obj => {
    const z = new Blob([JSON.stringify(obj)])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    P.buf = new Uint8Array(await new Response(z).arrayBuffer());
    return { bytes: P.buf.length, frames: Math.ceil(P.buf.length / CAP) };
  };
  P.show = k => {
    P.hide();
    const cv = document.createElement('canvas');
    cv.id = '__parity_cv';
    cv.width = COLS * CELL;
    cv.height = ROWS * CELL;
    cv.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;background:#fff;width:' +
      COLS * CELL +
      'px;height:' +
      ROWS * CELL +
      'px';
    document.documentElement.appendChild(cv);
    const count = Math.ceil(P.buf.length / CAP);
    const data = P.buf.subarray(k * CAP, (k + 1) * CAP);
    let sum = 0;
    for (const v of data) sum = (sum + v) & 0xffff;
    const bytes = new Uint8Array(CAP + HEAD);
    bytes.set([
      0xa5,
      k,
      count,
      (data.length >> 16) & 255,
      (data.length >> 8) & 255,
      data.length & 255,
      sum >> 8,
      sum & 255,
      0x5a,
    ]);
    bytes.set(data, HEAD);
    const small = document.createElement('canvas');
    small.width = COLS;
    small.height = ROWS;
    const sg = small.getContext('2d');
    const im = sg.createImageData(COLS, ROWS);
    for (let i = 0; i < bytes.length; i += 3) {
      const word = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      for (let j = 0; j < 4; j++) {
        const v = (word >> (18 - 6 * j)) & 63;
        const c = (i / 3) * 4 + j;
        im.data.set(
          [(v >> 4) * 85, ((v >> 2) & 3) * 85, (v & 3) * 85, 255],
          c * 4,
        );
      }
    }
    sg.putImageData(im, 0, 0);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, COLS * CELL, ROWS * CELL);
    return k + 1 + ' of ' + count;
  };
  P.hide = () => {
    const cv = document.getElementById('__parity_cv');
    if (cv) cv.remove();
  };
  return 'parity ready';
})();
