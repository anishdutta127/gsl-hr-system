import { describe, expect, it } from 'vitest'
import {
  applyStepPatch,
  buildHandoverEmail,
  canEditExitProcess,
  canViewExitFinancials,
  canViewExitProcess,
  canViewStepDetail,
  createExitProcessRecord,
  instantiateSteps,
  isFinancialStep,
  letterTemplateIdForKind,
  mergeExitProcess,
  recomputeCompletion,
  settlementWordsDefault,
  stepActionLabel,
  summariseExit,
} from '../exitProcess'
import type { CompanyConfig } from '../company'
import type {
  Employee,
  ExitProcess,
  ExitProcessStep,
  ExitStepTemplate,
  SessionClaims,
} from '../types'

const NOW = '2026-06-22T00:00:00.000Z'

const TEMPLATES: ExitStepTemplate[] = [
  { id: 'exit-initiated', order: 1, name: 'Exit initiated', kind: 'initiate', isMandatory: true },
  { id: 'exit-handover', order: 2, name: 'Handover', kind: 'handover', isMandatory: true },
  { id: 'exit-no-dues', order: 3, name: 'No Dues', kind: 'letter:NO-DUES-v1', isMandatory: true },
  { id: 'exit-ff-settlement', order: 4, name: 'F&F', kind: 'ff', isMandatory: true },
  { id: 'exit-relieving', order: 5, name: 'Relieving', kind: 'letter:RELIEVING-v1', isMandatory: true },
  { id: 'exit-experience', order: 6, name: 'Experience', kind: 'letter:EXPERIENCE-v1', isMandatory: true },
]

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    employeeCode: 'MTPL200',
    name: 'Riya Sharma',
    email: 'riya@gsl.in',
    designation: 'Sr Executive',
    department: 'Sales',
    location: 'Mumbai',
    dateOfJoining: '2024-04-01',
    status: 'Exited',
    createdAt: '2024-04-01',
    createdBy: 'seed',
    auditLog: [],
    ...overrides,
  } as Employee
}

function session(role: SessionClaims['role'], sub = 'u-1', email = 'x@gsl.in'): SessionClaims {
  return { sub, email, name: 'X', role, iat: 0, exp: 0 }
}

