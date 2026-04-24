/*
 * Pure scoring function mapping a role to candidates in the pool.
 *
 * Score components (0-100 composite):
 *   +35 for full programme overlap (all role programme tags present on candidate)
 *   +15 partial programme overlap (>= 1 tag matches)
 *   +40 for keyword hits in searchableText, proportional to role's must-haves
 *   +10 for matching the role.department naming convention
 *   -25 if candidate is already in the pipeline for this role at any non-terminal stage
 *
 * Hits a reasonable top-N without pretending to be a real ML ranker.
 */

import type { Candidate, Role, Application } from './types'
import { isTerminal } from './pipeline'

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'this', 'that',
  'will', 'have', 'has', 'team', 'work', 'role', 'job', 'from', 'into',
  'about', 'must', 'need', 'should', 'they', 'them', 'their', 'who',
  'what', 'which', 'when', 'where', 'all', 'any', 'some', 'such', 'than',
])

const DEPARTMENT_PROGRAMME: Record<string, string[]> = {
  academics: ['Academics', 'STEAM'],
  marketing: ['Marketing'],
  sales: ['Sales'],
  'premium sales': ['Sales'],
  'stem & training': ['STEAM'],
  'stem and training': ['STEAM'],
  'product and training': ['STEAM'],
  operations: ['Ops'],
  ops: ['Ops'],
}

function keywordsFromRole(role: Role): Set<string> {
  const sources: string[] = [
    role.title,
    role.department,
    role.description ?? '',
    ...(role.mustHaves ?? []),
    ...(role.responsibilities ?? []),
    ...(role.niceToHaves ?? []),
  ]
  const bag = new Set<string>()
  for (const s of sources) {
    if (!s) continue
    for (const raw of s.toLowerCase().split(/[^a-z0-9+\-#]+/)) {
      if (raw.length < 4) continue
      if (STOP_WORDS.has(raw)) continue
      bag.add(raw)
    }
  }
  return bag
}

export interface MatchResult {
  candidate: Candidate
  score: number
  reasons: string[]
  alreadyInPipeline: boolean
}

export function matchCandidatesToRole(
  role: Role,
  candidates: Candidate[],
  applications: Application[],
): MatchResult[] {
  const keywords = keywordsFromRole(role)
  const roleProgrammes = DEPARTMENT_PROGRAMME[role.department.toLowerCase()] ?? []
  const activeForRole = new Set(
    applications
      .filter((a) => a.roleId === role.id && !isTerminal(a.currentStage))
      .map((a) => a.candidateId),
  )

  const results: MatchResult[] = []

  for (const c of candidates) {
    if (c.status === 'Archived') continue

    const reasons: string[] = []
    let score = 0

    const programmes = c.tags?.programmes ?? []
    if (roleProgrammes.length > 0 && programmes.length > 0) {
      const overlap = programmes.filter((p) => roleProgrammes.includes(p))
      if (overlap.length === roleProgrammes.length) {
        score += 35
        reasons.push(`Full programme match: ${overlap.join(', ')}`)
      } else if (overlap.length > 0) {
        score += 15
        reasons.push(`Partial programme match: ${overlap.join(', ')}`)
      }
    }

    // Keyword hits in searchableText
    const text = (c.searchableText ?? '').toLowerCase()
    if (text && keywords.size > 0) {
      let hits = 0
      const matched: string[] = []
      for (const k of keywords) {
        if (text.includes(k)) {
          hits += 1
          if (matched.length < 5) matched.push(k)
        }
      }
      if (hits > 0) {
        // Scale to max 40; 10 hits caps
        const weighted = Math.min(40, Math.round((hits / 10) * 40))
        score += weighted
        reasons.push(`${hits} role-keyword${hits === 1 ? '' : 's'} in resume${matched.length > 0 ? ' (e.g., ' + matched.join(', ') + ')' : ''}`)
      }
    }

    // Department convention bonus
    const deptLower = role.department.toLowerCase()
    if (programmes.some((p) => (DEPARTMENT_PROGRAMME[deptLower] ?? []).includes(p))) {
      score += 10
    }

    const alreadyIn = activeForRole.has(c.id)
    if (alreadyIn) {
      score -= 25
      reasons.push('Already in this pipeline')
    }

    if (score <= 0) continue
    results.push({ candidate: c, score: Math.max(0, Math.min(100, score)), reasons, alreadyInPipeline: alreadyIn })
  }

  results.sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
  return results
}
