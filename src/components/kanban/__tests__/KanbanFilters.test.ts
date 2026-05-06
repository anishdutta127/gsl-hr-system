import { describe, expect, it } from 'vitest'
import { applyFilters, parseFiltersFromQuery } from '../KanbanFilters'
import type { ApplicationWithCandidate } from '@/lib/data'

const NOW = Date.parse('2026-05-06T12:00:00Z')
const MS = (days: number) => NOW - days * 86_400_000

const app = (
  id: string,
  overrides: Partial<ApplicationWithCandidate> = {},
): ApplicationWithCandidate => ({
  id,
  candidateId: `c-${id}`,
  roleId: 'role-1',
  currentStage: 'Sourced',
  stageEnteredAt: new Date(MS(1)).toISOString(),
  createdAt: new Date(MS(1)).toISOString(),
  createdBy: 'shruti@gsl.in',
  auditLog: [],
  candidate: undefined,
  ...overrides,
})

describe('applyFilters', () => {
  it('returns all when no filters set', () => {
    const apps = [app('1'), app('2')]
    expect(applyFilters(apps, { filters: [], currentUserEmail: 'x@y' })).toHaveLength(2)
  })

  it('"stale" keeps only candidates inactive for ≥ 7 days', () => {
    const apps = [
      app('a', { stageEnteredAt: new Date(MS(2)).toISOString() }),
      app('b', { stageEnteredAt: new Date(MS(8)).toISOString() }),
      app('c', { stageEnteredAt: new Date(MS(30)).toISOString() }),
    ]
    const out = applyFilters(apps, {
      filters: ['stale'],
      currentUserEmail: 'x@y',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['b', 'c'])
  })

  it('"stale" excludes terminal stages even when older than 7 days', () => {
    const apps = [
      app('rejected-old', {
        currentStage: 'Rejected',
        stageEnteredAt: new Date(MS(60)).toISOString(),
      }),
      app('joined-old', {
        currentStage: 'Joined',
        stageEnteredAt: new Date(MS(60)).toISOString(),
      }),
      app('shortlisted-old', {
        currentStage: 'Shortlisted',
        stageEnteredAt: new Date(MS(15)).toISOString(),
      }),
    ]
    const out = applyFilters(apps, {
      filters: ['stale'],
      currentUserEmail: 'x@y',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['shortlisted-old'])
  })

  it('"mine" matches createdBy', () => {
    const apps = [
      app('a', { createdBy: 'shruti@gsl.in' }),
      app('b', { createdBy: 'riddhi@gsl.in' }),
    ]
    const out = applyFilters(apps, {
      filters: ['mine'],
      currentUserEmail: 'shruti@gsl.in',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['a'])
  })

  it('"new" keeps candidates created within 7 days', () => {
    const apps = [
      app('a', { createdAt: new Date(MS(2)).toISOString() }),
      app('b', { createdAt: new Date(MS(10)).toISOString() }),
    ]
    const out = applyFilters(apps, {
      filters: ['new'],
      currentUserEmail: 'x@y',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['a'])
  })

  it('combines filters with AND', () => {
    const apps = [
      // Mine + stale
      app('a', {
        createdBy: 'shruti@gsl.in',
        stageEnteredAt: new Date(MS(20)).toISOString(),
      }),
      // Mine but fresh
      app('b', {
        createdBy: 'shruti@gsl.in',
        stageEnteredAt: new Date(MS(2)).toISOString(),
      }),
      // Stale but not mine
      app('c', {
        createdBy: 'riddhi@gsl.in',
        stageEnteredAt: new Date(MS(20)).toISOString(),
      }),
    ]
    const out = applyFilters(apps, {
      filters: ['mine', 'stale'],
      currentUserEmail: 'shruti@gsl.in',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['a'])
  })

  it('"mineToAction" requires both mine + 3-days-since-entered + non-terminal', () => {
    const apps = [
      app('mine-fresh', {
        createdBy: 'shruti@gsl.in',
        stageEnteredAt: new Date(MS(1)).toISOString(),
      }),
      app('mine-stuck', {
        createdBy: 'shruti@gsl.in',
        stageEnteredAt: new Date(MS(4)).toISOString(),
      }),
      app('mine-rejected', {
        createdBy: 'shruti@gsl.in',
        currentStage: 'Rejected',
        stageEnteredAt: new Date(MS(4)).toISOString(),
      }),
    ]
    const out = applyFilters(apps, {
      filters: ['mineToAction'],
      currentUserEmail: 'shruti@gsl.in',
      now: NOW,
    })
    expect(out.map((a) => a.id)).toEqual(['mine-stuck'])
  })

  it('returns empty when filters require an unknown user', () => {
    const apps = [app('a', { createdBy: 'shruti@gsl.in' })]
    expect(
      applyFilters(apps, {
        filters: ['mine'],
        currentUserEmail: '',
        now: NOW,
      }),
    ).toEqual([])
  })
})

describe('parseFiltersFromQuery', () => {
  it('parses CSV', () => {
    expect(parseFiltersFromQuery('mine,stale')).toEqual(['mine', 'stale'])
  })

  it('drops unknown values', () => {
    expect(parseFiltersFromQuery('mine,bogus,new')).toEqual(['mine', 'new'])
  })

  it('returns empty for missing input', () => {
    expect(parseFiltersFromQuery(undefined)).toEqual([])
    expect(parseFiltersFromQuery('')).toEqual([])
  })

  it('joins arrays', () => {
    expect(parseFiltersFromQuery(['mine', 'stale'])).toEqual(['mine', 'stale'])
  })
})
