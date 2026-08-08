/*
 * Profile every src/data/*.json file so the schema is derived from the DATA,
 * not only from types.ts.
 *
 * Types alone miss what is actually in the files: fields that are optional in
 * practice, fields present in data but absent from the type, real-world nulls,
 * and drift from records written by older code paths. This prints, per entity:
 * every field seen, its observed JS types, how many records carry it, and
 * whether it is ever null.
 *
 *   node scripts/db/profile_json.mjs            # summary for every entity
 *   node scripts/db/profile_json.mjs roles      # detail for one entity
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), 'src', 'data')
const only = process.argv[2]

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** Shallow profile: top-level fields of each record. */
function profile(records) {
  const fields = new Map()
  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue
    for (const [k, v] of Object.entries(rec)) {
      if (!fields.has(k)) fields.set(k, { present: 0, types: new Set(), nulls: 0, maxLen: 0 })
      const f = fields.get(k)
      f.present += 1
      f.types.add(typeOf(v))
      if (v === null) f.nulls += 1
      if (typeof v === 'string') f.maxLen = Math.max(f.maxLen, v.length)
      if (Array.isArray(v)) f.maxLen = Math.max(f.maxLen, v.length)
    }
  }
  return fields
}

const files = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

let totalRecords = 0
const report = []

for (const file of files) {
  const entity = file.replace(/\.json$/, '')
  if (only && entity !== only) continue

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8') || 'null')
  } catch (err) {
    report.push({ entity, error: String(err.message).slice(0, 80) })
    continue
  }

  const isList = Array.isArray(parsed)
  const records = isList ? parsed : parsed === null ? [] : [parsed]
  totalRecords += records.length
  const fields = profile(records)

  report.push({ entity, isList, count: records.length, fields })
}

if (only) {
  for (const r of report) {
    if (r.error) {
      console.log(`${r.entity}: PARSE ERROR ${r.error}`)
      continue
    }
    console.log(`\n${r.entity}  (${r.count} records, ${r.isList ? 'list' : 'singleton object'})`)
    const rows = [...r.fields.entries()].sort((a, b) => b[1].present - a[1].present)
    for (const [name, f] of rows) {
      const optional = f.present < r.count ? ` OPTIONAL(${f.present}/${r.count})` : ''
      const nulls = f.nulls ? ` nulls=${f.nulls}` : ''
      const len = f.maxLen ? ` max=${f.maxLen}` : ''
      console.log(`   ${name.padEnd(34)} ${[...f.types].join('|').padEnd(22)}${optional}${nulls}${len}`)
    }
  }
} else {
  console.log('entity                              recs  shape       fields  nested  audit')
  for (const r of report) {
    if (r.error) {
      console.log(`${r.entity.padEnd(36)} PARSE ERROR: ${r.error}`)
      continue
    }
    const nested = [...r.fields.values()].filter((f) => f.types.has('object') || f.types.has('array')).length
    const hasAudit = r.fields.has('auditLog')
    console.log(
      `${r.entity.padEnd(36)}${String(r.count).padStart(5)}  ${(r.isList ? 'list' : 'singleton').padEnd(11)}${String(r.fields.size).padStart(6)}${String(nested).padStart(8)}   ${hasAudit ? 'yes' : '-'}`,
    )
  }
  console.log(`\nTOTAL RECORDS: ${totalRecords}`)
}
