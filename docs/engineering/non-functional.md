# Non-functional requirements

Every change is checked against this list before it is submitted, and its
Log says what it affects. "Not affected" is a fine answer when it is true.
An RFC that adds a capability, an interface, a data model, a dependency
outside the project or a security boundary has a section for each heading
below.

Words written in `<angle brackets>` are filled from the project's ADR of
its stack.

## Security

- **A threat model for every boundary.** An RFC that adds an entry point
  (a route, a message, an upload, a webhook) says who may call it, what they
  can send, what they could gain, and what stops them.
- **Authentication and authorisation on every entry point.** The caller is
  resolved and a permission checked before the action, in one place the
  framework calls for every route, so that a route cannot forget it. A
  public entry point is a decision written beside it, with its reason.
  Authorisation is checked on the object, not only on the route: a caller
  who may read invoices may read only theirs.
- **Least privilege.** Credentials, roles and tokens of the service grant
  only what it uses; the database role of the application owns no schema
  and is no superuser.
- **Untrusted input is validated** where it enters, against a schema:
  requests, configuration, files, messages, data read back from storage,
  and the answers of models and outside services.
- **Output is encoded for where it goes.** Queries are parameterised; text
  shown in a page is escaped by the framework, and no markup from data runs
  as markup; no command is built for a shell from input.
- **Outbound requests** go only to destinations the configuration names; a
  URL from input is checked against them before it is fetched.
- **Sessions and tokens.** Cookies are `HttpOnly`, `Secure` and `SameSite`;
  a state-changing request from a browser is protected against cross-site
  forgery; tokens expire, and a refresh can be revoked.
- **Passwords**, where the project stores any, are hashed with an
  algorithm made for it, never encrypted or stored as they are; better, an
  identity provider holds them and the project receives none.
- **No cryptography of the project's own.** Vetted libraries, current
  algorithms, keys from a secret store, rotated.
- **No secrets in code, configuration files, logs or task files.** Secrets
  come from the environment or a secret store; a scan of secrets runs on
  every submit, and a finding is removed and rotated, never allowed.
- **Rate limits and bounds** on every entry point that costs: the size of a
  request, the number of requests of a caller, the time of a request.
- **Browser hardening**: a Content Security Policy, and the headers that
  forbid framing and sniffing.
- **The supply chain**: dependencies with a known licence and maintenance,
  no known vulnerability that has not been reviewed (a check fails on one,
  and a reviewed one is listed with its reason and what fixes it), install
  scripts off but for those listed with their reason, images from a known
  base, running as a user that is not root, with no fixable high or
  critical vulnerability.
- **Security-relevant actions are audited**: who did what to which object,
  when and from where, in a record the actor cannot change.
- The project checks itself against `<OWASP ASVS, at its latest version,
  at the level its ADR names>`.

## Performance

- **Budgets, measured.** The time of the main requests and pages (at the
  95th percentile), the size of what a browser loads, and the cost of the
  heavy jobs are written as numbers in the project's ADRs, and a check or a
  measurement holds them. Without a number there is no claim of
  performance.
- **Measured before it is optimised.** A change made for speed shows the
  measurement before and after.
- **Lists are paginated** on the server; a page never loads a whole
  collection to show a part of it.
- **No N+1 and no waterfall.** Related data is read in one query or in
  parallel.
- **Queries have their indexes**, and the plan of a query on a large table
  is read before it ships.
- **Work that waits is not done in a request.** What takes longer than the
  request's budget goes to a job, and the caller is told how to follow it.
- **Caches** only for data that may be stale for a known time, with that
  time and the way it is cleared written beside it.
- **Interfaces load what they show**: code split by page, heavy libraries
  loaded where they are used, nothing recomputed at each render that did
  not change.

## Reliability

- **Every outbound call has a timeout** and a defined behaviour when it
  fails.
- **Retries** only for operations that are idempotent, with backoff and
  jitter and a bound; never to get past a race.
- **A dependency that fails is contained**: one failing part does not take
  down the page or the process; a call to a service that keeps failing is
  stopped for a while instead of piling up.
- **Background work is idempotent** and run by a scheduler or a queue that
  delivers it again after a crash, so that a restart or a second replica
  does not lose or double it.
- **Stateless processes.** State is in the database, the cache or the
  queue, so replicas are interchangeable.
- **Graceful start and stop.** A process says it is ready only when it can
  serve, and alive while it runs; on a stop it finishes or hands back what
  it holds within a bound.
- **Back-pressure.** A queue, a pool or a buffer has a bound, and what
  happens when it is full is decided.
- **Backups and restore.** The data is backed up as the ADR says, and a
  restore is tried on a schedule; a backup never restored is not counted.
