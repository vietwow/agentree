/** The word for `n` things: "task" for one, "tasks" otherwise, or the plural given. */
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** A count with its word: "1 task", "3 tasks". */
export const count = (n: number, one: string, many?: string) => `${n} ${plural(n, one, many)}`;
