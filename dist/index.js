"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/action.ts
var import_node_crypto4 = require("node:crypto");
var import_promises6 = require("node:fs/promises");
var import_node_os2 = __toESM(require("node:os"));
var import_node_path5 = __toESM(require("node:path"));

// src/archive.ts
var import_promises2 = require("node:fs/promises");
var import_node_path2 = __toESM(require("node:path"));

// src/contracts.ts
var import_node_path = __toESM(require("node:path"));
var RELEASE_BASE_URL = "https://github.com/zsumz/zcheck/releases/download";
var VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
var SHA256_PATTERN = /^[a-fA-F0-9]{64}$/u;
function requireVersion(value) {
  const version = value.trim();
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("Invalid version; expected an exact stable version such as 0.0.2");
  }
  return version;
}
function requireSha256(value) {
  const sha256 = value.trim();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error("Invalid sha256; expected exactly 64 hexadecimal characters");
  }
  return sha256.toLowerCase();
}
function resolveTarget(platform = process.platform, architecture = process.arch, report = process.report) {
  if (platform === "darwin") {
    if (architecture === "x64") return "x86_64-apple-darwin";
    if (architecture === "arm64") return "aarch64-apple-darwin";
  }
  if (platform === "win32" && architecture === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platform === "linux" && (architecture === "x64" || architecture === "arm64")) {
    const machine = architecture === "x64" ? "x86_64" : "aarch64";
    return `${machine}-unknown-linux-${linuxLibc(report)}`;
  }
  throw new Error(`Unsupported zcheck runner ${platform}/${architecture}`);
}
function linuxLibc(report) {
  try {
    const runtime = report.getReport().header?.glibcVersionRuntime;
    return runtime ? "gnu" : "musl";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to detect the Linux C library: ${message}`);
  }
}
function archiveName(version, target) {
  const extension = target.endsWith("-windows-msvc") ? "zip" : "tar.gz";
  return `zcheck-${version}-${target}.${extension}`;
}
function releaseUrl(version, target) {
  return `${RELEASE_BASE_URL}/v${version}/${archiveName(version, target)}`;
}
function installDirectory(toolCache, version, target, sha256) {
  return import_node_path.default.resolve(toolCache, "zcheck", version, target, sha256);
}
function binaryName(target) {
  return target.endsWith("-windows-msvc") ? "zcheck.exe" : "zcheck";
}

// src/tool.ts
var import_node_child_process = require("node:child_process");
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var COMMAND_TIMEOUT_MS = 6e4;
var MAX_BINARY_BYTES = 64 * 1024 * 1024;
async function sha256File(file) {
  const handle = await openStableRegularFile(file);
  try {
    const hash = (0, import_node_crypto.createHash)("sha256");
    await readHandle(handle, (chunk) => {
      hash.update(chunk);
    });
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}
async function copyVerifiedFile(source, destination, expectedSha256, maxBytes) {
  const sourceHandle = await openStableRegularFile(source);
  const hash = (0, import_node_crypto.createHash)("sha256");
  let received = 0;
  let destinationCreated = false;
  try {
    const destinationHandle = await (0, import_promises.open)(destination, "wx", 384);
    destinationCreated = true;
    try {
      await readHandle(sourceHandle, async (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          throw new Error(`File exceeds the ${maxBytes}-byte safety limit`);
        }
        hash.update(chunk);
        await writeAll(destinationHandle, chunk);
      });
    } finally {
      await destinationHandle.close();
    }
    const matches = hash.digest("hex") === expectedSha256;
    if (!matches) await (0, import_promises.rm)(destination, { force: true });
    return matches;
  } catch (error) {
    if (destinationCreated) await (0, import_promises.rm)(destination, { force: true });
    throw error;
  } finally {
    await sourceHandle.close();
  }
}
function verifyVersion(binaryPath, version, runCommand = run) {
  const result = runCommand(binaryPath, ["--version"]);
  const actual = result.output.trim();
  const expected = `zcheck ${version}`;
  if (actual !== expected) {
    throw new Error(`zcheck reported ${JSON.stringify(actual)} instead of ${expected}`);
  }
}
function run(command, args) {
  const result = (0, import_node_child_process.spawnSync)(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.message}`);
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}: ${output.trim()}`);
  }
  return { output };
}
function runBytes(command, args, maxBytes) {
  const result = (0, import_node_child_process.spawnSync)(command, args, {
    encoding: null,
    maxBuffer: maxBytes,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  if (result.error) {
    if (result.error.code === "ENOBUFS") {
      throw new Error(`Command output exceeds the ${maxBytes}-byte safety limit`);
    }
    throw new Error(`Unable to run ${command}: ${result.error.message}`);
  }
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  if (stdout.length > maxBytes) {
    throw new Error(`Command output exceeds the ${maxBytes}-byte safety limit`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}: ${stderr.toString().trim()}`);
  }
  return stdout;
}
async function openStableRegularFile(file) {
  const before = await (0, import_promises.lstat)(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${file} is not a regular file`);
  }
  const handle = await (0, import_promises.open)(file, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW);
  try {
    const after = await handle.stat({ bigint: true });
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new Error(`${file} changed while it was being opened`);
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}
async function readHandle(handle, consume) {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) return;
    await consume(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
}
async function writeAll(handle, contents) {
  let offset = 0;
  while (offset < contents.length) {
    const { bytesWritten } = await handle.write(contents, offset, contents.length - offset);
    if (bytesWritten === 0) throw new Error("Unable to make progress while copying a file");
    offset += bytesWritten;
  }
}

// src/archive.ts
async function extractBinary(archivePath, destination, target, runCommand = run, runBinaryCommand = runBytes, maxBinaryBytes = MAX_BINARY_BYTES) {
  const binary = binaryName(target);
  const compressed = archivePath.endsWith(".tar.gz");
  const listing = runCommand("tar", [compressed ? "-tzf" : "-tf", archivePath]).output;
  validateEntries(listing.split(/\r?\n/u).filter(Boolean), binary);
  await (0, import_promises2.mkdir)(destination, { recursive: true });
  const binaryPath = import_node_path2.default.join(destination, binary);
  const contents = runBinaryCommand(
    "tar",
    [compressed ? "-xOzf" : "-xOf", archivePath, binary],
    maxBinaryBytes
  );
  if (contents.length > maxBinaryBytes) {
    throw new Error(`Archive member ${binary} exceeds the ${maxBinaryBytes}-byte safety limit`);
  }
  await (0, import_promises2.writeFile)(binaryPath, contents, { flag: "wx", mode: 384 });
  if (!target.endsWith("-windows-msvc")) await (0, import_promises2.chmod)(binaryPath, 493);
  return binaryPath;
}
function validateEntries(entries, binary) {
  const names = /* @__PURE__ */ new Set();
  const caseInsensitiveNames = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (entry.includes("\\") || entry.includes("\0") || import_node_path2.default.posix.isAbsolute(entry) || entry.split("/").includes("..")) {
      throw new Error(`Unsafe archive entry ${JSON.stringify(entry)}`);
    }
    if (names.has(entry) || caseInsensitiveNames.has(entry.toLowerCase())) {
      throw new Error(`Duplicate archive entry ${JSON.stringify(entry)}`);
    }
    names.add(entry);
    caseInsensitiveNames.add(entry.toLowerCase());
  }
  if (!names.has(binary)) {
    throw new Error(`Archive does not contain ${binary}`);
  }
}

// src/cache.ts
var import_node_crypto3 = require("node:crypto");
var import_promises5 = require("node:fs/promises");
var import_node_path4 = __toESM(require("node:path"));

// src/download.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs2 = require("node:fs");
var import_promises3 = require("node:fs/promises");
var import_node_path3 = __toESM(require("node:path"));
var import_node_stream = require("node:stream");
var import_promises4 = require("node:stream/promises");
var MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
async function download(url, destination, fetchImpl = fetch) {
  await (0, import_promises3.mkdir)(import_node_path3.default.dirname(destination), { recursive: true });
  const temporary = `${destination}.${(0, import_node_crypto2.randomUUID)()}.tmp`;
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "zactionsz/setup-zcheck" },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status} for ${url}`);
    }
    if (!response.body) {
      throw new Error(`Download returned an empty response body for ${url}`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`Download exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`);
    }
    let received = 0;
    const limit = new import_node_stream.Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_ARCHIVE_BYTES) {
          callback(new Error(`Download exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`));
          return;
        }
        callback(null, chunk);
      }
    });
    await (0, import_promises4.pipeline)(
      import_node_stream.Readable.fromWeb(response.body),
      limit,
      (0, import_node_fs2.createWriteStream)(temporary, { flags: "wx" })
    );
    await (0, import_promises3.rename)(temporary, destination);
  } catch (error) {
    await (0, import_promises3.rm)(temporary, { force: true });
    throw error;
  }
}

