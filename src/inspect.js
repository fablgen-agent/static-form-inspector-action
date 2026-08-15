'use strict';

const fs = require('fs');
const path = require('path');

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'vendor', 'dist', 'coverage']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function lineAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split('\n').length;
}

function attribute(tag, name) {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(expression);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function hasAttribute(tag, name) {
  return new RegExp(`\\b${name}(?:\\s*=|\\s|/?>)`, 'i').test(tag);
}

function finding(file, text, offset, severity, rule, message) {
  return { file, line: lineAt(text, offset), severity, rule, message };
}

function inspectForm(file, document, formHtml, offset, closed) {
  const findings = [];
  const openTag = formHtml.match(/^<form\b[^>]*>/i)?.[0] || '<form>';
  const action = attribute(openTag, 'action');
  const method = (attribute(openTag, 'method') || 'get').toLowerCase();
  const hasContactField = /<(?:textarea)\b|<input\b[^>]*\btype\s*=\s*["']?(?:email|tel)["']?/i.test(formHtml);

  if (!closed) {
    findings.push(finding(file, document, offset, 'error', 'unclosed-form', 'Form has no closing </form> tag.'));
  }

  if (action === null) {
    findings.push(finding(file, document, offset, 'warning', 'missing-action', 'Form has no action. Confirm that JavaScript delivers the submission.'));
  } else if (!action.trim() || /^(?:#|javascript:)/i.test(action.trim())) {
    findings.push(finding(file, document, offset, 'error', 'inert-action', `Form action is not a delivery endpoint: ${action || '(empty)'}.`));
  } else if (/^mailto:/i.test(action.trim())) {
    findings.push(finding(file, document, offset, 'warning', 'mailto-action', 'mailto: form actions depend on a configured mail application and are not reliable in-browser submission.'));
  }

  const placeholder = formHtml.match(/(?:YOUR_[A-Z0-9_]*(?:KEY|TOKEN)|REPLACE[_ -]?ME|["'](?:your|test)[-_ ]?(?:access[-_ ]?)?(?:key|token)["'])/i);
  if (placeholder) {
    findings.push(finding(file, document, offset + placeholder.index, 'error', 'placeholder-credential', 'Form contains a placeholder credential or endpoint token.'));
  }

  if (hasContactField && method === 'get') {
    findings.push(finding(file, document, offset, 'warning', 'contact-form-get', 'Contact-like form defaults to GET; submitted values may appear in URLs and logs.'));
  }

  const controls = formHtml.matchAll(/<(input|select|textarea)\b[^>]*>/gi);
  for (const match of controls) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const type = (attribute(tag, 'type') || 'text').toLowerCase();
    if (tagName === 'input' && ['button', 'submit', 'reset', 'image'].includes(type)) continue;
    if (hasAttribute(tag, 'disabled')) continue;
    if (!attribute(tag, 'name')) {
      findings.push(finding(file, document, offset + match.index, 'warning', 'missing-field-name', `${tagName} control has no name, so native form submission will omit its value.`));
    }
  }

  return findings;
}

function inspectHtml(file, text) {
  const findings = [];
  const openings = [...text.matchAll(/<form\b[^>]*>/gi)];
  for (const opening of openings) {
    const start = opening.index;
    const remainder = text.slice(start);
    const closing = /<\/form\s*>/i.exec(remainder);
    const end = closing ? start + closing.index + closing[0].length : text.length;
    findings.push(...inspectForm(file, text, text.slice(start, end), start, Boolean(closing)));
  }
  return findings;
}

function walk(target, workspace, files, skipped) {
  const resolved = path.resolve(workspace, target);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes the workspace: ${target}`);

  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Path does not exist: ${target}`);
    throw error;
  }
  if (stat.isSymbolicLink()) {
    skipped.push({ path: relative || '.', reason: 'symbolic link' });
    return;
  }
  if (stat.isDirectory()) {
    if (SKIPPED_DIRECTORIES.has(path.basename(resolved)) && resolved !== workspace) return;
    for (const entry of fs.readdirSync(resolved).sort()) walk(path.join(relative, entry), workspace, files, skipped);
    return;
  }
  if (!stat.isFile() || !/\.html?$/i.test(resolved)) return;
  if (stat.size > MAX_FILE_BYTES) {
    skipped.push({ path: relative, reason: `larger than ${MAX_FILE_BYTES} bytes` });
    return;
  }
  files.add(relative || path.basename(resolved));
}

function scanPaths(workspace, targets) {
  const root = path.resolve(workspace);
  const files = new Set();
  const skipped = [];
  for (const target of targets) walk(target || '.', root, files, skipped);

  const findings = [];
  for (const file of [...files].sort()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    findings.push(...inspectHtml(file, text));
  }
  return {
    generated_at: new Date().toISOString(),
    files_scanned: files.size,
    forms_scanned: [...files].reduce((count, file) => count + [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/<form\b[^>]*>/gi)].length, 0),
    findings,
    skipped,
  };
}

module.exports = { inspectHtml, scanPaths };
