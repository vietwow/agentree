/** What the board refuses, said in words a worker can act on. Anything else thrown is a fault. */
export class Refusal extends Error {
  override name = "Refusal";
}

/** A task file that changed between a change's read and its write: the change decides again. */
export class Changed extends Error {
  override name = "Changed";
}