// src/cache.ts
async function validCache(installDir, activationDir, version, target, archiveSha256, dependencies) {
  const binaryPath = import_node_path4.default.join(installDir, binaryName(target));
  const archivePath = import_node_path4.default.join(installDir, archiveName(version, target));
  const validationRoot = `${activationDir}.validation`;
  const privateArchive = import_node_path4.default.join(validationRoot, archiveName(version, target));
  const extracted = import_node_path4.default.join(validationRoot, "extracted");
  const privateBinary = import_node_path4.default.join(validationRoot, "cached", binaryName(target));
  try {
    await (0, import_promises5.mkdir)(import_node_path4.default.dirname(privateArchive), { recursive: true });
    if (!await dependencies.copyVerifiedFile(
      archivePath,
      privateArchive,
      archiveSha256,
      MAX_ARCHIVE_BYTES
    )) return false;
    const candidate = await dependencies.extractBinary(privateArchive, extracted, target);
    dependencies.verifyVersion(candidate, version);
    const candidateSha256 = await dependencies.sha256File(candidate);
    await (0, import_promises5.mkdir)(import_node_path4.default.dirname(privateBinary), { recursive: true });
    if (!await dependencies.copyVerifiedFile(
      binaryPath,
      privateBinary,
      candidateSha256,
      MAX_BINARY_BYTES
    )) return false;
    if (!target.endsWith("-windows-msvc")) await (0, import_promises5.chmod)(privateBinary, 493);
    dependencies.verifyVersion(privateBinary, version);
    await (0, import_promises5.mkdir)(import_node_path4.default.dirname(activationDir), { recursive: true });
    await (0, import_promises5.rename)(import_node_path4.default.dirname(privateBinary), activationDir);
    return true;
  } catch {
    await (0, import_promises5.rm)(activationDir, { force: true, recursive: true });
    return false;
  } finally {
    await (0, import_promises5.rm)(validationRoot, { force: true, recursive: true });
  }
}
async function publishVerified(source, archive, installDir, version, target, archiveSha256, binarySha256, dependencies) {
  await (0, import_promises5.mkdir)(import_node_path4.default.dirname(installDir), { recursive: true });
  const publishDir = `${installDir}.${(0, import_node_crypto3.randomUUID)()}.tmp`;
  const destination = import_node_path4.default.join(publishDir, binaryName(target));
  const cachedArchive = import_node_path4.default.join(publishDir, archiveName(version, target));
  try {
    await (0, import_promises5.mkdir)(publishDir);
    if (!await dependencies.copyVerifiedFile(
      source,
      destination,
      binarySha256,
      MAX_BINARY_BYTES
    )) throw new Error("SHA-256 mismatch while staging the verified zcheck executable");
    if (!await dependencies.copyVerifiedFile(
      archive,
      cachedArchive,
      archiveSha256,
      MAX_ARCHIVE_BYTES
    )) throw new Error("SHA-256 mismatch while staging the verified zcheck archive");
    if (!target.endsWith("-windows-msvc")) await (0, import_promises5.chmod)(destination, 493);
    dependencies.verifyVersion(destination, version);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await (0, import_promises5.rename)(publishDir, installDir);
        return;
      } catch (error) {
        if (await cacheEntryMatches(
          installDir,
          publishDir,
          version,
          target,
          archiveSha256,
          binarySha256,
          dependencies
        )) return;
        if (!isDestinationConflict(error)) throw error;
        await replaceInvalidEntry(installDir);
      }
    }
    throw new Error(`Unable to publish the verified zcheck cache entry at ${installDir}`);
  } finally {
    await (0, import_promises5.rm)(publishDir, { force: true, recursive: true });
  }
}
async function activateVerified(source, activationDir, version, target, binarySha256, dependencies) {
  const destination = import_node_path4.default.join(activationDir, binaryName(target));
  try {
    await (0, import_promises5.mkdir)(activationDir, { recursive: true });
    if (!await dependencies.copyVerifiedFile(
      source,
      destination,
      binarySha256,
      MAX_BINARY_BYTES
    )) throw new Error("SHA-256 mismatch while activating the verified zcheck executable");
    if (!target.endsWith("-windows-msvc")) await (0, import_promises5.chmod)(destination, 493);
    dependencies.verifyVersion(destination, version);
  } catch (error) {
    await (0, import_promises5.rm)(activationDir, { force: true, recursive: true });
    throw error;
  }
}
async function cacheEntryMatches(installDir, scratchRoot, version, target, archiveSha256, binarySha256, dependencies) {
  const verificationRoot = import_node_path4.default.join(scratchRoot, `winner-${(0, import_node_crypto3.randomUUID)()}`);
  const archiveCopy = import_node_path4.default.join(verificationRoot, archiveName(version, target));
  const binaryCopy = import_node_path4.default.join(verificationRoot, binaryName(target));
  try {
    await (0, import_promises5.mkdir)(verificationRoot, { recursive: true });
    const archiveMatches = await dependencies.copyVerifiedFile(
      import_node_path4.default.join(installDir, archiveName(version, target)),
      archiveCopy,
      archiveSha256,
      MAX_ARCHIVE_BYTES
    );
    const binaryMatches = await dependencies.copyVerifiedFile(
      import_node_path4.default.join(installDir, binaryName(target)),
      binaryCopy,
      binarySha256,
      MAX_BINARY_BYTES
    );
    if (!archiveMatches || !binaryMatches) return false;
    if (!target.endsWith("-windows-msvc")) await (0, import_promises5.chmod)(binaryCopy, 493);
    dependencies.verifyVersion(binaryCopy, version);
    return true;
  } catch {
    return false;
  } finally {
    await (0, import_promises5.rm)(verificationRoot, { force: true, recursive: true });
  }
}
async function replaceInvalidEntry(installDir) {
  const invalidDir = `${installDir}.${(0, import_node_crypto3.randomUUID)()}.invalid`;
  try {
    await (0, import_promises5.rename)(installDir, invalidDir);
    await (0, import_promises5.rm)(invalidDir, { force: true, recursive: true });
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") throw error;
  }
}
function isDestinationConflict(error) {
  return isErrnoException(error) && (error.code === "EEXIST" || error.code === "ENOTEMPTY" || error.code === "EPERM");
}
function isErrnoException(error) {
  return error instanceof Error && "code" in error;
}

