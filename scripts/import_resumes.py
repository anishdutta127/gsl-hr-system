"""
Walk onedrive-data/seed/resumes/ and seed src/data/candidates.json.

Per folder:
  Academics Team        -> programmes: ['Academics']
  BD & Ops              -> programmes: ['Sales', 'Ops']
  Marketing resumes     -> programmes: ['Marketing']
  Stem & Training-*     -> programmes: ['STEAM']

Filename -> candidate name via strip-extension + dash-to-space + collapse
whitespace + casual title-casing. resumeFilePath stores the OneDrive path
(outside the Vercel fs — resumes are opened from HR's OneDrive, not the
deployed app).

Text content is extracted for searchableText (pypdf for PDF, python-docx
for .docx, skip .doc and .zip). Dedupe by lowercase filename: if the same
name appears in two folders, keep the first encountered and log the dup.
Skip 0-byte files.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# pypdf emits a lot of "Ignoring wrong pointing object ..." warnings on real-world PDFs.
logging.getLogger("pypdf").setLevel(logging.ERROR)

ROOT = Path("onedrive-data/seed/resumes")
OUT = Path("src/data/candidates.json")
LOG = Path("logs/resume_import.log")

FOLDER_TO_PROGRAMMES = {
    "Academics Team": ["Academics"],
    "BD & Ops": ["Sales", "Ops"],
    "Marketing resumes": ["Marketing"],
    "Stem & Training- Resumes": ["STEAM"],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def stable_uuid(path_key: str) -> str:
    h = hashlib.sha1(f"gsl-candidate:{path_key}".encode("utf-8")).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-5{h[13:16]}-{h[16:20]}-{h[20:32]}"


def name_from_filename(stem: str) -> str:
    # Strip common suffixes
    s = stem
    for suffix in [
        "-resume", "_resume", " resume", "-cv", "_cv", " cv",
        "updated", "final", "copy", "(1)", "(2)", "(3)", "(4)",
    ]:
        s = re.sub(rf"(?i){re.escape(suffix)}", " ", s)
    # Normalise separators
    s = re.sub(r"[_\-\.]+", " ", s)
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    # Drop leading numbers/codes
    s = re.sub(r"^\d+\s*", "", s)
    # Title case, but leave all-caps initials alone where possible
    if s.isupper() or s.islower():
        s = " ".join(w.capitalize() for w in s.split())
    return s or stem


def sanitize_text(text: str) -> str:
    """Drop surrogate halves + null bytes; collapse runs of whitespace.
    Real-world PDFs and docx frequently contain emoji surrogate halves
    that can't round-trip through UTF-8 JSON."""
    if not text:
        return ""
    # Encode+decode to drop lone surrogates
    cleaned = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    cleaned = cleaned.replace("\x00", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            try:
                from pypdf import PdfReader
            except ImportError:
                return ""
            reader = PdfReader(str(path))
            chunks: list[str] = []
            # Cap at first 5 pages to keep file size sane
            for page in reader.pages[:5]:
                try:
                    chunks.append(page.extract_text() or "")
                except Exception:
                    continue
            return sanitize_text(" ".join(chunks))[:8000]
        if suffix == ".docx":
            try:
                import docx  # type: ignore
            except ImportError:
                return ""
            doc = docx.Document(str(path))
            return sanitize_text(" ".join(p.text for p in doc.paragraphs))[:8000]
    except Exception as err:  # noqa: BLE001
        return f""  # silent, note in log via caller
    return ""


def main() -> int:
    if not ROOT.exists():
        print(f"Not found: {ROOT}", file=sys.stderr)
        return 1

    now = now_iso()
    candidates: list[dict] = []
    seen_filenames: dict[str, str] = {}  # lower filename -> folder path seen first
    duplicates: list[str] = []
    skipped_zero: list[str] = []
    skipped_zip: list[str] = []
    text_failures: list[str] = []
    text_extracted = 0

    for folder_name, programmes in FOLDER_TO_PROGRAMMES.items():
        folder = ROOT / folder_name
        if not folder.exists():
            print(f"Missing folder: {folder}")
            continue
        for fp in sorted(folder.iterdir()):
            if not fp.is_file():
                continue
            suffix = fp.suffix.lower()
            name_lower = fp.name.lower()

            if fp.stat().st_size == 0:
                skipped_zero.append(f"{folder_name}/{fp.name}")
                continue
            if suffix == ".zip":
                skipped_zip.append(f"{folder_name}/{fp.name}")
                continue

            if name_lower in seen_filenames:
                duplicates.append(
                    f"{folder_name}/{fp.name} duplicates {seen_filenames[name_lower]}"
                )
                continue
            seen_filenames[name_lower] = f"{folder_name}/{fp.name}"

            name = name_from_filename(fp.stem)
            text = extract_text(fp) if suffix in (".pdf", ".docx") else ""
            if suffix in (".pdf", ".docx"):
                if text:
                    text_extracted += 1
                else:
                    text_failures.append(f"{folder_name}/{fp.name}")

            path_key = f"{folder_name}/{fp.name}"
            resume_file_path = f"onedrive-data/seed/resumes/{folder_name}/{fp.name}"

            candidates.append({
                "id": stable_uuid(path_key),
                "name": name,
                "email": "",
                "phone": "",
                "source": "HRTeam",
                "resumeFilePath": resume_file_path,
                "searchableText": text or None,
                "tags": {"programmes": programmes},
                "status": "Active",
                "consentedAt": None,
                "notes": f"Legacy resume delivered by HR on 2026-04-24. Original folder: {folder_name}. No consent on file; do not publish externally until HR confirms.",
                "createdAt": now,
                "createdBy": "resume-import",
                "auditLog": [{
                    "timestamp": now,
                    "user": "resume-import",
                    "action": "candidate.create",
                    "after": {
                        "name": name,
                        "source": "HRTeam",
                        "programmes": programmes,
                        "resumeFilePath": resume_file_path,
                    },
                    "notes": "Seeded from HR resume delivery.",
                }],
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(candidates, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("w", encoding="utf-8") as f:
        f.write(f"Resume import run at {now_iso()}\n")
        f.write(f"Candidates seeded: {len(candidates)}\n")
        f.write(f"Text extracted from: {text_extracted} files\n")
        f.write(f"\nSkipped (0-byte): {len(skipped_zero)}\n")
        for x in skipped_zero:
            f.write(f"  {x}\n")
        f.write(f"\nSkipped (nested zip): {len(skipped_zip)}\n")
        for x in skipped_zip:
            f.write(f"  {x}\n")
        f.write(f"\nDuplicates dropped: {len(duplicates)}\n")
        for x in duplicates:
            f.write(f"  {x}\n")
        f.write(f"\nText extraction failures: {len(text_failures)}\n")
        for x in text_failures:
            f.write(f"  {x}\n")

    print(f"Wrote {len(candidates)} candidates to {OUT}")
    print(f"Text extracted: {text_extracted}/{len(candidates)}")
    print(f"0-byte skipped: {len(skipped_zero)}")
    print(f"zip skipped: {len(skipped_zip)}")
    print(f"duplicates: {len(duplicates)}")
    print(f"Details: {LOG}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
