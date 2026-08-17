# Security

## Trust model

`dsh-insight` runs as a host-side Cordis plugin with the same trust level as any installed bundle. Review the source before installing.

## Capabilities

- **Network**: none. The plugin makes no requests.
- **Filesystem**: reads its bundled data (`lib/guide-data.json`, `data/catalog.json`). `plugin_audit` reads the local directory the model explicitly passes as `dir` — treat it as a trust boundary: only scan checkouts you already trust or intend to review.
- **Secrets**: none read or written.

## Reporting

Open an issue in this repository.
