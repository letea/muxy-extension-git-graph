export const FIELD = "\x1f";
export const RECORD = "\x1e";
export const LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e";

export function parseRefs(decoration) {
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
      const remoteName = token.split("/")[0];
      // Check for known remote names
      if (["origin", "upstream", "github", "gitlab"].includes(remoteName)) {
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

export function parseGitLog(stdout) {
  const commits = [];
  for (const chunk of (stdout || "").split(RECORD)) {
    const record = chunk.replace(/^\n+/, "");
    if (!record.trim()) continue;
    const [hash, parents, authorName, authorDate, decoration, subject] = record.split(FIELD);
    commits.push({
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents ? parents.trim().split(/\s+/).filter(Boolean) : [],
      refs: parseRefs(decoration),
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
