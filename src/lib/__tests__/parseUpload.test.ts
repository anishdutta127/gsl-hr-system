import { describe, expect, it } from 'vitest'
import { buildTemplateXlsx, parseEmployeeUpload } from '../employees/parseUpload'

const HEADERS = 'Employee Code,Title,Employee Name,Gender,DOB,DOJ,Designation,Department,Reporting Manager,Location,Confirmation Date,Official Email'

describe('parseEmployeeUpload', () => {
  it('round-trips the generated .xlsx template (headers recognised, no data rows)', () => {
    const buf = buildTemplateXlsx()
    const { rows, errors } = parseEmployeeUpload(buf, 'template.xlsx')
    expect(errors).toEqual([])
    expect(rows).toEqual([])
  })

  it('parses a CSV and maps columns by header', () => {
    const csv = `${HEADERS}\nMTPL/700,Mr.,Test Person,Male,1990-01-01,2026-05-01,Sales Exec,Sales,Some Manager,Mumbai,2026-11-01,test@gsl.in`
    const { rows, errors } = parseEmployeeUpload(Buffer.from(csv), 'x.csv')
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      employeeCode: 'MTPL/700',
      name: 'Test Person',
      department: 'Sales',
      reportingManager: 'Some Manager',
      dateOfJoining: '2026-05-01',
      rowRef: 'Row 2',
    })
  })

  it('maps columns regardless of order', () => {
    const csv = `Employee Name,Employee Code,DOJ,Designation,Department\nAsha Rao,MTPL/701,2026-06-01,Trainer,STEM and Training`
    const { rows, errors } = parseEmployeeUpload(Buffer.from(csv), 'x.csv')
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ employeeCode: 'MTPL/701', name: 'Asha Rao', department: 'STEM and Training' })
  })

  it('errors when a required column is missing', () => {
    const csv = `Title,Employee Name,Gender\nMr.,No Code,Male`
    const { rows, errors } = parseEmployeeUpload(Buffer.from(csv), 'x.csv')
    expect(rows).toEqual([])
    expect(errors.some((e) => e.includes('employeeCode'))).toBe(true)
  })

  it('normalises dd/mm/yyyy dates to ISO', () => {
    const csv = `${HEADERS}\nMTPL/702,Ms.,Date Person,Female,05/09/1988,15/06/2026,Exec,Sales,Mgr,Delhi,,d@gsl.in`
    const { rows } = parseEmployeeUpload(Buffer.from(csv), 'x.csv')
    expect(rows[0]?.dateOfBirth).toBe('1988-09-05')
    expect(rows[0]?.dateOfJoining).toBe('2026-06-15')
  })

  it('skips fully-blank rows', () => {
    const csv = `${HEADERS}\nMTPL/703,,Only Code Row,,,2026-05-01,Exec,Sales,,,,\n,,,,,,,,,,,\n`
    const { rows } = parseEmployeeUpload(Buffer.from(csv), 'x.csv')
    expect(rows).toHaveLength(1)
  })
})
