# Code standards

How code is written in this project. [`AGENTS.md`](../../AGENTS.md) states
the rules; this page says what each means in practice. What a machine can
check is checked, by a check named in `agentree.config.*` that every
submit runs; the rest is the reviewer's judgement, and the review asks for
it.

Words written in `<angle brackets>` are filled from the project's ADR of
its stack: the language's names for a module, an interface, a schema.

## Long-term solutions

Every fix and every feature is built to last. The test: if the same kind of
problem appeared somewhere else tomorrow, would this change already handle
it, or would someone fix it again?

A change is a long-term solution when it:

1. **Finds the root cause.** The problem is reproduced and explained before
   code changes. A fix without an explanation is a guess.
2. **Fixes it in the layer that owns it.** A wrong colour is a token
   problem, not a page problem. A slow query is fixed in the query or its
   index, not by caching one caller. A missing capability goes into the
   module every consumer uses.
3. **Fixes the class, not the instance.** The kind of problem is named and
   every place it occurs is fixed.
4. **Adds a guard.** A test that fails without the fix, a check, a rule of
   the architecture, a type that makes the wrong state unrepresentable. The
   guard that runs everywhere is preferred to the one that tests one case.

These are band-aids, and are not accepted:

| Band-aid                                                         | Instead                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A special case for one caller in shared code                     | The shared code handles the general case, or offers an extension point |
| A delay, a retry or polling to get past a race                   | Wait for the event or the state that matters                            |
| An error caught and dropped with no stated reason                | Handle it, or let it reach the boundary that handles it                 |
| A suppression of a type or lint error to make a check pass       | Fix the type or the code; a suppression needs a written reason          |
| A value copied from configuration, tokens or another module      | Read it from its one source                                             |
| Code copied from another module                                  | Move it to the module that owns it, or a shared one, and use it there   |
| A test or rule disabled, skipped or loosened to get green        | Fix the code, or fix the rule if the rule is wrong                      |

When the right fix lives upstream or needs a decision first, the
workaround is explicit, never silent: isolated in one place (an adapter, a
module that owns it), commented with what it works around and when it can
go, referenced from a `TODO(<task or ADR>)`, and named in the task's Log.

## Architecture

The code is arranged so that what the system does does not depend on how
it is delivered, stored or shown.

### Modules by what they do

- **A module is one area of the domain** (a bounded context): its rules, its
  use cases, its data and the adapters to the outside. It is named after
  what it does (`billing`, `accounts`), not after a technical layer
  (`services`, `utils`, `helpers`).
- **A module has one public interface**, its entry point. Another module
  uses it only through that interface, or through the events it publishes;
  it never reaches into its files.
- **A module owns its data.** Its migrations create its tables; no other
  module reads or writes them, in SQL or through a query builder. It asks
  the owner's interface instead.
- **No cycle** between modules. A rule both need moves to the module it
  belongs to, or to a shared module that depends on neither.
