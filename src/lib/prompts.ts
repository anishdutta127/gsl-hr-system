/*
 * Prompt library loader + paste-back validator (CP3 + CP4).
 *
 * Prompts live in src/data/prompts.json, each with a minimal JSON schema
 * declaring required keys + their types. The validator is deliberately
 * strict: a malformed paste-back loudly fails instead of silently losing
 * data. Quality floor (CP5): a prompt ships only when `validatedBy` +
 * `validatedAt` are populated; skeletons are filtered out.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Prompt } from './types'

export { validateAgainstSchema, type ValidationResult } from './promptValidator'

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
