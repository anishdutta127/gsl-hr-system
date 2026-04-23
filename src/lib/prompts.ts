/*
 * Prompt library loader + paste-back validator (CP3 + CP4).
 *
 * Prompts live in src/data/prompts.json, each with a minimal JSON schema
 * declaring required keys + their types. The validator is deliberately
 * strict: a malformed paste-back loudly fails instead of silently losing
 * data. Quality floor (CP5): a prompt ships only when `validatedBy` +
 * `validatedAt` are populated — skeletons are filtered out.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Prompt } from './types'

export function loadPrompts(): Prompt[] {
  const filepath = path.join(process.cwd(), 'src', 'data', 'prompts.json')
  try {
    if (!fs.existsSync(filepath)) return []
    const text = fs.readFileSync(filepath, 'utf-8')
    if (!text.trim()) return []
    const all = JSON.parse(text) as Prompt[]
    return all.filter((p) => p.validatedBy && p.validatedAt)
  } catch {
    return []
  }
}

export function findPromptById(id: string): Prompt | undefined {
  return loadPrompts().find((p) => p.id === id)
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  parsed?: Record<string, unknown>
}

function primitiveTypeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Validate a paste-back JSON string against a prompt's output schema.
 * Returns the parsed object on success; the list of specific problems on failure.
 * Intentionally terse: HR needs to know exactly what to fix in the Claude output.
 */
export function validateAgainstSchema(raw: string, prompt: Prompt): ValidationResult {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Not valid JSON. ${err instanceof Error ? err.message : String(err)}. Check for trailing commas or missing quotes.`,
      ],
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ['Output must be a JSON object (starts with {, ends with }).'] }
  }

  const obj = parsed as Record<string, unknown>

  for (const key of prompt.outputSchema.required) {
    if (!(key in obj)) {
      errors.push(`Missing required key: "${key}".`)
    }
  }

  for (const [key, spec] of Object.entries(prompt.outputSchema.properties)) {
    if (!(key in obj)) continue
    const actual = primitiveTypeOf(obj[key])
    const expected = spec.type
    if (expected === 'number' && obj[key] === null) continue
    if (actual !== expected) {
      errors.push(`"${key}" should be ${expected}; got ${actual}.`)
    }
  }

  return { valid: errors.length === 0, errors, parsed: obj }
}