- Whether the modules run in one process (a modular monolith) or as
  services apart is a decision of the project's ADR of its stack. The rules
  above hold either way; services apart add the network to every call
  between them, and the rules of [Reliability](./non-functional.md#reliability).

### Layers inside a module, and the rule of dependencies

| Layer          | Holds                                                                                               | May depend on                 |
| -------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| Domain         | Entities, value objects, the rules and invariants of the business, domain errors and events         | Nothing outside the domain    |
| Application    | Use cases: one action of a user or a system each, the transaction around it, the ports it needs     | The domain                    |
| Adapters       | What turns the outside into calls of the use cases and back: HTTP handlers, repositories, clients, presenters, jobs | The application and the domain |
| Infrastructure | Frameworks, drivers, the database, the composition root that wires it all                           | Everything                    |

- **Dependencies point inward.** The domain imports no framework, no
  database, no HTTP, no logger, no clock and no configuration. The
  application imports no adapter.
- **Ports belong to the inside.** The application declares the interface
  it needs (`InvoiceRepository`, `PaymentGateway`, `Clock`) in its own
  words; an adapter outside implements it. The inside never names the
  library the adapter uses.
- **Boundaries carry data, not objects of another layer.** A request body,
  a row and a response each have their own shape; adapters map them to and
  from the domain. A domain type never leaks into a public API or a table
  as it is.
- **One composition root.** Implementations are chosen and wired in one
  place at start-up and handed to what needs them. No service locator, no
  global or singleton reached from inside, no configuration read from the
  environment below the composition root.
- **Time, randomness and identifiers are dependencies.** Code that needs
  the time, a random value or a new id is handed a clock, a source of
  randomness or an id generator, so that tests set them.
- **In proportion.** A module whose rules are trivial (a read of a table
  shown as it is) may have its adapter call a repository directly, without
  a use case; it still keeps the rule of dependencies. Layers are added
  when there is logic to put in them, not in advance.
- **Checked.** The import rules (no cycle, nothing into another module but
  its entry point, the domain importing nothing outside it, a module's
  tables named by it alone) are a check of `<the stack's import checker>`
  that every submit runs.

### SOLID

| Principle                 | What it means here                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single responsibility     | A unit (a module, a class, a function) has one reason to change: one actor or one concern asks for its changes. A file does one thing and is named after it; it is split when it needs a heading comment to find one's way. |
| Open for extension, closed for modification | A new case is added through an extension point (a new implementation of a port, a new entry of a registry, a new handler of an event), not by an `if` for one caller in shared code. |
| Liskov substitution       | Every implementation of an interface keeps its contract: what it accepts, what it returns, the errors it raises, its effects. A contract test runs against every implementation, the fakes of the tests included. |
| Interface segregation     | An interface is sized to its callers: a caller depends only on what it uses. A port with methods some callers never call is split.                                                                       |
| Dependency inversion      | Policy does not depend on detail. The inside declares the port, the outside implements it, the composition root binds them ([Layers](#layers-inside-a-module-and-the-rule-of-dependencies)).              |

### Design

- **No speculative generality.** Built for the cases in front of the code,
  with the seam left for the next one. A shared abstraction is extracted
  when a second real consumer appears, and then properly. A port is
  declared where the implementation is outside the process (a database, a
  service, the clock) or where a second implementation exists; a fake for
  the tests is one.
- **Composition over inheritance.** Behaviour is shared by composing units
  and by interfaces; inheritance only for a true "is a" with a contract
  the subtype keeps.
- **Functions.** Small, one level of abstraction each, few parameters (an
  object of named fields past three), early returns over nesting. A
  function either does something or answers something, not both
  (command–query separation).
- **Pure where it can be.** Rules, parsing, validation and state
  transitions are plain functions of their inputs, tested without I/O.
  Effects are pushed to the edges.
- **Immutable by default.** Values are not changed after they are made; a
  change makes a new value. Mutable state is local, owned by one unit, and
  never shared between concurrent work without the means the language
  gives for it.
- **Invalid states unrepresentable.** A union of states over a set of
  booleans; a value object (`EmailAddress`, `Money`) that is valid when it
  exists, over a string checked in many places.
- **Nothing unused.** Code, exports, files and dependencies that have no
  effect are deleted in the change that makes them so; version control
  remembers them. A check finds them; what it cannot see used is listed
  beside its configuration with the reason.
- **An interface may come before its feature.** A control whose feature is
  not built yet is shown disabled and marked as coming, with the task that
  builds it. A control that does nothing and says nothing is a bug.

## Naming

- Names say what something is for, not how it is built or where it came
  from.
- Functions are verbs, types and components are nouns, booleans read as a
  question (`isPending`, `hasAccess`).
- A unit is in the name of a number that carries one (`timeoutMs`,
  `sizeBytes`).
- The domain's words are the code's words: a term of the business has one
  name, the same in the code, the API, the database and the interface.
- No abbreviation a newcomer would have to decode; common ones (`id`,
  `url`, `api`) are fine.
- A file is named after its main export. Two names in one directory never
  differ only in case.

## Types and data

- The strictest settings the language's checker has. No escape from the
  type system (`<any>`, unchecked casts) where a check is cheap; an
  unknown value is narrowed before it is used.
- Data from outside the process (a request, configuration, storage, a
  message, a file, a model's answer) is validated where it enters, with
  `<the stack's schema library>`, before it is trusted.
- Money is never a floating-point number. Times are stored and exchanged
  in UTC with their zone, and shown in the user's.

## Errors

- **Never swallowed.** An error is handled, or reaches the boundary that
  handles it. An intentional ignore says why it is safe.
- **Errors of the domain are types of the domain** (`InvoiceAlreadyPaid`),
  raised by the domain and mapped to a status, a message or a retry by the
  adapter at the edge. The domain knows no HTTP status.
- **One way per layer.** Each layer either throws or returns results for
  the failures it expects, by the stack's ADR, and does not mix the two.
  Control flow does not run through exceptions.
- **The cause is kept.** An error wrapped by another keeps the first as its
  cause.
- **What a user sees** is a short message in their language; details go to
  the log, never to the user.
- **Failing early.** A broken invariant or a missing configuration stops
  the operation, or the start, at once and says what is wrong.

## Values and configuration

- **Every value has one source.** The product's name, colours, sizes,
  spacing and type come from one place each (tokens for the interface).
- **Configuration** that differs between environments is read once, in the
  composition root, from the environment, validated against a schema, and
  handed down as a typed object. A missing or invalid value stops the
  start.
- **No magic numbers.** A number that means something is a named constant
  beside the code that uses it, or a token.
- **Text a user reads** is in the messages of the interface, not inline in
  code.

## Concurrency

- Shared mutable state is avoided; where it is needed, one owner and the
  means the language gives for it.
- Every wait has a bound, and long work can be cancelled (`<the stack's
  cancellation>`), passed down to what it calls.
- An operation that can be repeated (a retry, a redelivered message, a
  double click) is idempotent, by a key or by its nature.
- A race is fixed by ordering or by a condition on the data (a
  transaction, a unique constraint, a version compared on write), never by
  a delay.

## Data and persistence

- The database holds the invariants it can: keys, uniqueness, foreign
  keys, `not null`, checks. The code does not trust itself alone to keep
  them.
- **Migrations go forward**, each in its own file, never edited once it has
  run anywhere. A change that would break a running version is split
  (expand, move, contract), so that the old and the new code run side by
  side.
- **The transaction is the use case's.** It is opened and closed in the
  application layer, never inside a repository method that another
  repository's write must join.
- Queries are parameterised; no query is built by joining strings with
  input.
- What a query reads is bounded: a list is paginated, an export streams.

## APIs

- **Designed from its consumer.** A public API (HTTP, a message, a module's
  interface) says what it accepts, what it returns and its errors, in a
  description that a check holds the code to (`<OpenAPI, a schema, types
  generated>`).
- **Compatible.** A published API changes by adding; a removal or a change
  of meaning is a new version, and the old one stays for the time the ADR
  says.
- **One shape of error** for every route, with a stable code a client can
  test.
- **Paginated, filtered and sorted** on the server, with a bound on the
  page.
- A write that a client may retry takes an idempotency key.

## Comments and documentation

The rules are in [`AGENTS.md`](../../AGENTS.md): the present tense, the
current state only, the reason only where the code would look wrong
without it, no history, no provenance. A public export has a comment that
says what it is for. Each module has a README: what it does, its public
interface, its data, its configuration. A decision worth explaining is an
ADR.

## Tests

- **A bug fix adds a test that fails without the fix.** A change of
  behaviour adds the test of the behaviour.
- **By layer.** The domain and the use cases have unit tests with no I/O
  (fakes of the ports). Each adapter has integration tests against the
  real thing it adapts (the database, a service's test double that its
  owner publishes), not a mock of a library. The contract of a port runs
  against every implementation. A few end-to-end tests cover the flows a
  user cannot lose.
- **Deterministic.** No sleep, no real clock, no network to the outside, no
  order between tests; a test makes the data it needs and leaves none. A
  flaky test is a bug, with its own task, never retried until green.
- **Named for behaviour** (`refuses a payment of an invoice already
  paid`), not for implementation.
- **Through the interface a user or a caller has.** Interface tests find
  elements by role and label; unit tests call the public interface, not
  private members.
- Few thorough tests over many shallow ones. Coverage is read for what it
  shows untested, never held as a number to reach.

## Dependencies

- What the project already has is preferred.
- **Always the latest release**: libraries, the runtime (its latest
  long-term support), tools, CI actions and images. A release younger than
  a few days is skipped where the package manager can, so that a
  compromised release does not arrive the day it is published.
- **Held back only for a reason**, written beside the version: the
  verified bug or incompatibility and what has to change before it moves.
- **Locked.** The lock file is committed and every install is from it. A
  CI action is named by the commit of its release; a downloaded tool is
  checked against its digest.
- **A new runtime dependency is a decision**: its licence (permissive
  licences are fine; a copyleft one needs the owner's approval), its
  maintenance, its size where it ships to a browser, and whether a few
  lines of the project's own would do instead.
