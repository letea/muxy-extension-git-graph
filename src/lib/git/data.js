export const FIELD = "\x1f";
export const RECORD = "\x1e";
export const LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e";

export function parseRefs(decoration, knownRemotes = ["origin"]) {
  const text = (decoration || "").trim();
  if (!text) return [];
  const refs = [];
  for (const raw of text.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    if (token.startsWith("HEAD -> ")) {
      refs.push({ name: token.slice("HEAD -> ".length), kind: "branch", head: true });
    } else if (token === "HEAD") {
      refs.push({ name: "HEAD", kind: "head" });
    } else if (token.startsWith("tag: ")) {
      refs.push({ name: token.slice("tag: ".length), kind: "tag" });
    } else if (token.includes("/")) {
      const firstSegment = token.split("/")[0];
      if (knownRemotes.includes(firstSegment)) {
        refs.push({ name: token, kind: "remote" });
      } else {
        refs.push({ name: token, kind: "branch" });
      }
    } else {
      refs.push({ name: token, kind: "branch" });
    }
  }
  return refs;
}

export function parseGitLog(stdout, knownRemotes = ["origin"]) {
  const commits = [];
  for (const chunk of (stdout || "").split(RECORD)) {
    const record = chunk.replace(/^\n+/, "");
    if (!record.trim()) continue;
    const [hash, parents, authorName, authorDate, decoration, subject] = record.split(FIELD);
    commits.push({
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents ? parents.trim().split(/\s+/).filter(Boolean) : [],
      refs: parseRefs(decoration, knownRemotes),
      authorName,
      authorDate,
      subject: subject ?? "",
    });
  }
  return commits;
}

export function parseCommitShow(stdout) {
  const sepIndex = (stdout || "").indexOf(RECORD);
  const head = sepIndex === -1 ? stdout : stdout.slice(0, sepIndex);
  const diff = sepIndex === -1 ? "" : stdout.slice(sepIndex + 1).replace(/^\n+/, "");
  const [authorName, authorDate, subject, body] = head.split(FIELD);
  return {
    authorName: authorName ?? "",
    authorDate: authorDate ?? "",
    subject: subject ?? "",
    body: (body ?? "").trim(),
    diff,
  };
}

async function repoRoot() {
  const info = await muxy.git.repoInfo();
  return info?.root ?? null;
}

export async function loadRefs() {
  const info = await muxy.git.repoInfo();
  const [local, remote] = await Promise.all([
    muxy.git.branches().catch(() => []),
    muxy.git.remoteBranches().catch(() => []),
  ]);
  return {
    root: info?.root ?? null,
    current: info?.currentBranch ?? null,
    local: local ?? [],
    remote: remote ?? [],
  };
}

export async function loadGraph({ maxCount = 300, skip = 0, knownRemotes = ["origin"] } = {}) {
  const cwd = await repoRoot();
  const argv = [
    "git", "log", "--all", "--date=iso-strict",
    `--pretty=format:${LOG_FORMAT}`,
    `--max-count=${maxCount}`, `--skip=${skip}`,
  ];
  const { stdout } = await muxy.exec(argv, { cwd });
  return parseGitLog(stdout, knownRemotes);
}

export async function loadRemoteNames() {
  const cwd = await repoRoot();
  try {
    const { stdout } = await muxy.exec(["git", "remote"], { cwd });
    return (stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadCommitDetail(hash) {
  const cwd = await repoRoot();
  const argv = [
    "git", "show", "--no-color", "-p",
    `--pretty=format:%an%x1f%aI%x1f%s%x1f%b%x1e`,
    hash,
  ];
  const { stdout } = await muxy.exec(argv, { cwd });
  return parseCommitShow(stdout);
}

export async function checkout(name, kind) {
  const cwd = await repoRoot();
  let target = name;
  if (kind === "remote") {
    target = name.split("/").slice(1).join("/");
  }
  const { stderr, exitCode } = await muxy.exec(["git", "checkout", target], { cwd });
  return { ok: exitCode === 0, message: (stderr || "").trim() };
}

export async function loadUncommittedStatus() {
  const cwd = await repoRoot();
  try {
    const { stdout } = await muxy.exec(["git", "diff", "--name-only", "HEAD"], { cwd });
    const files = (stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return { count: files.length, files };
  } catch {
    return { count: 0, files: [] };
  }
}

export async function loadUncommittedDiff() {
  const cwd = await repoRoot();
  try {
    const { stdout } = await muxy.exec(["git", "diff", "HEAD", "--no-color"], { cwd });
    return stdout || "";
  } catch {
    return "";
  }
}
