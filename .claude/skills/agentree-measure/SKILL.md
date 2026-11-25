---
name: agentree-measure
description: "For a project that reproduces an interface from a reference site: how a measure task reads a part of the reference into its record, the record's form, and the agreements about the reference."
---

# Measuring a part of the reference

A measure task reads one part of the reference into the project's
records, in one session. It needs a tool whose session drives the
owner's Chrome. Nothing is built here.

## The agreements about the reference

- The reference is read-only: nothing is saved, created or deleted
  there. A step that would change its data is not taken; the state it
  would show is listed as not measured.
- It is read only in a tab you open and close. The owner signs in, in
  their own browser; you never enter a password.
- No token, cookie, storage or request header is read, and the page
  makes no request on the record's behalf.
- The owner's name and organization are never written into a record:
  an element that shows them is listed as not measured, with that
  reason.
- A value from any other product is never used as the reference's.

## The record's form

A directory a part, under the records the project's part names
(`clone.records` in agentree.config.json):

- `inventory.md`: the checklist of every sub-part down to the leaves
  and of every state, each with the file that records it, or why it is
  not recorded. You write it, first, from what the page shows.
- `base.json`: every element of the part at rest.
- `<state>.json`: a state that appears only on interaction (pointed
  at, focused, pressed, open, selected, disabled, empty, loading, an
  error), holding only what differs from its base.

Each element has an id that is a path from the part's name, its box,
its computed style by a fixed list of properties, its role, name,
text, state attributes and, for a drawing, a hash. The reader gives
all of it; no value is written by hand.

## The way

1. Claim the task; work in its tree. Open the reference in a new tab,
   at the viewport and the theme the task names.
2. Add the reader to the page: the source `agentree reader` prints,
   run in the page once. It defines `window.__agentree`.
3. Write `inventory.md`: walk the part to its leaves and list every
   sub-part, then every state each can show.
4. At rest, read the part:
   `JSON.stringify(window.__agentree.capture(<the part's root element>, "<part>"))`
   and give that text to
   `agentree record <part> --source <address> --viewport <WxH> --theme <theme>`
   on standard input, run in the task's tree.
5. For each state, produce it for real (a hover with the pointer, an
   open with a click, a close with Escape, a focus with a key press,
   recorded only when the element shows the focus), read the part the
   same way, with the root that holds what the state adds, and record
   it with `--state <name>`. It is kept as its difference from
   `base`, or from the state `--base` names.
6. What you could not read goes in with `--not-measured "<id>: <the
   reason>"` and in the inventory. It is never filled in.
7. Tick the inventory as you go. Commit, write the Log entry, submit.

## With the extension

When the owner loaded agentree's extension in Chrome (the directory
`extension/` of agentree, loaded unpacked) and set the daemon, the
project, this task and the part in its popup, the reader is in the
tab already and no text is carried by hand. Ask the page's window for
each record, and read the answer there:

    window.postMessage({ agentree: "record", state: "<name>" }, location.origin)

The answer is a message `{ agentree: "recorded", ok, text }`. The
record is written in this task's tree by the daemon. A state under
the pointer is recorded by the extension's shortcut, pressed while
the pointer stays where it is.

A record that is there is not written again: `agentree record`
refuses. When a reading was wrong, say so in the Log, remove that file
in your tree, and read it again.

Where the icons of the part are, and the steps that show them, go in
the inventory: the run that fetches drawings starts from them.
