import { describe, expect, it } from 'vitest'
import { filterEmployees } from '../filter'
import type { Employee } from '../../types'

const baseEmployee = (overrides: Partial<Employee> = {}): Employee =>
  ({
    id: 'e-1',
    name: 'Komal Hinduja',
    designation: 'Academic Counsellor',
    employeeCode: 'MTPL/123',
    email: 'komal@getsetlearn.info',
    department: 'Academics',
    location: 'Mumbai',
    status: 'Active',
    dateOfJoining: '2024-04-01',
    employmentType: 'Full-time',
    auditLog: [],
    ...overrides,
  }) as unknown as Employee

const employees: Employee[] = [
  baseEmployee(),
  baseEmployee({
    id: 'e-2',
    name: 'Huda Khan',
    designation: 'STEM Trainer',
    employeeCode: 'MTPL/200',
    email: 'huda.k@getsetlearn.info',
    department: 'STEM & Training',
    location: 'Mumbai',
  }),
  baseEmployee({
    id: 'e-3',
    name: 'Abhishek Soni',
    designation: 'Premium Sales Lead',
    employeeCode: 'MTPL/045',
    email: 'abhi@getsetlearn.info',
    department: 'Premium Sales',
    location: 'Bangalore',
  }),
  baseEmployee({
    id: 'e-4',
    name: 'Ameet Zaveri',
    designation: 'CEO',
    employeeCode: 'MTPL/014',
    email: 'ameet.z@getsetlearn.info',
    department: 'Leadership',
    location: 'Mumbai',
  }),
]

describe('filterEmployees', () => {
  it('returns all employees when no filters set', () => {
    expect(filterEmployees(employees, {})).toHaveLength(4)
  })

  it('matches by partial name (case-insensitive)', () => {
    const out = filterEmployees(employees, { query: 'huda' })
    expect(out.map((e) => e.id)).toEqual(['e-2'])
  })

  it('matches by employee code', () => {
    const out = filterEmployees(employees, { query: 'MTPL/045' })
    expect(out.map((e) => e.id)).toEqual(['e-3'])
  })

  it('matches by partial email local-part', () => {
    const out = filterEmployees(employees, { query: 'ameet.z' })
    expect(out.map((e) => e.id)).toEqual(['e-4'])
  })

  it('matches by department', () => {
    const out = filterEmployees(employees, { query: 'Academics' })
    expect(out.map((e) => e.id)).toEqual(['e-1'])
  })

  it('matches by location', () => {
    const out = filterEmployees(employees, { query: 'bangalore' })
    expect(out.map((e) => e.id)).toEqual(['e-3'])
  })

  it('exact-matches the department dropdown filter', () => {
    const out = filterEmployees(employees, { department: 'Premium Sales' })
    expect(out.map((e) => e.id)).toEqual(['e-3'])
  })

  it('AND-combines query and department', () => {
    const out = filterEmployees(employees, {
      query: 'mumbai',
      department: 'Academics',
    })
    expect(out.map((e) => e.id)).toEqual(['e-1'])
  })

  it('returns empty when query has no matches', () => {
    expect(filterEmployees(employees, { query: 'qqzzz' })).toEqual([])
  })

  it('treats whitespace-only query as empty', () => {
    expect(filterEmployees(employees, { query: '   ' })).toHaveLength(4)
  })

  it('matches the search hint (name, email, employee ID, department)', () => {
    // Each of the four search dimensions Shruti's input placeholder
    // promises ("name, email, employee ID, or department") finds a hit.
    expect(filterEmployees(employees, { query: 'Hinduja' }).length).toBe(1)
    expect(filterEmployees(employees, { query: 'huda.k@' }).length).toBe(1)
    expect(filterEmployees(employees, { query: 'MTPL/014' }).length).toBe(1)
    expect(filterEmployees(employees, { query: 'STEM' }).length).toBe(1)
  })
})
