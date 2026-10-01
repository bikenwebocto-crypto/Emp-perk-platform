'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotificationStore } from '@/store/notification-store'

interface Notification {
  id: string
  title: string
  body: string | null
  priority: string
  referenceType: string | null
  referenceId: string | null
  isRead: boolean
  createdAt: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const PRIORITY_DOT: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  NORMAL: 'bg-blue-500',
  LOW: 'bg-gray-400',
}

interface NotificationBellProps {
  fetchUrl: string
  markReadUrl?: (id: string) => string
  markAllUrl?: string
  viewAllUrl: string
}

export function NotificationBell({
  fetchUrl,
  markReadUrl = (id) => `${fetchUrl}/${id}`,
  markAllUrl,
  viewAllUrl,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const storeUnreadCount = useNotificationStore((s) => s.unreadCount)

  const { data } = useQuery({
    queryKey: ['notification-bell', fetchUrl],
    queryFn: async () => {
      const res = await fetch(fetchUrl)
      const json = await res.json()
      if (!res.ok) return { data: [], unread: 0 }
      const unread =
        json.unread ?? json.unreadCount ?? json.meta?.unreadCount ?? json.meta?.unread ?? 0
      return { data: (json.data ?? []) as Notification[], unread: unread as number }
    },
    refetchInterval: 180000,
  })

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(markReadUrl(id), { method: 'PATCH' })
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-bell', fetchUrl] }),
  })

  const markAll = useMutation({
    mutationFn: async () => {
      if (markAllUrl) {
        await fetch(markAllUrl, { method: 'POST' })
      } else {
        const unread = (data?.data ?? []).filter((n) => !n.isRead)
        await Promise.all(unread.map((n) => fetch(markReadUrl(n.id), { method: 'PATCH' })))
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-bell', fetchUrl] }),
  })

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const unreadCount = data?.unread ?? storeUnreadCount
  const notifications = (data?.data ?? []).slice(0, 8)

  return (
    <div className="relative" ref={dropdownRef}>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full p-0 text-[10px] flex items-center justify-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                >
                  <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 border-b px-3 py-2.5 last:border-0 hover:bg-accent/50 transition-colors ${
                    !n.isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[n.priority] ?? PRIORITY_DOT.NORMAL}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${!n.isRead ? 'font-medium' : ''}`}>{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => markOne.mutate(n.id)}
                    >
                      <CheckCheck className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t px-3 py-2">
            <a
              href={viewAllUrl}
              className="block text-center text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
