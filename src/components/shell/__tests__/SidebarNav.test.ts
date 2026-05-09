import { describe, expect, it } from 'vitest'
import { visibleSections } from '../SidebarNav'

describe('SidebarNav.visibleSections', () => {
  it('Admin sees all three sections', () => {
    const out = visibleSections('Admin')
    const titles = out.map((s) => s.title)
    expect(titles).toEqual(['Recruitment', 'HR Operations', 'Admin'])
  })

  it('HR sees Recruitment + HR Operations + a partial Admin (only My account)', () => {
    const out = visibleSections('HR')
    const titles = out.map((s) => s.title)
    expect(titles).toEqual(['Recruitment', 'HR Operations', 'Admin'])
    const adminItems = out.find((s) => s.title === 'Admin')!.items.map((i) => i.label)
    expect(adminItems).toEqual(['My account'])
  })

  it('HOD does NOT see Offers or Letters in Recruitment', () => {
    const out = visibleSections('HOD')
    const recItems = out.find((s) => s.title === 'Recruitment')!.items.map((i) => i.label)
    expect(recItems).not.toContain('Offers')
    expect(recItems).not.toContain('Letters')
    expect(recItems).toContain('Roles')
    expect(recItems).toContain('Candidates')
  })

  it('Leadership sees Recruitment Home + Dashboard + Roles, NOT Candidates/Interviews', () => {
    const out = visibleSections('Leadership')
    const recItems = out.find((s) => s.title === 'Recruitment')!.items.map((i) => i.label)
    expect(recItems).toContain('Home')
    expect(recItems).toContain('Dashboard')
    expect(recItems).toContain('Roles')
    expect(recItems).not.toContain('Candidates')
    expect(recItems).not.toContain('Interviews')
  })

  it('HR Operations section includes both active and coming-soon items', () => {
    const out = visibleSections('HR')
    const hrops = out.find((s) => s.title === 'HR Operations')!
    const labels = hrops.items.map((i) => i.label)
    expect(labels).toContain('Employees')
    expect(labels).toContain('Holiday Calendar')
    expect(labels).toContain('Roster')
    expect(labels).toContain('Documents')
    expect(labels).toContain('Assets')
    expect(labels).toContain('Locations and depts')
    expect(labels).toContain('Onboarding')
    expect(labels).toContain('Offboarding')
    expect(labels).toContain('Leave')
    expect(labels).toContain('Reports')
    const comingSoon = hrops.items.filter((i) => i.comingSoon).map((i) => i.label)
    expect(comingSoon).toEqual(['Reports'])
  })

  it('Admin section is gated to Admin role + My account for everyone', () => {
    const adminOut = visibleSections('Admin').find((s) => s.title === 'Admin')!
    expect(adminOut.items.map((i) => i.label)).toEqual(['Users', 'Settings', 'My account'])

    const hodOut = visibleSections('HOD').find((s) => s.title === 'Admin')!
    expect(hodOut.items.map((i) => i.label)).toEqual(['My account'])
  })

  it('section accents map correctly', () => {
    const out = visibleSections('Admin')
    expect(out.find((s) => s.title === 'Recruitment')?.accent).toBe('navy')
    expect(out.find((s) => s.title === 'HR Operations')?.accent).toBe('orange')
    expect(out.find((s) => s.title === 'Admin')?.accent).toBe('neutral')
  })
})
