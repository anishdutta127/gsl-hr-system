'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  Users,
  FileSignature,
  Building2,
  LayoutDashboard,
  Sparkles,
  ClipboardList,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StaffRole } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: StaffRole[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: LayoutDashboard, roles: ['Admin', 'HR', 'HOD', 'Leadership'] },
  { label: 'Dashboard', href: '/dashboard', icon: ClipboardList, roles: ['Admin', 'HR', 'Leadership'] },
  { label: 'Roles', href: '/roles', icon: Briefcase, roles: ['Admin', 'HR', 'HOD', 'Leadership'] },
  { label: 'Candidates', href: '/candidates', icon: Users, roles: ['Admin', 'HR', 'HOD'] },
  { label: 'Offers', href: '/offers', icon: FileSignature, roles: ['Admin', 'HR'] },
  { label: 'Employees', href: '/employees', icon: Building2, roles: ['Admin', 'HR', 'Leadership'] },
  { label: 'Prompts', href: '/prompts', icon: Sparkles, roles: ['Admin', 'HR', 'HOD'] },
]

export function SidebarNav({ role }: { role: StaffRole }) {
  const pathname = usePathname()
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))
  return (
    <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-4">
      {visible.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-navy-dark bg-navy-light'
                : 'flex items-center gap-3 rounded px-3 py-2 text-sm text-ink-2 hover:bg-surface hover:text-ink'
            }
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
