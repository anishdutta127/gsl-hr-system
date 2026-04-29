/*
 * Salary structure → letter token map.
 *
 * The appointment letter (APPOINTMENT-SALES-v1) ships fourteen rupee tokens
 * for the PF/PT block: monthly + annual for Basic, HRA, Gross, PF, PT, Total
 * Deductions, and Net. We store the structure once per employee with eight
 * source fields and derive the rest at letter time.
 *
 * Conventions:
 *   - All stored amounts are annual rupees, except ptMonthly which is per-month.
 *   - Monthly is annual / 12 with banker-rounding to the nearest rupee.
 *   - Output strings use Indian comma grouping (1,00,000 not 100,000).
 */

import { formatRs } from './format'
import type { Employee } from './types'

export type SalaryStructure = NonNullable<Employee['salaryStructure']>

export interface SalaryLetterTokens {
  ctcAnnual: string
  basicMonthly: string
  basicAnnual: string
  hraMonthly: string
  hraAnnual: string
  grossMonthly: string
  grossAnnual: string
  pfMonthly: string
  pfAnnual: string
  ptMonthly: string
  ptAnnual: string
  totalDeductionsMonthly: string
  totalDeductionsAnnual: string
  netMonthly: string
  netAnnual: string
}

function monthly(annual: number): number {
  return Math.round(annual / 12)
}

function indian(amount: number): string {
  return formatRs(amount, { bare: true })
}

export function deriveSalaryTokens(s: SalaryStructure): SalaryLetterTokens {
  const grossAnnual = s.basic + s.hra + s.conveyance + s.otherAllowances
  const ptAnnual = s.ptMonthly * 12
  const totalDeductionsAnnual = s.pfEmployee + ptAnnual

  return {
    ctcAnnual: indian(s.ctc),
    basicMonthly: indian(monthly(s.basic)),
    basicAnnual: indian(s.basic),
    hraMonthly: indian(monthly(s.hra)),
    hraAnnual: indian(s.hra),
    grossMonthly: indian(monthly(grossAnnual)),
    grossAnnual: indian(grossAnnual),
    pfMonthly: indian(monthly(s.pfEmployee)),
    pfAnnual: indian(s.pfEmployee),
    ptMonthly: indian(s.ptMonthly),
    ptAnnual: indian(ptAnnual),
    totalDeductionsMonthly: indian(monthly(totalDeductionsAnnual)),
    totalDeductionsAnnual: indian(totalDeductionsAnnual),
    netMonthly: indian(monthly(s.netTakeHome)),
    netAnnual: indian(s.netTakeHome),
  }
}
