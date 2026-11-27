'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { Bell, CheckCheck, Filter } from 'lucide-react'
import type { NotificationPriority } from '@/types'

interface Notification {
  id: string
  title: string
  body: string | null
  priority: string
  referenceType: string | null
  referenceId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

interface NotificationListProps {
  fetchUrl: string
  markReadUrl?: (id: string) => string
  markAllUrl?: string
  queryKey: string
  emptyMessage?: string
  /** Show the internal priority badge on each item (hidden for merchants). */
  showPriority?: boolean
}

const PRIORITY_STYLES: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  NORMAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
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

export function NotificationList({
  fetchUrl,
  markReadUrl = (id) => `${fetchUrl}/${id}`,
  markAllUrl,
  queryKey,
  emptyMessage = 'No notifications',
  showPriority = true,
}: NotificationListProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, filter],
    queryFn: async () => {
      const sep = fetchUrl.includes('?') ? '&' : '?'
      const url = filter === 'unread' ? `${fetchUrl}${sep}unread=true&unreadOnly=true` : fetchUrl
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return { data: json.data as Notification[], unread: json.unread ?? 0 }
    },
  })

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(markReadUrl(id), { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  const markAll = useMutation({
    mutationFn: async () => {
      if (markAllUrl) {
        const res = await fetch(markAllUrl, { method: 'POST' })
        if (!res.ok) throw new Error('Failed')
        return res.json()
      }
      const unread = (data?.data ?? []).filter((n) => !n.isRead)
      await Promise.all(unread.map((n) => fetch(markReadUrl(n.id), { method: 'PATCH' })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      showToast({ type: 'success', title: 'Marked all as read' })
    },
    onError: () => showToast({ type: 'error', title: 'Failed to mark as read' }),
  })

  const notifications = data?.data ?? []
  const unreadCount = data?.unread ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell className="h-5 w-5" /> Notifications
          </h1>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === 'unread' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="icon"
            title="Mark all as read"
            aria-label="Mark all as read"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            <CheckCheck className="h-4 w-4 text-green-600" />
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-md border bg-card p-3 transition-colors ${
                !n.isRead ? 'border-l-4 border-l-primary' : 'opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {showPriority && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          PRIORITY_STYLES[n.priority] ?? PRIORITY_STYLES.NORMAL
                        }`}
                      >
                        {n.priority}
                      </span>
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {n.isRead ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center" title="Read" aria-label="Read">
                    <CheckCheck className="h-4 w-4 text-green-600" />
                  </span>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    title="Mark as read"
                    aria-label="Mark as read"
                    onClick={() => markOne.mutate(n.id)}
                    disabled={markOne.isPending}
                  >
                    <CheckCheck className="h-4 w-4 text-foreground" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
