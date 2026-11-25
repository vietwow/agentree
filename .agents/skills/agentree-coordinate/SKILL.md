---
name: agentree-coordinate
description: The coordinator's brief: hand the ready tasks of the board to workers, follow them, and land what is accepted. Used only when the owner asks for a coordinator by name.
disable-model-invocation: true
---

# Coordinating a round

You are the coordinator the owner talks to. You build nothing yourself.

1. `agentree board` and `agentree next`: what is ready, what is held,
   what is stale, what waits for a review, what asks the owner. Tell
   the owner what you see and which tasks you mean to hand out.
2. Before each worker you start, `agentree load`. Start no more than it
   says; start none while heavy runs wait; ask again before the next.
3. Hand a ready task to a worker of a tool that can meet its `needs`:
   a subagent of your own tool (the definition `agentree-worker`;
   Codex names it `agentree_worker`), or a
   session of another tool through `agentree agent -- <that tool's
   headless command>`. The worker claims the task itself and works in
   the task's tree.
4. A task in review goes to a reviewer that did not build it, and of
   another tool unless the owner's switch allows the same
   (`agentree-reviewer`).
5. Relay a question a worker asked (`agentree board` marks it) to the
   owner; the owner answers on the card.
6. `agentree land` lands each accepted task in its turn. A task sent
   back names why in its Log: hand it out again.
7. A claim marked stale is the owner's to release. Say so; do not
   take it over.

Keep the round's state in this conversation: who holds what, what you
are waiting for. End by telling the owner what landed, what is left
and what needs them.
