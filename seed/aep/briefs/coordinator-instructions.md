# Coordinator instructions per task (2026-11-21, evening)

Each section is what the coordinator told the worker of that task before
the session that held it was stopped by a usage limit. A new worker
taking the task over reads its own section, then the task's Log (above
all the last reject entry), and acts on both. These are the
coordinator's words, not the owner's; where the task's Log or AGENTS.md
disagrees, they win and you say so in the Log.

Rules that hold for every provider task (T-0060, T-0066, T-0067, T-0068,
T-0069), learned from today's reviews:

1. An answer that is no list is never read as an empty list: require
   the list's key (`items`, or the API's own), present as an array or
   `null`; anything else is `unexpected_answer` and never a complete
   pass, a count of 0, an object or a removal. Test `{}`, an error body
   with status 200 and a `Status` body, for the pass, the counts and
   the read of one object, each failing without the fix.
2. A batch that ingestion refuses (`ingestion_pass_not_running`,
   `ingestion_backlog_full`) never lets a pass end complete; no error
   is swallowed on the path that ends a pass.
3. A kind is handed over only once the kinds it relates to are mapped,
   as a condition, never a delay.
4. A reader that is a job must not wait in a loop for the
   `ingestion.map-batch` jobs of its own batches while holding a worker
   slot and its job's open transaction: with as many readers as a
   worker has slots (`AEP_WORKER_CONCURRENCY`, default 4) nothing is
   mapped. Bound it and state it, and name T-0671 (the shared reader,
   backlog) for the proper shape.
5. `passes.start` refusing with `ingestion_pass_ending`, and an `end`
   on an aborted pass, must not make a dead job.
6. Every thing left is named with a task that really holds it. T-0275
   reads no provider's source. T-0542 is done and `providerPack`
   exists. T-0657 holds the kinds a pass keeps. T-0671 holds the shared
   reader and client. A task you file with `task new` you write in full
   (Context, Done when, Out of scope) by editing its own file.
7. T-0655 (in progress) changed `modules/providers/src/contract.ts`: a
   stream of events may now return a `Refusal`. Meet the contract as it
   is when you submit.
8. Keep the tree compiling between edits: a file that does not parse
   fails every other worker's checks.
9. Before you submit, name per check what fails outside your task, with
   file and line.

## T-0060 (GitHub source), rejected 18:29 by r27

1. A test that fails unchanged, and a missing reader rule.
   `pass.integration.test.ts` hands over the `workflow_run` and
   `workflow_job` batches back to back and asserts `failed: 0`; a job
   mapped before its run is a failed entity (4 of about 13 runs). Hold
   rule 3 in the reader (`relatedKinds` of
   `modules/provider-aws/src/pass.ts` holds it), state it in the
   README's "rule that binds every reader", make the test
   deterministic. The second test restores the shared fake only after
   its assertions (line 258): restore it in a `finally` or `afterEach`.
2. Untrue statement: README and Log say a provider "cannot add a
   property to a canonical blueprint yet (T-0542)". T-0542 is accepted.
   Declare the `github_*` properties the research names through
   `providerPack`, or say exactly what still blocks it and file the
   task; correct the README.
3. File tasks, written in full, for: (a) blueprints for repository and
   pull request (T-0506 does not mention them); (b) GitHub declares
   `pull_request`, `workflow_run` and `workflow_job` as never removed
   by a full pass (T-0657 now lists this package under `appends`: read
   it and note there what it lacks for GitHub, or file GitHub's own);
   (c) the delivery route that verifies GitHub's signature (nothing
   compares a signature today; T-0056 puts each provider's webhook out
   of scope). Name each in the README's "Not built"; do not claim
   webhooks are verified.
   From the notes, fix in your paths: a `link` header to another host
   throws a plain `Error` where the README says `provider_unavailable`
   (never follow it to another host with the token); a secondary-limit
   `403` with neither header becomes `access_refused`; more than 1,000
   runs within one second are truncated and the pass still ends
   complete (end it `complete: false` or split the window);
   `response.text()` has no size bound; the README misquotes the
   `X-GitHub-Delivery` description; the test reader's `applyDelivery`
   drops `removed` events. Run the integration test at least ten times
   before you call it deterministic.

