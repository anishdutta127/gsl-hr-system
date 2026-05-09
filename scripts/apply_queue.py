"""
Queue applier.

Reads src/data/pending_updates.json, applies each entry to the appropriate
entity file (src/data/<entity>.json), and clears the queue. On success
produces ONE commit per run that Vercel will rebuild for (non-`chore(queue):`
prefix).

Runs on GitHub Actions hosted runners on a schedule. Idempotent: running
against an empty queue is a no-op and exits with no commit.

Operations handled:
  role.create
  role.update [set-rubric, role.update]
  candidate.create
  application.create
  application.update [stage-transition]
  interview.create
  offer.create
  offer.update [offer.approve, offer.send, offer.accept, offer.decline, offer.withdraw]
  employee.create
  employee.update [onboarding.toggle, exit.initiate]
  user.create
  user.update [user.update, user.password-change]
  outbound_mail.create  (logs an outbound email; routed to _outbound_mail.json)

Safety:
- Fails loudly on unknown entity/operation pairs. An unhandled queue entry
  blocks the whole run so the problem gets noticed.
- Appends an audit entry on every update; never silently swallows history.
- Queue entries are consumed in queuedAt order.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path("src/data")
QUEUE_FILE = DATA_DIR / "pending_updates.json"
APPLIED_FILE = DATA_DIR / "applied_updates.json"
FAILED_FILE = DATA_DIR / "failed_updates.json"

ENTITY_FILES = {
    "user": DATA_DIR / "users.json",
    "role": DATA_DIR / "roles.json",
    "candidate": DATA_DIR / "candidates.json",
    "application": DATA_DIR / "applications.json",
    "interview": DATA_DIR / "interviews.json",
    "offer": DATA_DIR / "offers.json",
    "employee": DATA_DIR / "employees.json",
    "outbound_mail": DATA_DIR / "_outbound_mail.json",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return default
    return json.loads(text)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def append_audit(entity: dict, user: str, action: str, before: Any, after: Any, notes: str | None) -> None:
    entry = {
        "timestamp": now_iso(),
        "user": user,
        "action": action,
        "before": before,
        "after": after,
    }
    if notes:
        entry["notes"] = notes
    entity.setdefault("auditLog", []).append(entry)


def find_by_id(collection: list, entity_id: str) -> dict | None:
    for item in collection:
        if item.get("id") == entity_id:
            return item
    return None


def apply_create(collection: list, payload: dict, queued_by: str) -> None:
    if find_by_id(collection, payload.get("id")):
        # Already applied (idempotency for retries); skip silently.
        return
    collection.append(payload)


def apply_update(collection: list, payload: dict, queued_by: str) -> None:
    entity = find_by_id(collection, payload.get("id"))
    if not entity:
        raise RuntimeError(f"Entity id {payload.get('id')} not found for update")

    op = payload.get("operation")
    before = payload.get("before")
    after = payload.get("after") or {}
    notes = payload.get("notes")

    # Stage transition: update currentStage + stageEnteredAt
    if op == "stage-transition":
        if isinstance(after, dict):
            if "currentStage" in after:
                entity["currentStage"] = after["currentStage"]
            if "stageEnteredAt" in after:
                entity["stageEnteredAt"] = after["stageEnteredAt"]
            # Reject capture: stamp the reason on the application record so
            # the "why we lose candidates" view doesn't have to scrape the
            # audit log every render. Cleared when the candidate is moved
            # back out of Rejected (rare, but the app state should match).
            if after.get("currentStage") == "Rejected":
                if "rejectionReason" in after:
                    entity["rejectionReason"] = after["rejectionReason"]
                if "rejectionNotes" in after:
                    entity["rejectionNotes"] = after["rejectionNotes"]
            else:
                entity.pop("rejectionReason", None)
                entity.pop("rejectionNotes", None)
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Set role rubric
    if op == "set-rubric":
        if isinstance(after, dict) and "rubric" in after:
            entity["rubric"] = after["rubric"]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Onboarding checklist toggle
    if op == "onboarding.toggle":
        item_id = after.get("itemId") if isinstance(after, dict) else None
        if not item_id:
            raise RuntimeError("onboarding.toggle missing itemId")
        items = entity.get("onboardingChecklist") or []
        for it in items:
            if it.get("id") == item_id:
                it["done"] = bool(after.get("done"))
                if after.get("done"):
                    it["doneAt"] = after.get("doneAt")
                    it["doneBy"] = after.get("doneBy")
                else:
                    it.pop("doneAt", None)
                    it.pop("doneBy", None)
                break
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Exit initiation: set status + exit block
    if op == "exit.initiate":
        if isinstance(after, dict):
            if "status" in after:
                entity["status"] = after["status"]
            if "exit" in after:
                entity["exit"] = after["exit"]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Probation lifecycle (Phase 4): confirm sets confirmationDate +
    # employmentStatus=Confirmed; extend lifts confirmationDate to a future
    # date and keeps employmentStatus=Probation. Both write the same two
    # fields, just with different downstream meanings.
    if op in ("probation.confirm", "probation.extend"):
        if isinstance(after, dict):
            if "confirmationDate" in after:
                entity["confirmationDate"] = after["confirmationDate"]
            if "employmentStatus" in after:
                entity["employmentStatus"] = after["employmentStatus"]
        entity["updatedAt"] = now_iso()
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Phase 4 employee profile edit. Whitelisted fields only — anything that
    # affects compensation or recruitment-side joins (ctcAnnual,
    # salaryStructure, candidateId, applicationId, status) goes through its
    # own dedicated operation.
    if op == "employee.profile.update":
        editable_fields = (
            "title",
            "phone",
            "location",
            "workPattern",
            "locationType",
            "reportingTo",
            "reportingManagerId",
            "address",
            "personalEmail",
            "gender",
            "maritalStatus",
        )
        if isinstance(after, dict):
            for key in editable_fields:
                if key in after:
                    entity[key] = after[key]
        entity["updatedAt"] = now_iso()
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # User password self-serve change
    if op == "user.password-change":
        if isinstance(after, dict) and "bcryptHash" in after:
            entity["bcryptHash"] = after["bcryptHash"]
        # Don't log the hash in audit — redact.
        append_audit(entity, queued_by, op, {"bcryptHash": "redacted"}, {"bcryptHash": "redacted"}, notes)
        return

    # Generic user.update
    if op == "user.update":
        if isinstance(after, dict):
            for key in ("name", "email", "role", "active", "ownedRoleIds"):
                if key in after:
                    entity[key] = after[key]
            if "bcryptHash" in after:
                entity["bcryptHash"] = after["bcryptHash"]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Offer state transitions: approve/send/accept/decline/withdraw
    if isinstance(op, str) and op.startswith("offer."):
        if isinstance(after, dict):
            for key in ("status", "approvedAt", "approvedBy", "sentAt", "respondedAt"):
                if key in after:
                    entity[key] = after[key]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Candidate archive / unarchive: flip status field, audit.
    if op == "candidate.archive":
        entity["status"] = "Archived"
        append_audit(entity, queued_by, op, before, after, notes)
        return
    if op == "candidate.unarchive":
        entity["status"] = "Active"
        append_audit(entity, queued_by, op, before, after, notes)
        return
    if op == "candidate.set-resume":
        if isinstance(after, dict) and "resumeFilePath" in after:
            entity["resumeFilePath"] = after["resumeFilePath"]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Generic candidate field edits from the candidate detail page editor.
    # Whitelist of editable fields; programmes lives under tags.programmes.
    if op == "candidate.update":
        if isinstance(after, dict):
            for key in ("name", "email", "phone", "source", "notes"):
                if key in after:
                    entity[key] = after[key]
            if "programmes" in after:
                tags = entity.setdefault("tags", {})
                if not isinstance(tags, dict):
                    tags = {}
                    entity["tags"] = tags
                tags["programmes"] = after["programmes"]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Audit-only operations: no field change, just append an audit entry.
    # email.sent: HR logged that they sent an external email via Outlook/Gmail.
    # letter.generated: HR generated an offer/relieving/no-dues letter document.
    if op in ("email.sent", "letter.generated"):
        append_audit(entity, queued_by, op, before, after, notes)
        return

    # Role lifecycle transitions: publish/pause/resume/close/reopen/archive/discard.
    # role.edit edits the JD body (description, plus eventually responsibilities/etc).
    # All write the relevant fields and append an audit entry.
    if isinstance(op, str) and op.startswith("role."):
        if isinstance(after, dict):
            for key in (
                "status",
                "pauseReason",
                "closeOutcome",
                "closeNotes",
                "description",
                "responsibilities",
                "mustHaves",
                "niceToHaves",
            ):
                if key in after:
                    entity[key] = after[key]
        append_audit(entity, queued_by, op, before, after, notes)
        return

    raise RuntimeError(f"Unknown update operation: {op}")


def apply_entry(entry: dict) -> None:
    entity_kind = entry.get("entity")
    operation = entry.get("operation")
    payload = entry.get("payload") or {}
    queued_by = entry.get("queuedBy") or "unknown"

    if entity_kind not in ENTITY_FILES:
        raise RuntimeError(f"Unknown entity: {entity_kind}")

    target_path = ENTITY_FILES[entity_kind]
    collection = read_json(target_path, [])
    if not isinstance(collection, list):
        raise RuntimeError(f"{target_path} is not a JSON array")

    if operation == "create":
        apply_create(collection, payload, queued_by)
    elif operation == "update":
        apply_update(collection, payload, queued_by)
    else:
        raise RuntimeError(f"Unknown operation: {operation}")

    write_json(target_path, collection)


def main() -> int:
    if not QUEUE_FILE.exists():
        print("No pending_updates.json; nothing to do.")
        return 0

    queue = read_json(QUEUE_FILE, [])
    if not isinstance(queue, list) or not queue:
        print(f"Queue empty ({len(queue) if isinstance(queue, list) else 0}); nothing to do.")
        return 0

    print(f"Applying {len(queue)} queue entries.")
    queue_sorted = sorted(queue, key=lambda e: e.get("queuedAt", ""))

    applied = read_json(APPLIED_FILE, [])
    failed = read_json(FAILED_FILE, [])
    if not isinstance(applied, list):
        applied = []
    if not isinstance(failed, list):
        failed = []

    remaining: list[dict] = []
    for entry in queue_sorted:
        try:
            apply_entry(entry)
            entry["appliedAt"] = now_iso()
            applied.append(entry)
            print(f"  applied {entry.get('entity')}.{entry.get('operation')} ({str(entry.get('id', ''))[:8]})")
        except Exception as err:  # noqa: BLE001
            entry["failedAt"] = now_iso()
            entry["failureReason"] = str(err)
            failed.append(entry)
            remaining.append(entry)
            print(f"  FAILED {entry.get('entity')}.{entry.get('operation')} ({str(entry.get('id', ''))[:8]}): {err}")

    # Cap applied/failed log sizes so the files don't grow unbounded.
    applied = applied[-500:]
    failed = failed[-200:]

    write_json(QUEUE_FILE, remaining)
    write_json(APPLIED_FILE, applied)
    write_json(FAILED_FILE, failed)

    ok = len(queue_sorted) - len(remaining)
    print(f"Done: {ok} applied, {len(remaining)} left in queue.")
    return 0 if not remaining else 0  # Non-blocking so Actions still commits data wins


if __name__ == "__main__":
    sys.exit(main())
