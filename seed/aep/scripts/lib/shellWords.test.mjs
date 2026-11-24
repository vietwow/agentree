import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  shellScript,
  shellTokens,
  shellWords,
  simpleCommands,
} from './shellWords.mjs';

const wordsOf = line => simpleCommands(line).map(({ words }) => words);

describe('shellWords', () => {
  test('splits at white space outside quotes, without the quotes', () => {
    assert.deepEqual(shellWords(`yarn  a 'b c' "d e" f'g'"h"`), [
      'yarn',
      'a',
      'b c',
      'd e',
      'fgh',
    ]);
  });

  test('keeps an empty quoted word', () => {
    assert.deepEqual(shellWords(`a '' ""`), ['a', '', '']);
  });

  test('takes off a backslash that keeps the next character', () => {
    assert.deepEqual(shellWords(String.raw`a\ b c\'d`), ['a b', "c'd"]);
    assert.deepEqual(shellWords(String.raw`"a\"b\\c\$d\e"`), [
      String.raw`a"b\c$d\e`,
    ]);
    assert.deepEqual(shellWords(String.raw`'a\b'`), [String.raw`a\b`]);
  });

  test('gives an operator as a word of its own', () => {
    assert.deepEqual(shellWords('a && b||c;d | e'), [
      'a',
      '&&',
      'b',
      '||',
      'c',
      ';',
      'd',
      '|',
      'e',
    ]);
  });

  test('keeps a quoted or escaped operator in its word', () => {
    assert.deepEqual(shellWords(String.raw`a '&&' "b;c" d\|e`), [
      'a',
      '&&',
      'b;c',
      'd|e',
    ]);
  });

  test('keeps the & of a redirection in its word', () => {
    assert.deepEqual(shellWords('a 2>&1 &>out <&3'), [
      'a',
      '2>&1',
      '&>out',
      '<&3',
    ]);
  });
});

describe('shellTokens', () => {
  test('tells words from operators, with their place in the line', () => {
    assert.deepEqual(shellTokens(`a 'b c'&&d`), [
      { word: 'a', start: 0, end: 1 },
      { word: 'b c', start: 2, end: 7 },
      { operator: '&&', start: 7, end: 9 },
      { word: 'd', start: 9, end: 10 },
    ]);
  });
});

describe('simpleCommands', () => {
  test('splits at every operator and leaves out empty commands', () => {
    assert.deepEqual(wordsOf('a b && c || d; e | f & g ;; ; h &&'), [
      ['a', 'b'],
      ['c'],
      ['d'],
      ['e'],
      ['f'],
      ['g'],
      ['h'],
    ]);
  });

  test('gives each command its text and the operator that ends it', () => {
    assert.deepEqual(simpleCommands(`yarn a  'b c' &&  yarn d`), [
      { words: ['yarn', 'a', 'b c'], text: `yarn a  'b c'`, operator: '&&' },
      { words: ['yarn', 'd'], text: 'yarn d', operator: undefined },
    ]);
  });

  test('splits only at the operators it is given', () => {
    assert.deepEqual(simpleCommands('a | b && c; d', ['&&']), [
      { words: ['a', '|', 'b'], text: 'a | b', operator: '&&' },
      { words: ['c', ';', 'd'], text: 'c; d', operator: undefined },
    ]);
  });

  test('gives nothing for a line of no words', () => {
    assert.deepEqual(simpleCommands(''), []);
    assert.deepEqual(simpleCommands(' && ; '), []);
  });
});

describe('shellScript', () => {
  test('is the line a shell runs with -c', () => {
    assert.equal(shellScript(shellWords(`sh -c 'yarn a'`)), 'yarn a');
    assert.equal(shellScript(['bash', '-c', 'x', 'name', 'arg']), 'x');
    assert.equal(shellScript(['zsh', '-c', 'x']), 'x');
  });

  test('reads -c among combined or separate flags', () => {
    assert.equal(shellScript(shellWords(`bash -lc 'yarn a'`)), 'yarn a');
    assert.equal(shellScript(shellWords(`sh -ec 'yarn a'`)), 'yarn a');
    assert.equal(shellScript(shellWords(`sh -e -c 'yarn a'`)), 'yarn a');
    assert.equal(
      shellScript(shellWords(`bash --noprofile -o pipefail -c 'yarn a'`)),
      'yarn a',
    );
    assert.equal(shellScript(['bash', '-c', '--', 'x']), 'x');
  });

  test('is undefined for a shell that runs a file, and for any other program', () => {
    assert.equal(shellScript(['sh', 'script.sh']), undefined);
    assert.equal(shellScript(['bash', '-l', 'script.sh']), undefined);
    assert.equal(shellScript(['sh', '+c', 'x']), undefined);
    assert.equal(shellScript(['sh', '-c']), undefined);
    assert.equal(shellScript(['node', '-c', 'x']), undefined);
    assert.equal(shellScript([]), undefined);
  });
});
