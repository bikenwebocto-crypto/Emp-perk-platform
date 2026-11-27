'use client'

import { NotificationList } from '@/components/shared/notification-list'

export default function MerchantNotificationsPage() {
  return (
    <NotificationList
      fetchUrl="/api/merchant/notifications"
      markReadUrl={(id) => `/api/merchant/notifications/${id}`}
      markAllUrl="/api/merchant/notifications"
      queryKey="merchant-notifications"
      emptyMessage="No notifications yet"
      showPriority={false}
    />
  )
}