const COMPANY: CompanyConfig = {
  name: 'GSL',
  legalName: 'MAF Technologies Private Limited',
  tagline: 'Get Set Learn',
  logoPath: '/x.svg',
  gstin: '',
  cin: '',
  pan: '',
  registeredAddress: { line1: '', line2: '', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' },
  signatory: { name: 'Amit Zaveri', title: 'Chief Executive Officer', email: 's@gsl.in', phone: '' },
  hrContact: { name: 'Shruti', title: 'HR', email: 'hr@gsl.in', whatsapp: '' },
  accountsContact: { name: 'Accounts', email: 'accounts@gsl.in' },
  website: '',
  parentGroup: '',
}

function newProcess(): ExitProcess {
  return createExitProcessRecord({
    employee: emp(),
    templates: TEMPLATES,
    exitType: 'Voluntary',
    reasonForLeaving: 'Better opportunity',
    resignationDate: '2026-05-01',
    terminationDate: null,
    lastWorkingDay: '2026-06-30',
    by: 'hr@gsl.in',
    now: NOW,
  })
}

describe('instantiateSteps + createExitProcessRecord', () => {
  it('instantiates six Not Started steps in order', () => {
    const steps = instantiateSteps(TEMPLATES)
    expect(steps.map((s) => s.templateId)).toEqual([
      'exit-initiated',
      'exit-handover',
      'exit-no-dues',
      'exit-ff-settlement',
      'exit-relieving',
      'exit-experience',
    ])
    expect(steps.every((s) => s.status === 'Not Started')).toBe(true)
  })

  it('marks the initiate step Completed and is not yet complete', () => {
    const p = newProcess()
    const initiate = p.steps.find((s) => s.kind === 'initiate')!
    expect(initiate.status).toBe('Completed')
    expect(initiate.completedBy).toBe('hr@gsl.in')
    expect(summariseExit(p).isComplete).toBe(false)
    expect(p.auditLog[0]!.action).toBe('exit.initiate')
  })
})

describe('summariseExit + recomputeCompletion', () => {
  it('stamps completedAt only when all mandatory steps are Completed/NA', () => {
    let p = newProcess()
    expect(p.completedAt).toBeNull()
    p = {
      ...p,
      steps: p.steps.map((s) => ({ ...s, status: 'Completed' as const })),
    }
    p = recomputeCompletion(p, NOW)
    expect(summariseExit(p).isComplete).toBe(true)
    expect(p.completedAt).toBe(NOW)
  })

  it('clears completedAt if a step regresses', () => {
    let p = newProcess()
    p = { ...p, steps: p.steps.map((s) => ({ ...s, status: 'Completed' as const })), completedAt: NOW }
    p = {
      ...p,
      steps: p.steps.map((s) => (s.kind === 'ff' ? { ...s, status: 'In Progress' as const } : s)),
    }
    p = recomputeCompletion(p, NOW)
    expect(p.completedAt).toBeNull()
  })

  it('counts N/A as satisfying a mandatory step', () => {
    let p = newProcess()
    p = {
      ...p,
      steps: p.steps.map((s) =>
        s.kind === 'initiate' ? s : { ...s, status: s.kind === 'handover' ? 'N/A' : ('Completed' as const) },
      ),
    }
    p = recomputeCompletion(p, NOW)
    expect(p.completedAt).toBe(NOW)
  })
})

describe('applyStepPatch', () => {
  it('completing a step stamps completedAt/By and appends an audit entry', () => {
    const p = newProcess()
    const next = applyStepPatch({
      process: p,
      templateId: 'exit-relieving',
      patch: { status: 'Completed', data: { letterIssuedBy: 'hr@gsl.in' } },
      by: 'hr@gsl.in',
      now: NOW,
      action: 'exit.relieving.update',
    })
    const step = next.steps.find((s) => s.templateId === 'exit-relieving')!
    expect(step.status).toBe('Completed')
    expect(step.completedAt).toBe(NOW)
    expect(step.completedBy).toBe('hr@gsl.in')
    expect(step.data.letterIssuedBy).toBe('hr@gsl.in')
    expect(next.auditLog.at(-1)!.action).toBe('exit.relieving.update')
  })

  it('merges data without dropping prior keys', () => {
    let p = newProcess()
    p = applyStepPatch({ process: p, templateId: 'exit-no-dues', patch: { data: { settlementFigures: 104501 } }, by: 'hr', now: NOW })
    p = applyStepPatch({ process: p, templateId: 'exit-no-dues', patch: { data: { signed: true } }, by: 'hr', now: NOW })
    const step = p.steps.find((s) => s.templateId === 'exit-no-dues')!
    expect(step.data.settlementFigures).toBe(104501)
    expect(step.data.signed).toBe(true)
  })
})

describe('permissions', () => {
  it('canViewExitProcess: HOD only for own direct report', () => {
    const e = emp({ reportingManagerId: 'mgr-7' })
    expect(canViewExitProcess(session('Admin'), e)).toBe(true)
    expect(canViewExitProcess(session('HR'), e)).toBe(true)
    expect(canViewExitProcess(session('Leadership'), e)).toBe(true)
    expect(canViewExitProcess(session('HOD', 'mgr-7'), e)).toBe(true)
    expect(canViewExitProcess(session('HOD', 'someone-else'), e)).toBe(false)
    expect(canViewExitProcess(null, e)).toBe(false)
  })

  it('financials are HR/Admin only', () => {
    expect(canViewExitFinancials(session('HR'))).toBe(true)
    expect(canViewExitFinancials(session('Admin'))).toBe(true)
    expect(canViewExitFinancials(session('Leadership'))).toBe(false)
    expect(canViewExitFinancials(session('HOD'))).toBe(false)
  })

  it('canViewStepDetail hides financial steps from Leadership + HOD, shows them to HR/Admin', () => {
    expect(canViewStepDetail(session('Leadership'), 'ff')).toBe(false)
    expect(canViewStepDetail(session('HOD'), 'letter:NO-DUES-v1')).toBe(false)
    expect(canViewStepDetail(session('HR'), 'ff')).toBe(true)
    // non-financial steps visible to anyone who can view the process
    expect(canViewStepDetail(session('Leadership'), 'handover')).toBe(true)
    expect(canViewStepDetail(session('HOD'), 'letter:RELIEVING-v1')).toBe(true)
  })

  it('only HR/Admin can edit', () => {
    expect(canEditExitProcess(session('HR'))).toBe(true)
    expect(canEditExitProcess(session('Admin'))).toBe(true)
    expect(canEditExitProcess(session('Leadership'))).toBe(false)
    expect(canEditExitProcess(session('HOD'))).toBe(false)
  })
})

describe('buildHandoverEmail', () => {
  it('addresses the reporting manager and always CCs HR + Accounts', () => {
    const mail = buildHandoverEmail({
      employee: emp(),
      reportingManagerName: 'Vishwanath',
      reportingManagerEmail: 'vish@gsl.in',
      company: COMPANY,
    })
    expect(mail.toName).toBe('Vishwanath')
    expect(mail.toEmail).toBe('vish@gsl.in')
    expect(mail.ccEmails).toContain('hr@gsl.in')
    expect(mail.ccEmails).toContain('accounts@gsl.in')
    expect(mail.subject).toContain('Riya Sharma')
    expect(mail.body).toContain('Knowledge transfer document submitted and reviewed')
    expect(mail.checklist.length).toBeGreaterThan(0)
  })

  it('falls back gracefully with no RM email and no accounts contact', () => {
    const mail = buildHandoverEmail({
      employee: emp(),
      reportingManagerName: null,
      reportingManagerEmail: null,
      company: { ...COMPANY, accountsContact: undefined },
    })
    expect(mail.toEmail).toBeNull()
    expect(mail.toName).toBe('Reporting Manager')
    expect(mail.ccEmails).toEqual(['hr@gsl.in'])
  })
})

describe('mergeExitProcess (migration, idempotent, no clobber)', () => {
  function partial(): ExitProcess {
    const steps: ExitProcessStep[] = [
      { templateId: 'exit-initiated', name: 'Exit initiated', kind: 'initiate', isMandatory: true, status: 'Completed', data: {}, notes: '', completedAt: NOW, completedBy: 'hr' },
      { templateId: 'exit-handover', name: 'Handover', kind: 'handover', isMandatory: true, status: 'Completed', data: {}, notes: '', completedAt: NOW, completedBy: 'hr' },
      { templateId: 'exit-relieving', name: 'Relieving', kind: 'letter:RELIEVING-v1', isMandatory: true, status: 'Not Started', data: {}, notes: '', completedAt: null, completedBy: null },
    ]
    return {
      employeeId: 'emp-1',
      exitType: 'Voluntary',
      reasonForLeaving: 'x',
      resignationDate: null,
      terminationDate: null,
      lastWorkingDay: '2026-06-30',
      steps,
      completedAt: null,
      createdAt: NOW,
      createdBy: 'hr',
      updatedAt: NOW,
      auditLog: [],
    }
  }

  it('backfills missing No Dues + F&F steps without disturbing completed ones', () => {
    const merged = mergeExitProcess({
      existing: partial(),
      templates: TEMPLATES,
      employee: emp(),
      signals: {},
      now: NOW,
    })
    expect(merged.steps.map((s) => s.templateId)).toEqual([
      'exit-initiated',
      'exit-handover',
      'exit-no-dues',
      'exit-ff-settlement',
      'exit-relieving',
      'exit-experience',
    ])
    expect(merged.steps.find((s) => s.kind === 'handover')!.status).toBe('Completed')
    expect(merged.steps.find((s) => s.kind === 'ff')!.status).toBe('Not Started')
    expect(merged.steps.find((s) => s.kind === 'letter:NO-DUES-v1')!.status).toBe('Not Started')
  })

  it('maps legacy completion signals onto steps', () => {
    const merged = mergeExitProcess({
      existing: partial(),
      templates: TEMPLATES,
      employee: emp(),
      signals: { relievingLetterIssued: true, ffPaidAt: '2026-07-15T00:00:00.000Z', ffAmount: 104501 },
      now: NOW,
    })
    expect(merged.steps.find((s) => s.kind === 'letter:RELIEVING-v1')!.status).toBe('Completed')
    const ff = merged.steps.find((s) => s.kind === 'ff')!
    expect(ff.status).toBe('Completed')
    expect(ff.data.paymentDate).toBe('2026-07-15')
    expect(ff.data.ffAmount).toBe(104501)
  })

  it('is idempotent: re-running never resets a Completed step', () => {
    const once = mergeExitProcess({ existing: partial(), templates: TEMPLATES, employee: emp(), signals: { relievingLetterIssued: true }, now: NOW })
    const twice = mergeExitProcess({ existing: once, templates: TEMPLATES, employee: emp(), signals: {}, now: '2026-08-01T00:00:00.000Z' })
    expect(twice.steps.find((s) => s.kind === 'letter:RELIEVING-v1')!.status).toBe('Completed')
    expect(twice.steps.length).toBe(6)
    expect(twice.steps.find((s) => s.kind === 'handover')!.completedAt).toBe(NOW)
  })

  it('creates a fresh process from an in-flight exit when none exists', () => {
    const merged = mergeExitProcess({
      existing: undefined,
      templates: TEMPLATES,
      employee: emp({ exit: { lastWorkingDay: '2026-06-30', reason: 'Resignation', relievingLetterIssued: false, experienceLetterIssued: false } }),
      signals: {},
      now: NOW,
    })
    expect(merged.steps.length).toBe(6)
    expect(merged.lastWorkingDay).toBe('2026-06-30')
    expect(merged.steps.find((s) => s.kind === 'initiate')!.status).toBe('Completed')
  })
})

describe('small helpers', () => {
  it('settlementWordsDefault', () => {
    expect(settlementWordsDefault(104501)).toBe('One Lakh Four Thousand Five Hundred One only')
    expect(settlementWordsDefault(0)).toBe('')
    expect(settlementWordsDefault(null)).toBe('')
  })

  it('letterTemplateIdForKind + isFinancialStep', () => {
    expect(letterTemplateIdForKind('letter:RELIEVING-v1')).toBe('RELIEVING-v1')
    expect(letterTemplateIdForKind('handover')).toBeNull()
    expect(isFinancialStep('ff')).toBe(true)
    expect(isFinancialStep('letter:NO-DUES-v1')).toBe(true)
    expect(isFinancialStep('letter:RELIEVING-v1')).toBe(false)
  })

  it('stepActionLabel', () => {
    expect(stepActionLabel('ff')).toBe('ff-settlement')
    expect(stepActionLabel('letter:NO-DUES-v1')).toBe('no-dues')
    expect(stepActionLabel('handover')).toBe('handover')
  })
})
