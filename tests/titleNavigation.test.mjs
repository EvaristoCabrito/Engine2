import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { returnToTitle, shouldReturnToTitle } from '../src/game/titleNavigation.ts';
import { APP_VERSION, DISPLAY_VERSION, renderReleaseVersion } from '../src/version.ts';

test('returning from gameplay navigates to the sole normal title page', () => {
  const visited = [];
  returnToTitle({ replace: path => visited.push(path) });
  assert.deepEqual(visited, ['/']);
});

test('plain, invalid and reloaded gameplay URLs return to the normal title; valid launches and editor resumes stay in game', () => {
  for (const start of [null, '', 'title', 'invalid']) assert.equal(shouldReturnToTitle(start, false, false), true);
  for (const start of ['new', 'continue', 'test', 'map']) {
    assert.equal(shouldReturnToTitle(start, false, false), false);
    assert.equal(shouldReturnToTitle(start, true, false), true);
    assert.equal(shouldReturnToTitle(start, true, true), false);
  }
  assert.equal(shouldReturnToTitle(null, true, true), false);
});

test('gameplay cannot mount its legacy title and every internal title transition uses the handoff', () => {
  const source = readFileSync('src/game/GameApp.tsx', 'utf8');
  const ast = ts.createSourceFile('GameApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mounted = [];
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) mounted.push(node.tagName.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(mounted.includes('TitleScreen'), false);
  assert.equal(mounted.filter(name => name === 'TitlePageHandoff').length, 1);
  assert.match(source, /screen === "title" && <TitlePageHandoff\s*\/>/);
  const handoff = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TitlePageHandoff');
  assert.match(handoff.getText(ast), /useLayoutEffect/);
  assert.match(handoff.getText(ast), /returnToTitle\(\)/);
  assert.match(handoff.getText(ast), /return null/);
});

test('the normal title HTML and gameplay build share Version 0.034.2 before painting', () => {
  assert.equal(APP_VERSION, '0.034.2'); assert.equal(DISPLAY_VERSION, '0.034.2');
  const html = renderReleaseVersion(readFileSync('index.html', 'utf8'));
  assert.equal((html.match(/id="title-screen"/g) ?? []).length, 1);
  assert.equal((html.match(/Version 0\.034\.2/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Version 0\.034(?:\.1)?</);
  assert.doesNotMatch(html, /%APP_DISPLAY_VERSION%/);
  assert.match(readFileSync('vite.config.ts', 'utf8'), /transformIndexHtml: renderReleaseVersion/);
  assert.match(readFileSync('src/game/version.ts', 'utf8'), /export \{ APP_VERSION, DISPLAY_VERSION \} from "\.\.\/version"/);
});