- **Deploys can be undone.** A release can be rolled back without losing
  data, which the rule of migrations of the
  [code standards](./code-standards.md#data-and-persistence) makes
  possible.

## Accessibility

The project targets WCAG 2.2 level AA. An automated audit checks every
page in every theme; a failure that stays is recorded with its reason,
never silenced.

- Every control has an accessible name; every field has a visible label.
- Everything works with the keyboard alone, and the focus is visible. When
  a view replaces another, the focus moves to where the user continues.
- Text and the borders of controls meet the contrast ratios, checked by
  the tokens' tests.
- Motion respects `prefers-reduced-motion`.
- Information is never carried by colour alone.
- Errors of a form are announced, and say how to correct them.

## Visual quality

An interface is not done while anything in it is misaligned, overlaps,
is out of proportion or is too small or too large for the page around
it. Each of these is a bug of its class, held by a check, not a matter of
taste.

- **Alignment.** Elements of one row share their centre line, or their
  baseline when they hold text. Text sits centred in its control, within
  one pixel. An icon beside text is centred on the text, not on its box.
  Elements of one column share their edges.
- **One height for one row.** Controls side by side (inputs, selects,
  buttons, chips) have the same height, padding, radius and font; the
  heights come from one scale of the design (such as 28, 32, 36 and 40
  pixels).
- **Native controls take the design.** A select, a date field, a checkbox
  or a scrollbar is styled from the tokens, with the design's own marks
  (a chevron, a tick); the browser's default look is never left beside
  the design's controls.
- **Nothing overlaps** that is not made to: no box of an element crosses a
  sibling's or leaves its container, and a layer above the page (a menu,
  a dialog, a toast) covers what it means to and is placed from the same
  box it belongs to.
- **One coordinate system.** An element placed from the measure of
  another (an indicator under the current item, a popover beside its
  button) is measured in the frame it is placed in, from the same
  container, so that a padding or a scroll cannot shift it.
- **Proportion.** Type, spacing, radii, icon sizes and control heights
  come from the design's scales and nothing between them; an icon is
  sized to its text (16 pixels beside 14-pixel text); a heading, a number
  or a control is not larger or smaller than its role among its
  neighbours.
- **Text fits.** Text wraps, or is cut with an ellipsis and its whole
  value shown on pointing; it is never clipped, never pushed outside its
  box, and never makes the page scroll sideways.
- **Everywhere.** The rules hold at every width the project supports
  (at least a phone, a tablet and a desktop), in every theme, at 200%
  zoom, and in every state: pointed at, focused, open, selected,
  disabled, empty, loading, an error.

What holds them:

- **An audit of the rendered pages**, in the end-to-end suite, on every
  page at each width, theme and state: it fails on boxes of siblings
  that cross, an element outside its container or the viewport, text cut
  without an ellipsis, controls of one row that differ in height, text
  off the centre of its control by more than a pixel, and a size off the
  design's scales. A visual bug found by a person gets a rule in the
  audit before it is fixed, so that its class cannot come back.
- **Screenshots compared with the accepted ones**, at each width and
  theme; a difference is accepted by a person, never by updating the
  screenshot to make the check pass.
- **A look before submitting.** A task that changes the interface puts
  screenshots of what it changed, at a phone's width and a desktop's,
  into its Log, and its reviewer looks at them and at the page.

## Observability

- **Logs are structured**: a message and fields, saying what happened and
  to what, with no secret and no personal data.
- **An error is logged once**, where it is handled, with its cause.
- **Every request and job has a correlation id**, carried to the calls it
  makes and into every line it logs.
- **Metrics**: the rate, errors and duration of each entry point and job,
  and the saturation of each pool and queue.
- **Traces** across processes, by `<OpenTelemetry>`, where a request
  crosses more than one.
- **Health** is exposed as readiness and liveness, apart from metrics.
- **Objectives and alerts.** The ADR of operations names the objectives of
  the main paths (availability, latency) and alerts on their breach, not on
  every error.

## Privacy

- Only the personal data a feature needs is collected, and it is kept only
  as long as the feature needs it; its retention is written and enforced by
  a job.
- Personal data is classified where it is declared (in the schema), so
  that logs, exports and backups know what they hold.
- A person's data can be exported and deleted on request, across every
  module that holds it.
- Email addresses, names and tokens are never written to logs.

## Internationalisation

- Text a user reads is in the messages of the interface, with
  placeholders; no sentence is built by joining translated fragments.
- Dates, times, numbers and currencies are formatted for the user's
  locale and zone; they are stored in a neutral form (UTC, a decimal and
  its currency).
- The layout survives longer text and a direction from right to left where
  the project supports one.

## Operability

- **Configuration from the environment**, validated at start; the same
  image runs in every environment.
- **Features can be turned off** without a deploy where the ADR asks for it,
  and a flag is removed once its feature is settled.
- **Every environment is described in the repository**, from the local one
  to production, and made from that description.
- **Runbooks**: what an operator does for each alert, next to the alert.

## Upgradability

- Public, documented interfaces of libraries and frameworks are used, at
  their latest release.
- What depends on another's internals is listed in one place, with the
  file of the other it depends on, so that an upgrade re-checks it.
- The project's own published interfaces follow the rules of
  compatibility of the [code standards](./code-standards.md#apis).
