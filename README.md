# setup-zcheck

Install an exact, checksum-pinned [zcheck](https://github.com/zsumz/zcheck)
release in a GitHub Actions job.

## Usage

Pin both the Action and the platform archive:

```yaml
- name: Set up zcheck
  uses: zactionsz/setup-zcheck@7fd8dac2b7c057fd142e05079dee073e0f50700b
  with:
    version: "0.0.2"
    sha256: "<platform archive digest>"

- run: zcheck validate
```

`setup-zcheck` installs the CLI and adds it to `PATH`. It does not run a zcheck
operation. The consumer chooses whether to use `zcheck validate`, `zcheck plan`,
`zcheck run`, `zcheck list`, `zcheck doctor`, or another command.

## zcheck 0.0.2 archive digests

| Runner | Release target | SHA-256 |
| --- | --- | --- |
| Linux x64, glibc | `x86_64-unknown-linux-gnu` | `a9e3ca964b6f5e86c693edeff4aeaddb46ee9d62f8713d3ded0bb6533b758e53` |
| Linux ARM64, glibc | `aarch64-unknown-linux-gnu` | `f5b296fa2c316f017bc8a189ac186c658ea1dc72b3311d7e0d3639d52d2608c7` |
| Linux x64, musl | `x86_64-unknown-linux-musl` | `bf4056916283a93651d2c0c69412337250041ce9c06a5a80661ff30d1e7b0a05` |
| Linux ARM64, musl | `aarch64-unknown-linux-musl` | `774b5dbeff398af7a29bff7d5cd7dd482a02bac8446a5696790a46d57df5bc27` |
| macOS Intel | `x86_64-apple-darwin` | `37c382c741999d8749318a52851695a55724371da5ad2f964daa318bf4fe3163` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `973c5ad9a83590a664c69f62aac2e38b07bbcc8c1d887389507f80cf77347883` |
| Windows x64 | `x86_64-pc-windows-msvc` | `f4cc273e06cebdc9c830dd3c6b0dacbd0b1947db7ab2e3cf293e7740b2cd8e1c` |

The digest is for the release archive selected for the current runner. A job
matrix should include the matching digest alongside each runner label.

## Inputs

| Input | Required | Contract |
| --- | --- | --- |
| `version` | Yes | Exact stable zcheck release version, without a leading `v` |
| `sha256` | Yes | Exact 64-character SHA-256 digest for this runner's archive |

Floating versions such as `latest`, version ranges, and missing checksums are
rejected.

## Outputs

| Output | Value |
| --- | --- |
| `version` | Verified zcheck version |
| `target` | Selected zcheck release target |
| `sha256` | Verified lowercase archive digest |
| `path` | Absolute path to the installed executable |
| `cache-hit` | `true` when a verified tool-cache entry was reused |

## Verification

The Action selects one of the seven targets published by zcheck, downloads the
versioned archive from its GitHub release, verifies the caller-pinned
SHA-256 before extraction, rejects unsafe archive paths, extracts only the
zcheck executable, and requires an exact `zcheck <version>` identity response.
Only then does it publish the executable to the runner tool cache and add it to
`PATH` for later steps.

## Development

The Action is authored in strict TypeScript under `src/`. GitHub executes the
committed `dist/index.js` bundle, and the complete gate verifies that the bundle
matches its source:

```sh
npm ci
npm run check
```

## License

MIT
