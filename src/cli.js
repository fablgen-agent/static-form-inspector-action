#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scanPaths } = require('./inspect');

const args = process.argv.slice(2);
const reportArgument = args.find(arg => arg.startsWith('--report='));
const failArgument = args.find(arg => arg.startsWith('--fail-on='));
const targets = args.filter(arg => !arg.startsWith('--'));
const failOn = (failArgument?.slice('--fail-on='.length) || 'never').toLowerCase();
if (!['never', 'error', 'warning'].includes(failOn)) throw new Error('--fail-on must be never, error, or warning');

const report = scanPaths(process.cwd(), targets.length ? targets : ['.']);
for (const item of report.findings) console.log(`${item.severity.toUpperCase()} ${item.file}:${item.line} [${item.rule}] ${item.message}`);
console.log(`Scanned ${report.forms_scanned} forms in ${report.files_scanned} HTML files; ${report.findings.length} findings.`);

if (reportArgument) {
  const destination = path.resolve(process.cwd(), reportArgument.slice('--report='.length));
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
}
const errors = report.findings.filter(item => item.severity === 'error').length;
if ((failOn === 'error' && errors) || (failOn === 'warning' && report.findings.length)) process.exitCode = 1;
