"""
GSL HR System — Excel sync stub.

The real sync script is scoped during the gstack planning cycle (the source
workbook and target entities are not yet finalised). Until then this script
exits cleanly with a clear message so the workflow's mtime guard and skip
logic can be exercised without errors.

Contract when fleshed out: read GSL_HR_XLSX_PATH, diff against src/data/*.json,
write _sync_meta.json with sourceModifiedAt. Mirror scripts/sync_excel.py in
gsl-mou-system (handles multi-sheet reconciliation, id stability, audit log
append on delta).
"""
import os
import sys


def main() -> int:
    xlsx = os.environ.get("GSL_HR_XLSX_PATH")
    if not xlsx:
        print("GSL_HR_XLSX_PATH not set; sync is not yet configured.")
        return 0
    if not os.path.exists(xlsx):
        print(f"Xlsx not found at {xlsx}; nothing to sync.")
        return 0
    print("Sync logic not yet implemented — scoping pending in gstack planning.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
