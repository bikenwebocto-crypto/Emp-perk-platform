'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Navbar } from '@/components/layout/navbar'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/utils/cn'
import { useCurrentUser } from '@/hooks/queries/use-current-user'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import type { PublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'

const pageTitles: Record<string, string> = {
  '/admin': 'Admin Overview',
  '/admin/action-queue': 'Action Queue',
  '/admin/offers/replacements': 'Replacement Reviews',
  '/admin/merchants': 'Merchants',
  '/admin/companies': 'Companies',
  '/admin/employees': 'Employees',
  '/admin/csv-uploads': 'CSV Uploads',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/billing': 'Billing',
  '/admin/settings/login-branding': 'Login Branding',
  '/admin/themes/customize': 'Theme Customizer',
  '/admin/notifications': 'Notifications',
  '/admin/analytics': 'Platform Analytics',
  '/merchant': 'Merchant Overview',
  '/merchant/offers': 'My Offers',
  '/merchant/analytics': 'Analytics',
  '/merchant/branches': 'Branches',
  '/merchant/redemptions': 'Redemptions',
  '/merchant/profile': 'Profile',
  '/merchant/notifications': 'Notifications',
  '/merchant/settings': 'Settings',
  '/company': 'Company Overview',
  '/company/employees': 'Employees',
  '/company/analytics': 'Analytics',
  '/company/billing': 'Billing',
  '/company/notifications': 'Notifications',
  '/company/settings': 'Settings',
  '/employee': 'Employee Home',
  '/employee/offers': 'Available Offers',
  '/employee/saved': 'Saved Offers',
  '/employee/redemptions': 'My Redemptions',
  '/employee/notifications': 'Notifications',
  '/employee/profile': 'My Profile',
  '/employee/settings': 'Settings',
}

interface DashboardShellProps {
  children: React.ReactNode
  branding: PublicBranding | null
}

export function DashboardShell({ children, branding }: DashboardShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: user } = useCurrentUser()
  usePushNotifications({ enabled: Boolean(user) })

  const userType = pathname.startsWith('/merchant')
    ? 'merchant'
    : pathname.startsWith('/company')
      ? 'company_admin'
      : pathname.startsWith('/employee')
        ? 'employee'
        : 'admin'

  console.log('userType', userType, 'pathname', pathname, 'user', user)
  const title = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? 'Dashboard'

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: `hsl(var(--overlay-bg) / 0.5)` }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 -translate-x-full transition-transform md:relative md:translate-x-0',
        sidebarOpen && 'translate-x-0'
      )}>
        <Sidebar
          userType={userType}
          userName={user?.name}
          userEmail={user?.email}
          userRole={user?.role}
          companyName={user?.companyName}
          branding={branding}
          avatarUrl={user?.avatarUrl}
        />
      </div>

      <div className="flex flex-1 flex-col">
        <Navbar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
          userName={user?.name}
          userEmail={user?.email}
          userRole={user?.role}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}
