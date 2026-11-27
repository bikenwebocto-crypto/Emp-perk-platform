'use client'
import { CircleDot } from 'lucide-react'
import type { ChartSlice } from '@/types'
import {
  AnalyticsPieChart,
  type PieSlice,
} from '@/components/analytics/analytics-pie-chart'
import {
  AnalyticsLineChart,
} from '@/components/analytics/analytics-line-chart'
import {
  AnalyticsBarChart,
} from '@/components/analytics/analytics-bar-chart'
import {
  AnalyticsFunnelChart,
} from '@/components/analytics/analytics-funnel-chart'

// ============================================================================
// Color palettes (kept for backward compatibility)
// ============================================================================

export const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export const FUNNEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export const LINE_COLORS = {
  redemptions: '#10b981',
  views: '#3b82f6',
  savings: '#8b5cf6',
}

// ============================================================================
// Number formatters (shared)
// ============================================================================

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--'
  if (n === 0) return '0%'
  if (n < 1) return `${n.toFixed(2)}%`
  return `${n.toFixed(1)}%`
}

// ============================================================================
// Backward-compatible wrappers using new generic components
// ============================================================================

function mapToPieSlices(data: ChartSlice[]): PieSlice[] {
  return data.map((d) => ({ name: d.label, value: d.value, color: d.color }))
}

export function StatusPie({
  data,
  height = 220,
}: {
  data: ChartSlice[]
  height?: number
}) {
  return (
    <AnalyticsPieChart
      data={mapToPieSlices(data)}
      height={height}
      innerRadius={50}
      outerRadius={85}
      emptyMessage="No offers yet"
      showLegend={false}
    />
  )
}

export function CategoryPie({
  data,
  height = 220,
}: {
  data: ChartSlice[]
  height?: number
}) {
  return (
    <AnalyticsPieChart
      data={mapToPieSlices(data)}
      height={height}
      outerRadius={85}
      emptyMessage="No data"
      showLegend={false}
      showValueLabels
    />
  )
}

export function DailyTrendLine({
  data,
  height = 220,
}: {
  data: Array<{ date: string; redemptions: number; views?: number; savings?: number }>
  height?: number
}) {
  return (
    <AnalyticsLineChart
      data={data}
      xKey="date"
      lines={[
        { key: 'redemptions', color: LINE_COLORS.redemptions, name: 'Redemptions' },
        ...(data.some((d) => d.views != null) ? [{ key: 'views' as const, color: LINE_COLORS.views, name: 'Views' }] : []),
        ...(data.some((d) => d.savings != null) ? [{ key: 'savings' as const, color: LINE_COLORS.savings, name: 'Savings' }] : []),
      ]}
      height={height}
      emptyMessage="No recent redemptions"
      xTickFormatter={(v: string) => v.slice(5)}
    />
  )
}

export function OfferFunnel({
  data,
  height = 220,
}: {
  data: ChartSlice[]
  height?: number
}) {
  return (
    <AnalyticsFunnelChart
      data={mapToPieSlices(data)}
      height={height}
      emptyMessage="No funnel data"
      showDropOffSummary
      stageLabels={['Views', 'Saves', 'Clicks', 'Redemptions']}
    />
  )
}

export function DailyTrendBar({
  data,
  height = 220,
}: {
  data: Array<{ date: string; redemptions: number }>
  height?: number
}) {
  return (
    <AnalyticsBarChart
      data={data}
      xKey="date"
      bars={[{ key: 'redemptions', color: LINE_COLORS.redemptions, name: 'Redemptions' }]}
      height={height}
      emptyMessage="No recent redemptions"
      xTickFormatter={(v: string) => v.slice(5)}
      borderRadius={4}
    />
  )
}

// ============================================================================
// Other backward-compatible exports
// ============================================================================

export function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload as ChartSlice
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold">{d.label}</p>
      <p className="text-muted-foreground">Value: <span className="font-semibold text-foreground">{d.value}</span></p>
    </div>
  )
}

export function FunnelTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload as ChartSlice
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold">{d.label}</p>
      <p className="text-muted-foreground">Value: <span className="font-semibold text-foreground">{formatNumber(d.value)}</span></p>
    </div>
  )
}

export function DailyTrendTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold">{d.date}</p>
      <p className="text-muted-foreground">
        Redemptions: <span className="font-semibold text-foreground">{d.redemptions}</span>
      </p>
      <p className="text-muted-foreground">
        Savings: <span className="font-semibold text-foreground">€{Number(d.savings ?? 0).toFixed(2)}</span>
      </p>
    </div>
  )
}

export function ChartEmpty({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ height }}
    >
      <CircleDot className="mb-2 h-8 w-8 text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

export function ChartLegend({ slices, max = 6 }: { slices: ChartSlice[]; max?: number }) {
  if (slices.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
      {slices.slice(0, max).map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: s.color ?? PIE_COLORS[i % PIE_COLORS.length] }}
          />
          <span className="truncate text-muted-foreground">{s.label}</span>
          <span className="font-semibold tabular-nums">{s.value}</span>
        </div>
      ))}
      {slices.length > max && (
        <span className="text-[10px] text-muted-foreground">+{slices.length - max} more</span>
      )}
    </div>
  )
}

export function FunnelDropOffSummary({
  funnel,
  stageLabels = ['Views', 'Saves', 'Clicks', 'Redemptions'],
}: {
  funnel: ChartSlice[]
  stageLabels?: string[]
}) {
  if (funnel.length < 2) return null
  const dropOffs: Array<{ from: string; to: string; pct: number }> = []
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1]?.value ?? 0
    const curr = funnel[i]?.value ?? 0
    if (prev > 0) {
      const dropOff = ((prev - curr) / prev) * 100
      dropOffs.push({ from: stageLabels[i - 1] ?? '', to: stageLabels[i] ?? '', pct: dropOff })
    }
  }
  if (dropOffs.length === 0) return null
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-[10px]">
      {dropOffs.map((d, i) => (
        <div key={i} className="text-center">
          <p className="text-muted-foreground">
            {d.from} → {d.to}
          </p>
          <p className="font-semibold text-rose-600">−{d.pct.toFixed(1)}%</p>
        </div>
      ))}
    </div>
  )
}