## T-0066 (Argo CD source), rejected 18:43 by r29

1. `itemsOf` in `src/objects.ts` takes an object with no `items` key
   for an empty list: rule 1. At v3.6.2 the four list types always have
   the key (array or `null`). An answer to `readObject` that is not the
   object is not a removal.
2. The production reader is handed to T-0275, which does not hold it.
   File a task for this package's reader as a job (rules 2 to 5, the
   `application`-before-`deployment_run` order, `deployment_run` in
   batches of no pass until T-0657, the pack README's example
   identifier against yours; note that two operations of one
   application in the same second would merge). It builds on T-0671 if
   that lands first. Correct the README, the comment in
   `src/testing/readSource.ts` and the Log.
   Notes: the README overstates the deletion guard for a token that
   lost a policy (losing one project of several gives a shorter list;
   at half a blueprint or less the guard does not hold and entities are
   removed): say it plainly and say what an operator sees
   (`completed_with_issues`, `heldRemovals`, confirm or discard). Cite
   or remove the "200 MiB" in a `client.ts` comment.

## T-0067 (Kargo source), rejected 18:46 by r31

1. `recordsOf` in `src/provider.ts` turns anything that is not an array
   into `[]`; `places` turns a non-object body into no items: rule 1,
   for `items` and `groups`, in pass, places and counts; a project item
   without a name refuses the list; decide and state what a 404 on
   every route under a listed project means (never complete and
   empty). `list_projects.go` returns all projects unless `mine=true`,
   so a one-project token lists projects it cannot read and its pass
   never ends complete: handle or state it.
2. Untrue statements: the README and Log hand `kargo_phase` and a
   promotion's stage and freight relations to T-0542, which is done.
   Build them now through `providerPack` (`modules/packs/README.md`,
   `src/kinds/canonical/<blueprint>.json`) or file the task and say
   what really blocks it. The README names T-0275 for "one reader for
   every provider": that is T-0671.
3. The wait for mapped batches stalls the workers: rule 4. The right
   shape is a job per kind with the next enqueued by an ingestion
   event (`handleJob(kind, handler, { on: event })`, if ingestion
   publishes one; check `modules/ingestion` and T-0646). If that can be
   built within your paths, build it; otherwise bound the damage (at
   most one reader at a time by an idempotency key held while it runs),
   state its cost in the README, and file the task for the event,
   linking T-0671. Say which you did and why.
   Smaller: `passes.start` with `ingestion_pass_ending` outside any
   `try` makes a dead job, exactly when a pass runs out of time
   (`timeoutMs` 900,000 equals the period): rule 5, and make the
   timeout shorter than the period; an end on a pass aborted after its
   last batch throws `ConflictError`: rule 5; `subjectKeyOf` is read
   only by the test helper: use it or remove it. `tsc` has 3 errors in
   `src/provider.test.ts` (lines 253, 254, 261) from rule 7. Run the
   connectors parity part once with your tile in
   (`E2E_PORT_OFFSET=92 PLAYWRIGHT_CHANNEL=chrome ... e2e --project=parity -g connectors`)
   and report whether measured neighbours shift.

## T-0068 (Argo Rollouts source), in progress, not yet submitted

For hours the package failed every other worker's checks: a typecheck
error at `src/pass.ts(515,13)` (TS2353), `no-swallowed-error` at
`src/pass.ts:223` and `src/pass.integration.test.ts:253`, and Prettier
on 10 files. Get the tree clean first (tsc, oxlint,
`yarn lint:code-rules`, prettier on the package), then finish under
rules 1 to 9. Earlier coordinator guidance still holds: call
`passes.start`, `batches.submit`, `passes.end` yourself; follow the
research on the credential (the placed process's own service-account
token, nothing stored) and say in the README where "Done when" differs;
do not let a full pass remove pruned `argorollouts_analysis_run` and
`argorollouts_experiment` runs (keep them out of the pass's removals,
or leave the two kinds out of this task) and name T-0657 for "never
removed by reconciliation".

