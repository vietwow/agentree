# Working in this repository

Rules for every AI agent and person working here, whatever the tool.

## Now

The backend is being built from
[`rfcs/0001-agentree/README.md`](./rfcs/0001-agentree/README.md), in the
order of its steps, while it stays a draft (the owner's answer of
2026-11-24): the RFC follows the code, in the same change. What is built
is listed in [`README.md`](./README.md). Verify every claim the RFC
makes, and bring the owner its open questions.

The origin of the design is a sibling checkout, `../aep`. Read it; never
change it from here. What to read there is in
[`docs/origin.md`](./docs/origin.md).

## Rules

- Reply to the owner in Vietnamese. Code, documents and commit messages
  are in English.
- Say only what has evidence. A fact about a tool, a library or an API is
  checked against its documentation or its source, and what was not
  verified is said plainly.
- Nothing is committed and nothing is pushed until the owner says so. The
  remote may be public.
- No file names the owner, their email address, their organization, or a
  path of their machine (a home directory, a session's scratch
  directory). Paths are relative to the repository.
- A design decision is written down (an RFC or an ADR) before it is built.
- Comments and documents describe the system as it is, in the present
  tense, never how it got there.
- Every library and tool is on its latest release.

<!-- agentree:start -->

## Taking work

The work of this repository is on a board: one task a file, read and
written only through `agentree` (the command) or its MCP tools of the
same names. No task file is edited by hand, and none is in your tree.

Name yourself by tool and model, never by a person: `<tool>/<model>`,
as `claude-code/opus-5.5` or `codex/gpt-5.6`, in `AGENTREE_WORKER`
for the command and in `worker` for a tool call, with your session's id.

1. `agentree next` lists the ready tasks and what keeps each from being
   claimed. `agentree claim T-NNNN` takes one and prints its tree, its
   brief and what the project remembers for it. A session holds one task.
2. Work only in the task's tree, on its branch, and change only the
   paths under its `writes`; in a file under `appends`, add only.
   Commit there (`agentree commit T-NNNN -m ...` when you cannot).
3. Run every command of the project through `agentree run T-NNNN --
   <command>`: a heavy one waits for its turn on the machine.
4. A question for the owner goes on the card: `agentree ask T-NNNN`.
   The task stays yours; read the answer with `agentree wait T-NNNN`.
5. Before you stop, whatever the reason, `agentree log T-NNNN`: what was
   done, the checks and their numbers, what is left, what you found
   wrong outside your paths, what was not verified.
6. `agentree submit T-NNNN` when "Done when" holds. Its checks run in
   the queue; take your next task meanwhile. `agentree release T-NNNN`
   gives it back unfinished, with what the next worker starts from.
7. Never review a task your session built. `agentree review T-NNNN`
   marks a task as yours to review; read its diff against its base in
   its tree, run its checks again, then `agentree accept` or
   `agentree reject` with findings, each one checkable.
8. Before you start another agent, `agentree load`: start no more than
   it says, and none while heavy runs wait.

Never: edit outside your task's paths; edit another task's file or
Log; run git in the main checkout or in another's tree; push or fetch.
What the project should remember goes to `agentree remember`.

<!-- agentree:end -->
