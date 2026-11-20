import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function MerchantAnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Date filter */}
      <Card><CardContent className="p-4"><Skeleton className="h-9 w-full" /></CardContent></Card>

      {/* 4 KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><div className="space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /></div></CardContent></Card>
        ))}
      </div>

      {/* Chart Skeletons */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        ))}
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>

      {/* Trend Skeleton */}
      <Card><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
    </div>
  )
}