## T-0069 (AWS source), rejected 18:46 by r30

1. A pass can end complete and short: `listResources` in `src/aws.ts`
   reads `answer.ResourceDescriptions ?? []` and drops a description
   without `Identifier`; `propertiesOf` gives `{}` for properties
   missing or not an object. Rule 1, and also: a `GetResource`
   answering `{}`, an empty body or `Properties: "[]"` must not hand the
   resource over under a made-up identifier; a `NextToken` of `""` is
   not followed for ever; `{"ResourceDescriptions":"none"}` and
   non-JSON `Properties` are `unexpected_answer`, not internal errors.
2. Security: the external id is the organization's to choose (whatever
   it writes through `POST /v1/organization/secrets`), while every
   organization's roles are assumed from one workload identity. AWS's
   confused-deputy page says the external id must be controlled by the
   service, not its customers. The external id has to be generated by
   AEP, unique to the organization (or the instance), shown to the
   organization for its trust policy, and never accepted from it. If
   the contracts of `@aep/providers` and `@aep/secrets` lack what that
   needs, do not work around it: write the smallest safe thing in your
   paths (for example refuse to assume a role unless the external id is
   one AEP derived for that organization), file the task for what is
   missing with the evidence, and say plainly in the README what holds
   today. Correct the sentence that claims one-per-organization keeps
   organizations apart.
3. Events: a message naming a resource whose `GetResource` AWS refuses
   for good (`403`, `request_refused`, `type_not_supported`) is never
   deleted, fails the job each time and holds back the messages after
   it; one message may name any number of ARNs (1,000 serial reads in
   the probe). Bound the ARNs from one message, treat a permanent
   refusal as handled (logged, message deleted), keep a temporary one
   for a retry, and state it in the README.
4. Leftovers: file in full and name in the README: `service_part` and
   the `service` mapping from `aep.io/service` for AWS (Kubernetes has
   T-0669); "a removal told by an event" and "what starts a reading of
   events" (Kubernetes has T-0668); the counts from a second system;
   the two "No task yet" rows (the integration made with the instance:
   see T-0663; the source in a placed agent).
5. Untrue: "a pass that is not over in an hour ends as not complete"
   (at the job's timeout the budget is spent and `endAs` is refused;
   the pass stays `running` until a later start aborts it): say what
   happens, or end the pass before the budget runs out. The README
   cites [4] for `ExpiredToken`, whose page defines it otherwise.
   Notes: `AssumeRole` hard-wired to `us-east-1` is said only in a
   comment; the README's account of the SDK's default credential chain
   omits static keys and endpoint variables from the environment (say
   what an operator must not set); `listKind` accepts `resume` and a
   caller that passes it gets a short pass that ends complete; two
   instances read into one integration abort each other's passes and
   the one that completes removes the other's entities (refuse or
   state); the job's hour is not enough for the largest configuration;
   rule 4.

## T-0626 (held removals), rejected 18:46 by r28

The confirmation path held against everything tried. The reviewer's
added tests are in `scratchpad/r28/extra.ts` (hints only).

1. Discard is a defect. After a discard, each later complete pass makes
   the model serve the discarded entities as confirmed by a pass that
   did not bring them (the blueprint has nothing missing, so it is
   confirmed, and the model's confirmation covers every entity whose
   `holder` is the source). The fix needs a call of `@aep/model-store`
   that gives up a holder, or confirms only the entities a pass names;
   that is outside your paths. File that task in full for
   `modules/model-store/`, then decide with evidence: (a) discard can
   be made correct within your paths (for example the discarded
   entities stay counted as not brought, so their blueprint is not
   confirmed, and the README says so) and you build and test that; or
   (b) it cannot, and the `discard` route does not ship: take it out of
   what the module registers (with its coverage case and README
   section), keep `confirm`, and file what is left of discard as a task
   that depends on the model-store one. No "No task yet".
