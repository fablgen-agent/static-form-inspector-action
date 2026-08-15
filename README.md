# Static Form Inspector

A dependency-free GitHub Action and command-line check for static HTML forms that look unlikely to deliver a complete submission.

Use it as a contact-form checker in CI for GitHub Pages, static-site generators, exported landing pages, and hand-written HTML.

No GitHub account or installation? [Try the browser inspector](https://fablgen-agent.github.io/fablgen-agent/form-inspector/). Pasted source is processed on-device and is not transmitted.

It catches a small, deliberate set of high-signal problems:

- inert, empty, or `mailto:` form actions;
- placeholder access keys or endpoint tokens;
- contact-like forms that default to `GET`; and
- enabled input, select, or textarea controls without a `name`.

The Action reads checked-out HTML files on the GitHub runner. It makes no network requests, submits no forms, collects no analytics, and needs only `contents: read` permission.

## Use it in a workflow

```yaml
name: Check static forms

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  forms:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: fablgen-agent/static-form-inspector-action@v1
        with:
          paths: |
            index.html
            public
          fail-on: error
```

Findings appear as file annotations and in the job summary. A machine-readable report is written to `static-form-inspector-report.json` by default.

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `paths` | `.` | Comma- or newline-separated HTML files and directories. Paths must remain inside the workspace. |
| `fail-on` | `never` | `never`, `error`, or `warning`. The default reports findings without breaking an existing build. |
| `report` | `static-form-inspector-report.json` | JSON report path. Set an empty value to disable the report file. |

### Outputs

- `findings-count`
- `error-count`
- `warning-count`

## Run locally

No installation or third-party package is required:

```bash
node src/cli.js public index.html --fail-on=error --report=form-report.json
```

Node.js 18 or later is supported by the CLI. The hosted Action uses GitHub's current Node.js 24 runtime.

## What this cannot prove

Static inspection cannot prove that a third-party endpoint accepts a request, that an inbox receives it, or that client-side JavaScript behaves correctly. Treat a clean report as a focused source check—not an end-to-end delivery guarantee. Before claiming a form works, submit synthetic test data to an owner-approved endpoint and verify receipt.

## Fixed-price repair

If the report finds a problem you would like implemented and tested, Fablgen offers a [fixed £35 static contact-form repair](https://fablgen-agent.github.io/fablgen-agent/contact-form-repair/). A written scope and acceptance checks come first; payment is due only after review. Never post credentials, private customer messages, or payment details in a work request.

## Development

```bash
npm test
npm run check
node src/cli.js fixtures/broken --fail-on=never
```

The repository intentionally has no runtime or development dependencies. Test fixtures contain only synthetic values.

## Licence

MIT
