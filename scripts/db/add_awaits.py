"""
Codemod: await the now-async data loaders.

The loaders in src/lib/data.ts became async. Every call site needs `await`, but
a naive prefix is wrong: `await loadRoles().find(...)` parses as
`await (loadRoles().find(...))`, which awaits the result of calling .find on a
Promise. Where the call is followed by a member access it has to become
`(await loadRoles()).find(...)`.

So this walks the source, finds each loader call, matches its closing paren
properly, and wraps according to what follows.

It asserts its own match count and refuses to write a file it did not change,
because an edit that does not verify it matched is a hope rather than a write.

    python scripts/db/add_awaits.py [--dry-run] [file ...]
"""

import re
import sys
import pathlib

LOADERS = [
    "loadUsers", "loadRoles", "loadCandidates", "loadApplications", "loadInterviews",
    "loadOffers", "loadEmployees", "loadRecognitions", "findRecognitionById",
    "loadNominationCycles", "loadITAssets", "findITAssetById", "findCandidateById",
    "findApplicationById", "findOfferById", "findEmployeeById", "findUserByEmail",
    "findRoleById", "loadApplicationsForRole",
]

CALL = re.compile(r"\b(" + "|".join(LOADERS) + r")\s*\(")

DRY = "--dry-run" in sys.argv
targets = [a for a in sys.argv[1:] if not a.startswith("--")]


def match_close(text, open_idx):
    """Index just past the paren that closes the one at open_idx."""
    depth = 0
    i = open_idx
    in_str = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        elif ch in "\"'`":
            in_str = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def already_awaited(text, start):
    """Is this call already preceded by await, or part of a definition?"""
    before = text[max(0, start - 220):start]
    stripped = before.rstrip()
    if stripped.endswith("await"):
        return True
    # `export async function loadRoles(` - the declaration itself.
    if re.search(r"(function|const|let|var)\s*$", stripped):
        return True
    # import { loadRoles } / export { loadRoles }
    line_start = before.rfind("\n") + 1
    line = before[line_start:]
    if re.match(r"\s*(import|export)\b", line) and "{" in line:
        return True
    # vi.mock factory keys and property shorthand like `loadRoles: vi.fn(`
    if re.search(r"[{,]\s*$", stripped):
        return True
    return False


def transform(text):
    out = []
    i = 0
    count = 0
    while True:
        m = CALL.search(text, i)
        if not m:
            out.append(text[i:])
            break
        name_start, paren = m.start(1), m.end() - 1
        close = match_close(text, paren)
        if close == -1 or already_awaited(text, name_start):
            out.append(text[i:m.end()])
            i = m.end()
            continue

        # Preceded by `.`? Then it is a method on something else, not our loader.
        before = text[:name_start].rstrip()
        if before.endswith(".") or before.endswith("?."):
            out.append(text[i:m.end()])
            i = m.end()
            continue

        call = text[name_start:close]
        after = text[close:close + 2]
        if after[:1] in (".", "[") or after == "?.":
            replacement = f"(await {call})"
        else:
            replacement = f"await {call}"

        out.append(text[i:name_start])
        out.append(replacement)
        i = close
        count += 1
    return "".join(out), count


files = (
    [pathlib.Path(t) for t in targets]
    if targets
    else [
        p
        for p in pathlib.Path("src").rglob("*")
        if p.suffix in (".ts", ".tsx") and p.name != "data.ts"
    ]
)

changed = 0
total = 0
for path in files:
    if not path.is_file():
        continue
    src = path.read_text(encoding="utf-8")
    new, n = transform(src)
    if n == 0:
        continue
    if new == src:
        raise SystemExit(f"{path}: reported {n} matches but produced no change - transform is broken")
    total += n
    changed += 1
    if not DRY:
        path.write_text(new, encoding="utf-8", newline="")
    print(f"  {n:3d}  {path}")

print(f"\n{'would change' if DRY else 'changed'} {changed} files, {total} call sites")
