'use strict';

const fs = require('fs');
const path = require('path');
const { scanPaths } = require('./inspect');

function input(name, fallback = '') {
  return String(process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback).trim();
}

function parseTargets(value) {
  return value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
}

function commandValue(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotationValue(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function append(file, value) {
  if (file) fs.appendFileSync(file, `${value}\n`);
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) append(process.env.GITHUB_OUTPUT, `${name}=${commandValue(value)}`);
  else process.stdout.write(`${name}=${value}\n`);
}

function writeSummary(report, counts) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const rows = report.findings.length
    ? report.findings.map(item => `| \`${item.file}:${item.line}\` | ${item.severity} | \`${item.rule}\` | ${item.message.replace(/\|/g, '\\|')} |`).join('\n')
    : '| — | — | — | No form delivery risks found by the static checks. |';
  append(process.env.GITHUB_STEP_SUMMARY, [
    '## Static Form Inspector',
    '',
    `Scanned **${report.forms_scanned} forms** in **${report.files_scanned} HTML files**. Found **${counts.error} errors** and **${counts.warning} warnings**.`,
    '',
    '| Location | Severity | Rule | Finding |',
    '|---|---|---|---|',
    rows,
    '',
    '> Static analysis cannot prove that an external endpoint delivers mail. Test receipt with synthetic data before claiming a form works.',
  ].join('\n'));
}

function main() {
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const targets = parseTargets(input('paths', '.'));
  const failOn = input('fail-on', 'never').toLowerCase();
  const reportPath = input('report', 'static-form-inspector-report.json');
  if (!['never', 'error', 'warning'].includes(failOn)) throw new Error('fail-on must be never, error, or warning');

  const report = scanPaths(workspace, targets.length ? targets : ['.']);
  const counts = {
    error: report.findings.filter(item => item.severity === 'error').length,
    warning: report.findings.filter(item => item.severity === 'warning').length,
  };

  for (const item of report.findings) {
    process.stdout.write(`::${item.severity === 'error' ? 'error' : 'warning'} file=${annotationValue(item.file)},line=${item.line},title=${annotationValue(item.rule)}::${commandValue(item.message)}\n`);
  }

  if (reportPath) {
    const destination = path.resolve(workspace, reportPath);
    const relative = path.relative(workspace, destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('report path must stay inside the workspace');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  }

  setOutput('findings-count', report.findings.length);
  setOutput('error-count', counts.error);
  setOutput('warning-count', counts.warning);
  writeSummary(report, counts);
  process.stdout.write(`Static Form Inspector scanned ${report.forms_scanned} forms in ${report.files_scanned} files: ${counts.error} errors, ${counts.warning} warnings.\n`);

  if ((failOn === 'error' && counts.error > 0) || (failOn === 'warning' && report.findings.length > 0)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stdout.write(`::error title=static-form-inspector::${commandValue(error.message || error)}\n`);
  process.exitCode = 1;
}