// src/github.ts
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
function input(name, environment = process.env) {
  const value = environment[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`];
  if (!value?.trim()) throw new Error(`Input ${name} is required`);
  return value;
}
function setOutput(name, value, environment = process.env) {
  appendKeyValue(environment.GITHUB_OUTPUT, name, value, "GITHUB_OUTPUT");
}
function addPath(value, environment = process.env) {
  appendLine(environment.GITHUB_PATH, value, "GITHUB_PATH");
}
function appendKeyValue(file, name, value, variable) {
  if (/\r|\n/u.test(name) || /\r|\n/u.test(value)) {
    throw new Error(`Cannot write multiline values to ${variable}`);
  }
  appendLine(file, `${name}=${value}`, variable);
}
function appendLine(file, value, variable) {
  if (!file) throw new Error(`${variable} is not set`);
  if (/\r|\n/u.test(value)) {
    throw new Error(`Cannot write multiline values to ${variable}`);
  }
  (0, import_node_fs3.appendFileSync)(file, `${value}${import_node_os.EOL}`, { encoding: "utf8" });
}
function info(message) {
  process.stdout.write(`${message}${import_node_os.EOL}`);
}
function setFailed(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`::error::${escapeWorkflowCommand(message)}${import_node_os.EOL}`);
  process.exitCode = 1;
}
function escapeWorkflowCommand(message) {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

// src/action.ts
async function runAction(environment = process.env, overrides = {}) {
  const dependencies = {
    copyVerifiedFile,
    download,
    extractBinary,
    resolveTarget,
    sha256File,
    verifyVersion,
    ...overrides
  };
  const version = requireVersion(input("version", environment));
  const expectedSha256 = requireSha256(input("sha256", environment));
  const target = dependencies.resolveTarget();
  const toolCache = environment.RUNNER_TOOL_CACHE ?? environment.RUNNER_TEMP ?? import_node_os2.default.tmpdir();
  const runnerTemp = environment.RUNNER_TEMP ?? import_node_os2.default.tmpdir();
  const installDir = installDirectory(toolCache, version, target, expectedSha256);
  const activationDir = import_node_path5.default.resolve(
    runnerTemp,
    "setup-zcheck-active",
    `${version}-${target}-${expectedSha256}-${(0, import_node_crypto4.randomUUID)()}`
  );
  const installedBinary = import_node_path5.default.join(activationDir, binaryName(target));
  let cacheHit = await validCache(
    installDir,
    activationDir,
    version,
    target,
    expectedSha256,
    dependencies
  );
  if (cacheHit) {
    info(`Using verified cached zcheck ${version} for ${target}`);
  } else {
    const stagingRoot = import_node_path5.default.resolve(
      runnerTemp,
      "setup-zcheck-staging",
      `${version}-${target}-${(0, import_node_crypto4.randomUUID)()}`
    );
    const archive = import_node_path5.default.join(stagingRoot, archiveName(version, target));
    const extracted = import_node_path5.default.join(stagingRoot, "extracted");
    try {
      const url = releaseUrl(version, target);
      info(`Downloading zcheck ${version} for ${target}`);
      await dependencies.download(url, archive);
      const actualSha256 = await dependencies.sha256File(archive);
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `SHA-256 mismatch for ${import_node_path5.default.basename(archive)}: expected ${expectedSha256}, received ${actualSha256}`
        );
      }
      const candidate = await dependencies.extractBinary(archive, extracted, target);
      dependencies.verifyVersion(candidate, version);
      const candidateSha256 = await dependencies.sha256File(candidate);
      await publishVerified(
        candidate,
        archive,
        installDir,
        version,
        target,
        expectedSha256,
        candidateSha256,
        dependencies
      );
      await activateVerified(
        candidate,
        activationDir,
        version,
        target,
        candidateSha256,
        dependencies
      );
    } finally {
      await (0, import_promises6.rm)(stagingRoot, { force: true, recursive: true });
    }
    cacheHit = false;
  }
  addPath(activationDir, environment);
  setOutput("version", version, environment);
  setOutput("target", target, environment);
  setOutput("sha256", expectedSha256, environment);
  setOutput("path", installedBinary, environment);
  setOutput("cache-hit", String(cacheHit), environment);
  info(`Installed and verified zcheck ${version} for ${target}`);
  return { binaryPath: installedBinary, cacheHit, sha256: expectedSha256, target, version };
}

// src/index.ts
runAction().catch(setFailed);
