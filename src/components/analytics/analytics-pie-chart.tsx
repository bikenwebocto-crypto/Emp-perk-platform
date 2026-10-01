'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { CircleDot } from 'lucide-react'

export interface PieSlice {
  name: string
  value: number
  color?: string
}

export interface AnalyticsPieChartProps {
  data: PieSlice[]
  height?: number
  innerRadius?: number
  outerRadius?: number
  emptyMessage?: string
  showLegend?: boolean
  legendMax?: number
  showValueLabels?: boolean
  valueFormatter?: (value: number, total: number) => string
  colors?: string[]
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

function DefaultTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload as PieSlice
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold">{d.name}</p>
      <p className="text-muted-foreground">
        Value: <span className="font-semibold text-foreground">{d.value}</span>
      </p>
    </div>
  )
}

export function AnalyticsPieChart({
  data,
  height = 220,
  innerRadius = 0,
  outerRadius = 85,
  emptyMessage = 'No data',
  showLegend = true,
  legendMax = 6,
  showValueLabels = false,
  valueFormatter,
  colors = DEFAULT_COLORS,
}: AnalyticsPieChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ height }}
      >
        <CircleDot className="mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="[&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={innerRadius > 0 ? 2 : 0}
            dataKey="value"
            label={showValueLabels ? (entry: any) => valueFormatter
              ? valueFormatter(entry.value, total)
              : `${entry.value}`
            : undefined}
            labelLine={showValueLabels}
          >
            {data.map((slice, i) => (
              <Cell key={i} fill={slice.color ?? colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<DefaultTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          {data.slice(0, legendMax).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color ?? colors[i % colors.length] }}
              />
              <span className="truncate text-muted-foreground">{s.name}</span>
              <span className="font-semibold tabular-nums">{s.value}</span>
            </div>
          ))}
          {data.length > legendMax && (
            <span className="text-[10px] text-muted-foreground">
              +{data.length - legendMax} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
