/**
 * Reads a line of the shell as far as the repository's scripts need to:
 * its simple commands, each its words as the shell hands them to the
 * program, and the line a shell given `-c` runs.
 *
 * It is no shell. It knows white space, single and double quotes, the
 * backslash that keeps the next character as it is, and the operators
 * that end a simple command (`&&`, `||`, `;`, `|`, `&`). What else the
 * shell reads (substitutions, globs, redirections) stays in the words; a
 * `&` inside a redirection (`2>&1`, `&>file`) is part of its word.
 */

const OPERATOR_CHARACTERS = ';|&';

/** Whether the `&` at `at` belongs to a redirection rather than ending a command. */
function inRedirection(line, at, word) {
  return /[<>]$/.test(word ?? '') || line[at + 1] === '>';
}

/**
 * The tokens of a line: `{ word }` for each word, without its quotes and
 * the backslashes that only keep the next character, and `{ operator }`
 * for each operator, with `start` and `end`, its place in the line.
 */
export function shellTokens(line) {
  const tokens = [];
  let word;
  let start;
  let quote;
  const end = at => {
    if (word !== undefined) {
      tokens.push({ word, start, end: at });
      word = undefined;
    }
  };
  const add = (text, at) => {
    if (word === undefined) {
      word = '';
      start = at;
    }
    word += text;
  };
  for (let at = 0; at < line.length; at += 1) {
    const character = line[at];
    if (quote === "'") {
      if (character === "'") {
        quote = undefined;
      } else {
        word += character;
      }
    } else if (
      character === '\\' &&
      at + 1 < line.length &&
      (quote === undefined || '"\\$`'.includes(line[at + 1]))
    ) {
      add(line[at + 1], at);
      at += 1;
    } else if (quote === '"') {
      if (character === '"') {
        quote = undefined;
      } else {
        word += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      add('', at);
    } else if (/\s/.test(character)) {
      end(at);
    } else if (
      OPERATOR_CHARACTERS.includes(character) &&
      !(character === '&' && inRedirection(line, at, word))
    ) {
      end(at);
      const doubled = line[at + 1] === character;
      tokens.push({
        operator: doubled ? character + character : character,
        start: at,
        end: at + (doubled ? 2 : 1),
      });
      if (doubled) {
        at += 1;
      }
    } else {
      add(character, at);
    }
  }
  end(line.length);
  return tokens;
}

/**
 * The words of a line as the shell hands them to the program: split at
 * white space outside quotes, without the quotes and the backslashes that
 * only keep the next character as it is. An operator is a word of its own.
 */
export function shellWords(line) {
  return shellTokens(line).map(token => token.word ?? token.operator);
}

const EVERY_OPERATOR = ['&&', '||', ';', ';;', '|', '&'];

/**
 * The simple commands of a line, in order, each `{ words, text, operator }`:
 * its words (`shellWords`), its text as it is in the line, and the
 * operator that ends it (undefined for the last). A command with no words
 * (between two operators, or after the last) is left out. Given
 * `splitAt`, only those operators end a command, and any other is a word
 * of the command it is in (`simpleCommands(line, ['&&'])` gives the parts
 * of a list joined by `&&`).
 */
export function simpleCommands(line, splitAt = EVERY_OPERATOR) {
  const commands = [];
  let words = [];
  let from;
  let to;
  const close = operator => {
    if (words.length > 0) {
      commands.push({ words, text: line.slice(from, to), operator });
    }
    words = [];
  };
  for (const token of shellTokens(line)) {
    if (token.operator !== undefined && splitAt.includes(token.operator)) {
      close(token.operator);
      continue;
    }
    if (words.length === 0) {
      from = token.start;
    }
    words.push(token.word ?? token.operator);
    to = token.end;
  }
  close(undefined);
  return commands;
}

const SHELLS = new Set(['sh', 'bash', 'zsh']);

/** The options of a shell that take the next word as their value. */
const SHELL_VALUE_OPTIONS = new Set(['-o', '+o', '-O', '+O']);

/**
 * The line a shell runs when its words (`shellWords`) start it with `-c`,
 * alone or among combined flags (`sh -c`, `bash -lc`, `sh -e -c`):
 * the first word after its options. Undefined for any other command.
 */
export function shellScript(words) {
  if (!SHELLS.has(words[0])) {
    return undefined;
  }
  let command = false;
  for (let at = 1; at < words.length; at += 1) {
    const word = words[at];
    if (word === '--' || word === '-') {
      return command ? words[at + 1] : undefined;
    }
    if (SHELL_VALUE_OPTIONS.has(word)) {
      at += 1;
    } else if (/^[-+][A-Za-z]+$/.test(word)) {
      command ||= word.startsWith('-') && word.includes('c');
    } else if (!word.startsWith('--')) {
      return command ? word : undefined;
    }
  }
  return undefined;
}