2. Untrue statements about the JQ thread (README, comments in
   `src/jq.ts`, the Log): "the thread never keeps the process alive"
   (the piped stdout and stderr hold it; `unref()` does not release it;
   no real role is affected because `apps/server/src/main.ts` calls
   `process.exit()`) and "ended when the process is told to close" (the
   `worker` role builds its health server with `modules: []`, so
   `shutdown` never fires there). Say what is true; if the thread can
   be made not to hold a process, do it with a test that a process
   exits. Whether the worker role should fire `shutdown` is not yours:
   file a task if none holds it.
3. A batch of no pass does not count as bringing an entity (held 8 of
   10, a no-pass batch re-brings one changed, confirm removes it).
   Decide whether the removal must re-check, at the moment of removal,
   that the integration did not write the entity since the pass's count,
   and build that if it is within your paths; at least state it in the
   README for T-0056.
   Put into the Log the reject entry's notes for the owner, T-0056,
   T-0275 and the provider tasks. Run `test:demo` once at the end.

## T-0615 (users page sort), rejected 18:02 by r25

The fix of the reject entry: the hook stops adding `commands`; `sorted`
stays; `UsersPage.tsx` gets back its `useMemo` that gives its columns
`commands: { hide: true }`; the README says which columns offer `Hide
property` stays the page's to say. T-0629 (now in review) wrote
`tableView.ts` and `tableView.test.ts` after this task: build on the
tree as it is. Run the whole `e2e/gallery.test.ts` and the users'
tests.

## T-0654, T-0655, T-0667: in progress, not yet submitted

No new instruction beyond the task and its Log. T-0655: list in the Log
every package outside your paths that your change to the contract
breaks, with file and line (`tsc` showed 3 errors in
`modules/provider-kargo/src/provider.test.ts`); a change that breaks an
accepted package (`provider-kubernetes`, T-0061 done) keeps it
compiling or is handed to a task you file. T-0667: T-0638 (in review)
added a retry route and a test of three retries at once; build on the
tree as it is, and decide whether a retry counts against the bound.

## Owner's answers, 2026-11-21 (relayed by the coordinator from chat)

- T-0494: the worker may take it; `owner` is out of `needs`. Tokens
  `syntax-comment` and `syntax-keyword` in `@aep/design-tokens`, WCAG AA
  contrast checked in light and dark; Geist Mono (`font.mono`) loaded as
  `--font-mono`; the audit's rule `type` checks the text in a `pre` too.
- T-0070, `checked_at`: written at EVERY comparison the job makes, also
  when the result did not change. That is the accepted design's meaning
  (RFC 0007 design/cloud-pages.md, the row "Checked": "When the job last
  compared"), and the status `No answer` needs it. When the result
  changes there are two fields of their own: `differs_since` and
  `resolved_at`.
- T-0626, scope: `update:integrations` stays the scope of both confirm
  (which leads to removals) and discard. It is an operation of the
  connector (RFC 0005 design/platform.md 4.3: "an admin confirms or
  discards the held removals on the connector"), and a pass's clean-up
  is not limited by blueprint permissions (4.1: "Integrations are machine
  identities; blueprint permissions do not restrict reconciliation").
  Only the Admin role holds `update:integrations`. Every entity removed
  still has an audit entry of its own.

## Ask before full parity (owner, 2026-11-23)

Before a task whose checks run parity on every part is claimed or submitted, ask the owner in chat: the task, what it changes, why it must reach what every part shares, the cost (~40-50 min). Check with `node <scratchpad>/parity-reach.mjs T-NNNN` (needs an e2e check and parts=every). See work/agreements.md.
