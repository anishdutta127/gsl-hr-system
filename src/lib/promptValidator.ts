/*
 * Pure paste-back validator. Isomorphic: safe to import from client
 * components. No node:* imports; lives separately from prompts.ts (which
 * reads the JSON from disk on the server) so the client bundle stays clean.
 */

import type { Prompt } from './types'

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
