'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { Search, ExternalLink, History, Info } from 'lucide-react'

const ARCHIVED_INFO =
  'An offer is archived when you revoke a live offer, or when an approved replacement goes live and takes its place. Expired and replaced evergreen offers are listed under the History tab instead.'

interface ArchivedRow {
  id: string
  title: string
  status: string
  startDate: string
  endDate: string | null
  updatedAt: string
  replacesOffer: { id: string; title: string } | null
  _count: { redemptions: number }
  analytics: { viewCount: number; saveCount: number } | null
}

interface ApiResponse {
  data: ArchivedRow[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

async function fetchArchived(params: URLSearchParams): Promise<ApiResponse> {
  const res = await fetch(`/api/merchant/offers?${params.toString()}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
  return json
}

function formatDate(s: string | null) {
  if (!s) return 'No end date'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB')
}

export default function ArchivedOffersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', '20')
  params.set('scope', 'archived')
  if (search) params.set('q', search)

  const { data, isLoading } = useQuery({
    queryKey: ['archived-offers', params.toString()],
    queryFn: () => fetchArchived(params),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archived Offers"
        description="Offers you revoked, or offers taken down when an approved replacement went live"
        actions={
          <Link href="/merchant/offers">
            <Button variant="outline">
              <History className="mr-1 h-4 w-4" /> All Offers
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Archive
            <span title={ARCHIVED_INFO} aria-label={ARCHIVED_INFO} className="inline-flex cursor-help text-muted-foreground">
              <Info className="h-4 w-4" />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search archived offers…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-7"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archived offers. {ARCHIVED_INFO}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {data.data.map((o) => (
                  <li key={o.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link
                          href={`/merchant/offers/${o.id}`}
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          {o.title} <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(o.startDate)} – {formatDate(o.endDate)} ·{' '}
                          Archived {formatDate(o.updatedAt)}
                        </p>
                        {o.replacesOffer && (
                          <p className="mt-1 text-xs">
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              Replaced earlier offer: {o.replacesOffer.title}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{o._count.redemptions} redemptions</p>
                        <p>{o.analytics?.viewCount ?? 0} views · {o.analytics?.saveCount ?? 0} saves</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {data.meta.totalPages} · {data.meta.total} total
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                    disabled={page >= data.meta.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
