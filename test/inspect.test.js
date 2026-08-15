'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { inspectHtml, scanPaths } = require('../src/inspect');

test('accepts a named POST form with a real HTTPS endpoint', () => {
  const findings = inspectHtml('good.html', '<form action="https://formspree.io/f/abc123" method="post"><label>Email <input type="email" name="email"></label><button type="submit">Send</button></form>');
  assert.deepEqual(findings, []);
});

test('reports inert actions, placeholder tokens, and omitted values', () => {
  const findings = inspectHtml('broken.html', '<form action="#"><input type="hidden" name="access_key" value="YOUR_WEB3FORMS_ACCESS_KEY"><input type="email"><textarea></textarea></form>');
  assert.deepEqual(findings.map(item => item.rule), ['inert-action', 'placeholder-credential', 'contact-form-get', 'missing-field-name', 'missing-field-name']);
  assert.equal(findings[0].line, 1);
});

test('warns about mail-client-dependent submission', () => {
  const findings = inspectHtml('mail.html', '<form action="mailto:hello@example.com" method="post"><input name="message"></form>');
  assert.equal(findings[0].rule, 'mailto-action');
});

test('does not require names on buttons or disabled controls', () => {
  const findings = inspectHtml('controls.html', '<form action="/send" method="post"><button>Send</button><input disabled></form>');
  assert.deepEqual(findings, []);
});

test('reports unclosed forms with the correct line', () => {
  const findings = inspectHtml('open.html', '<main>\n<form action="/send" method="post">\n<input name="message">');
  assert.equal(findings[0].rule, 'unclosed-form');
  assert.equal(findings[0].line, 2);
});

test('scans directories, skips dependencies, and rejects paths outside the workspace', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'static-form-inspector-'));
  try {
    fs.mkdirSync(path.join(directory, 'site'));
    fs.mkdirSync(path.join(directory, 'node_modules'));
    fs.writeFileSync(path.join(directory, 'site', 'index.html'), '<form action="/send" method="post"><input name="message"></form>');
    fs.writeFileSync(path.join(directory, 'node_modules', 'ignored.html'), '<form action="#"></form>');
    const report = scanPaths(directory, ['.']);
    assert.equal(report.files_scanned, 1);
    assert.equal(report.forms_scanned, 1);
    assert.deepEqual(report.findings, []);
    assert.throws(() => scanPaths(directory, ['../outside.html']), /escapes the workspace/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
