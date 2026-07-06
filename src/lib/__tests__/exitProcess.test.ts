import { describe, expect, it } from 'vitest'
import {
  applyStepPatch,
  buildHandoverEmail,
  canCloseExitProcess,
  canEditExitProcess,
  canReopenExitProcess,
  canViewExitFinancials,
  canViewExitProcess,
  canViewStepDetail,
  closeExitProcess,
  createExitProcessForLegacy,
  createExitProcessRecord,
  EXIT_REOPEN_HR_WINDOW_MS,
  exitArchivedAt,
  instantiateSteps,
  isArchivedExit,
  isFinancialStep,
  letterTemplateIdForKind,
  mergeExitProcess,
  outstandingStepNames,
  projectFFSettlement,
  recomputeCompletion,
  reopenExitProcess,
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
  FFSettlement,
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

describe('close / reopen (explicit archival)', () => {
  function closed(reason = 'Termination - no experience letter') {
    return closeExitProcess({ process: newProcess(), reason, by: 'hr@gsl.in', now: NOW })
  }

  it('outstandingStepNames lists only mandatory, not-done steps', () => {
    const p = newProcess() // initiate Completed, five others Not Started
    expect(outstandingStepNames(p)).toEqual(['Handover', 'No Dues', 'F&F', 'Relieving', 'Experience'])
  })

  it('isArchivedExit / exitArchivedAt reflect completedAt OR closedAt', () => {
    const p = newProcess()
    expect(isArchivedExit(p)).toBe(false)
    expect(exitArchivedAt(p)).toBeNull()
    const c = closed()
    expect(isArchivedExit(c)).toBe(true)
    expect(exitArchivedAt(c)).toBe(NOW)
    const complete = recomputeCompletion(
      { ...p, steps: p.steps.map((s) => ({ ...s, status: 'Completed' as const })) },
      NOW,
    )
    expect(isArchivedExit(complete)).toBe(true)
  })

  it('closeExitProcess stamps closedAt/By/reason and snapshots outstanding steps', () => {
    const c = closed('Suspension')
    expect(c.closedAt).toBe(NOW)
    expect(c.closedBy).toBe('hr@gsl.in')
    expect(c.closeReason).toBe('Suspension')
    const entry = c.auditLog.at(-1)!
    expect(entry.action).toBe('exit.closed')
    expect(entry.user).toBe('hr@gsl.in')
    expect((entry.after as { outstandingSteps: string[] }).outstandingSteps).toEqual([
      'Handover',
      'No Dues',
      'F&F',
      'Relieving',
      'Experience',
    ])
    expect((entry.after as { reason: string }).reason).toBe('Suspension')
  })

  it('closing never issues letters or mutates steps', () => {
    const before = newProcess()
    const c = closeExitProcess({ process: before, reason: 'x', by: 'hr', now: NOW })
    expect(c.steps).toEqual(before.steps)
  })

  it('closing a fully complete exit records no outstanding steps', () => {
    const complete = recomputeCompletion(
      { ...newProcess(), steps: newProcess().steps.map((s) => ({ ...s, status: 'Completed' as const })) },
      NOW,
    )
    const c = closeExitProcess({ process: complete, reason: '', by: 'hr', now: NOW })
    expect((c.auditLog.at(-1)!.after as { outstandingSteps: string[] }).outstandingSteps).toEqual([])
    expect(c.closeReason).toBeNull()
  })

  it('closeExitProcess is a no-op on an already-closed process', () => {
    const c = closed()
    const again = closeExitProcess({ process: c, reason: 'other', by: 'someone', now: '2026-07-01T00:00:00.000Z' })
    expect(again).toBe(c)
  })

  it('reopenExitProcess clears the close marker and logs it; no-op if not closed', () => {
    const c = closed()
    const re = reopenExitProcess({ process: c, by: 'admin@gsl.in', now: '2026-06-22T02:00:00.000Z', reason: 'misfire' })
    expect(re.closedAt).toBeNull()
    expect(re.closedBy).toBeNull()
    expect(re.closeReason).toBeNull()
    expect(re.auditLog.at(-1)!.action).toBe('exit.reopened')
    // completedAt untouched (was null)
    expect(re.completedAt).toBeNull()
    // no-op on a process that is not closed
    const open = newProcess()
    expect(reopenExitProcess({ process: open, by: 'admin', now: NOW })).toBe(open)
  })

  it('canCloseExitProcess matches the HR/Admin edit gate', () => {
    expect(canCloseExitProcess(session('HR'))).toBe(true)
    expect(canCloseExitProcess(session('Admin'))).toBe(true)
    expect(canCloseExitProcess(session('Leadership'))).toBe(false)
    expect(canCloseExitProcess(session('HOD'))).toBe(false)
    expect(canCloseExitProcess(null)).toBe(false)
  })

  it('canReopenExitProcess: Admin any time, HR only within the window', () => {
    const c = closed()
    const withinWindow = new Date(Date.parse(NOW) + EXIT_REOPEN_HR_WINDOW_MS - 1000).toISOString()
    const pastWindow = new Date(Date.parse(NOW) + EXIT_REOPEN_HR_WINDOW_MS + 1000).toISOString()
    expect(canReopenExitProcess(session('Admin'), c, pastWindow)).toBe(true)
    expect(canReopenExitProcess(session('HR'), c, withinWindow)).toBe(true)
    expect(canReopenExitProcess(session('HR'), c, pastWindow)).toBe(false)
    expect(canReopenExitProcess(session('Leadership'), c, withinWindow)).toBe(false)
    expect(canReopenExitProcess(session('HOD'), c, withinWindow)).toBe(false)
    // an exit that is not closed can never be reopened
    expect(canReopenExitProcess(session('Admin'), newProcess(), NOW)).toBe(false)
  })

  it('createExitProcessForLegacy builds a closeable record from the employee exit header', () => {
    const e = emp({ exit: { lastWorkingDay: '2026-04-30', reason: 'Absconding', relievingLetterIssued: false, experienceLetterIssued: false } })
    const p = createExitProcessForLegacy({ employee: e, templates: TEMPLATES, by: 'hr@gsl.in', now: NOW })
    expect(p.steps.length).toBe(6)
    expect(p.lastWorkingDay).toBe('2026-04-30')
    expect(p.reasonForLeaving).toBe('Absconding')
    expect(p.steps.find((s) => s.kind === 'initiate')!.status).toBe('Completed')
    // closeable: the five non-initiate mandatory steps are outstanding
    expect(outstandingStepNames(p)).toHaveLength(5)
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

describe('projectFFSettlement (F&F ledger single source of truth)', () => {
  function ffProcess(
    data: ExitProcessStep['data'],
    status: ExitProcessStep['status'] = 'In Progress',
    completed?: { completedAt: string | null; completedBy: string | null },
  ): ExitProcess {
    const step: ExitProcessStep = {
      templateId: 'exit-ff-settlement',
      name: 'F&F',
      kind: 'ff',
      isMandatory: true,
      status,
      data,
      notes: '',
      completedAt: completed?.completedAt ?? (status === 'Completed' ? '2026-06-20T00:00:00.000Z' : null),
      completedBy: completed?.completedBy ?? (status === 'Completed' ? 'hr@gsl.in' : null),
    }
    return {
      employeeId: 'emp-1',
      exitType: 'Voluntary',
      reasonForLeaving: '',
      resignationDate: null,
      terminationDate: null,
      lastWorkingDay: '2026-06-30',
      steps: [step],
      completedAt: null,
      createdAt: NOW,
      createdBy: 'seed',
      updatedAt: NOW,
      auditLog: [],
    }
  }

  const legacy: FFSettlement = {
    employeeId: 'emp-1',
    finalSalaryDays: 12,
    leaveEncashment: 3400,
    recoveryItems: [{ label: 'Laptop', amount: 5000 }],
    noticePeriodAdjustment: -2000,
    totalNet: 40000,
    paidAt: null,
    paidBy: null,
    notes: 'from legacy form',
    auditLog: [{ timestamp: NOW, user: 'old', action: 'ff-settlement.create' }],
  }

  it('returns null when there is no F&F amount yet', () => {
    expect(projectFFSettlement({ process: ffProcess({}), existing: undefined, by: 'hr@gsl.in', now: NOW })).toBeNull()
    expect(
      projectFFSettlement({ process: ffProcess({ paymentReference: 'X' }), existing: undefined, by: 'hr@gsl.in', now: NOW }),
    ).toBeNull()
  })

  it('creates a new ledger row from the cockpit amount + payment date', () => {
    const res = projectFFSettlement({
      process: ffProcess({ ffAmount: 104501, paymentDate: '2026-06-25', paymentReference: 'NEFT-9' }, 'Completed', {
        completedAt: '2026-06-25T05:00:00.000Z',
        completedBy: 'hr@gsl.in',
      }),
      existing: undefined,
      by: 'hr@gsl.in',
      now: NOW,
    })!
    expect(res.changed).toBe(true)
    expect(res.next.employeeId).toBe('emp-1')
    expect(res.next.totalNet).toBe(104501)
    expect(res.next.paidAt).toBe('2026-06-25T00:00:00.000Z')
    expect(res.next.paidBy).toBe('hr@gsl.in')
    expect(res.next.finalSalaryDays).toBe(0)
    expect(res.next.recoveryItems).toEqual([])
    expect(res.next.auditLog.at(-1)?.action).toBe('ff-settlement.sync-from-cockpit')
  })

  it('merges onto an existing legacy row, preserving its detail fields', () => {
    const res = projectFFSettlement({
      process: ffProcess({ ffAmount: 41200, paymentDate: '2026-06-28' }, 'Completed'),
      existing: legacy,
      by: 'hr@gsl.in',
      now: NOW,
    })!
    expect(res.changed).toBe(true)
    expect(res.next.totalNet).toBe(41200) // cockpit owns the net figure
    expect(res.next.paidAt).toBe('2026-06-28T00:00:00.000Z')
    expect(res.next.finalSalaryDays).toBe(12)
    expect(res.next.leaveEncashment).toBe(3400)
    expect(res.next.recoveryItems).toEqual([{ label: 'Laptop', amount: 5000 }])
    expect(res.next.notes).toBe('from legacy form')
    expect(res.next.auditLog.length).toBe(2) // original + one sync entry
  })

  it('derives paidAt from step completion when no explicit payment date', () => {
    const res = projectFFSettlement({
      process: ffProcess({ ffAmount: 5000 }, 'Completed', { completedAt: '2026-06-21T09:00:00.000Z', completedBy: 'hr@gsl.in' }),
      existing: undefined,
      by: 'hr@gsl.in',
      now: NOW,
    })!
    expect(res.next.paidAt).toBe('2026-06-21T09:00:00.000Z')
    expect(res.next.paidBy).toBe('hr@gsl.in')
  })

  it('is idempotent: re-projecting the produced row reports no change and appends no audit', () => {
    const first = projectFFSettlement({
      process: ffProcess({ ffAmount: 104501, paymentDate: '2026-06-25' }, 'Completed'),
      existing: undefined,
      by: 'hr@gsl.in',
      now: NOW,
    })!
    const second = projectFFSettlement({
      process: ffProcess({ ffAmount: 104501, paymentDate: '2026-06-25' }, 'Completed'),
      existing: first.next,
      by: 'hr@gsl.in',
      now: '2026-06-30T00:00:00.000Z',
    })!
    expect(second.changed).toBe(false)
    expect(second.next.auditLog.length).toBe(first.next.auditLog.length)
  })
})
