"""
Follow-up codemod: parenthesise awaited loader calls that start a MULTI-LINE
member chain.

add_awaits.py decided between `await f()` and `(await f())` by looking at the
character immediately after the closing paren. When the chain continues on the
next line:

    await loadITAssets()
      .filter(...)

that character is a newline, so it produced `await loadITAssets().filter(...)`,
which awaits the result of calling .filter on a Promise. This pass skips
whitespace before deciding, and rewrites those to `(await loadITAssets())`.

Asserts it changed the file it claims to have changed.
"""

import re
import pathlib

LOADERS = [
    "loadUsers", "loadRoles", "loadCandidates", "loadApplications", "loadInterviews",
    "loadOffers", "loadEmployees", "loadRecognitions", "findRecognitionById",
    "loadNominationCycles", "loadITAssets", "findITAssetById", "findCandidateById",
    "findApplicationById", "findOfferById", "findEmployeeById", "findUserByEmail",
    "findRoleById", "loadApplicationsForRole",
]

CALL = re.compile(r"await\s+(" + "|".join(LOADERS) + r")\s*\(")
BACKSLASH = chr(92)
QUOTES = "\"'`"


def close_of(text, idx):
    depth = 0
    quote = None
    i = idx
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == BACKSLASH:
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in QUOTES:
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


total = 0
files = 0
for path in pathlib.Path("src").rglob("*"):
    if path.suffix not in (".ts", ".tsx"):
        continue
    src = path.read_text(encoding="utf-8")
    out = []
    i = 0
    n = 0
    while True:
        m = CALL.search(src, i)
        if not m:
            out.append(src[i:])
            break
        close = close_of(src, m.end() - 1)
        if close == -1:
            out.append(src[i:m.end()])
            i = m.end()
            continue
        j = close
        while j < len(src) and src[j] in " \t\r\n":
            j += 1
        if j < len(src) and src[j] in ".[":
            call = src[m.start() + len("await "):close].lstrip()
            out.append(src[i:m.start()])
            out.append("(await " + call + ")")
            i = close
            n += 1
        else:
            out.append(src[i:close])
            i = close
    if n:
        new = "".join(out)
        if new == src:
            raise SystemExit(f"{path}: {n} matches but no change - transform is broken")
        path.write_text(new, encoding="utf-8", newline="")
        total += n
        files += 1
        print(f"  {n:3d}  {path}")

print(f"wrapped {total} multi-line chains in {files} files")
