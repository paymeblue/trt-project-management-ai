'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'

export type ProjectSpeed = {
  name: string
  days: number // delivery duration (completed) or elapsed-so-far (ongoing)
  complete: boolean
  onTime: boolean | null // null when no deadline set
}

type ChartKind = 'bar' | 'horizontalBar' | 'line' | 'pie'

const KINDS: { key: ChartKind; label: string; icon: string }[] = [
  { key: 'bar', label: 'Bar', icon: 'bar_chart' },
  { key: 'horizontalBar', label: 'Ranked', icon: 'align_horizontal_left' },
  { key: 'line', label: 'Line', icon: 'show_chart' },
  { key: 'pie', label: 'Share', icon: 'pie_chart' },
]

// TRT brand-aligned palette.
const C = {
  primary: '#006591',
  primaryDim: '#4a90b0',
  green: '#16a34a',
  amber: '#f59e0b',
  red: '#dc2626',
  grid: '#e5e7eb',
  axis: '#6b7280',
  text: '#374151',
}

function barColor(p: ProjectSpeed): string {
  if (!p.complete) return C.amber // ongoing
  if (p.onTime === false) return C.red // delivered late
  return C.green // delivered on time
}

export default function AnalyticsChart({ data }: { data: ProjectSpeed[] }) {
  const [kind, setKind] = useState<ChartKind>('bar')
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const avg = useMemo(
    () => (data.length ? data.reduce((s, d) => s + d.days, 0) / data.length : 0),
    [data],
  )

  const option = useMemo<echarts.EChartsOption>(() => {
    const tooltipFmt = (val: number, p: ProjectSpeed) =>
      `<strong>${p.name}</strong><br/>${val} day${val === 1 ? '' : 's'}` +
      `<br/><span style="opacity:.7">${
        p.complete
          ? p.onTime === false
            ? 'Delivered · late'
            : 'Delivered · on time'
          : 'In progress'
      }</span>`

    const base: echarts.EChartsOption = {
      grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
      textStyle: { fontFamily: 'inherit', color: C.text },
    }

    if (kind === 'pie') {
      return {
        ...base,
        tooltip: {
          trigger: 'item',
          formatter: (raw: unknown) => {
            const pp = raw as { name: string; value: number; percent: number }
            return `<strong>${pp.name}</strong><br/>${pp.value} days · ${pp.percent}% of total time`
          },
        },
        legend: { type: 'scroll', bottom: 0, textStyle: { color: C.axis } },
        series: [
          {
            type: 'pie',
            radius: ['38%', '68%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
            label: { formatter: '{b}\n{d}%', color: C.text, fontSize: 11 },
            data: data.map((d) => ({
              name: d.name,
              value: d.days,
              itemStyle: { color: barColor(d) },
            })),
          },
        ],
      }
    }

    const horizontal = kind === 'horizontalBar'
    const sorted = horizontal ? [...data].sort((a, b) => a.days - b.days) : data
    const cat = sorted.map((d) => d.name)
    const catAxis = {
      type: 'category' as const,
      data: cat,
      axisLabel: { color: C.axis, interval: 0, rotate: horizontal ? 0 : 30, fontSize: 11 },
      axisLine: { lineStyle: { color: C.grid } },
      axisTick: { show: false },
    }
    const valAxis = {
      type: 'value' as const,
      name: 'Days',
      nameTextStyle: { color: C.axis },
      axisLabel: { color: C.axis },
      splitLine: { lineStyle: { color: C.grid } },
    }

    const markLine: echarts.MarkLineComponentOption = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: C.primary, type: 'dashed', width: 1.5 },
      label: {
        formatter: `avg ${avg.toFixed(1)}d`,
        color: C.primary,
        position: horizontal ? 'insideEndTop' : 'insideStartTop',
      },
      data: [horizontal ? { xAxis: avg } : { yAxis: avg }],
    }

    return {
      ...base,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const arr = params as { dataIndex: number; value: number }[]
          const i = arr[0].dataIndex
          return tooltipFmt(sorted[i].days, sorted[i])
        },
      },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: [
        {
          type: kind === 'line' ? 'line' : 'bar',
          data: sorted.map((d) => ({ value: d.days, itemStyle: { color: barColor(d) } })),
          barMaxWidth: 42,
          ...(kind === 'line'
            ? {
                smooth: true,
                symbolSize: 9,
                lineStyle: { color: C.primary, width: 3 },
                itemStyle: { color: C.primary },
                areaStyle: { color: 'rgba(0,101,145,0.08)' },
              }
            : { itemStyle: { borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] } }),
          markLine,
        },
      ],
    }
  }, [data, kind, avg])

  useEffect(() => {
    if (!elRef.current) return
    const chart = echarts.init(elRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(elRef.current)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Delivery speed per project</h2>
          <p className="text-xs text-gray-500">
            Days from project creation to delivery. Lower is faster.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Chart type"
          className="flex items-center gap-1 rounded-full bg-gray-100 p-1"
        >
          {KINDS.map((k) => {
            const active = kind === k.key
            return (
              <button
                key={k.key}
                role="tab"
                aria-selected={active}
                onClick={() => setKind(k.key)}
                title={k.label}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">
                  {k.icon}
                </span>
                <span className="hidden sm:inline">{k.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-[360px] items-center justify-center text-sm text-gray-400">
          No projects to chart yet.
        </div>
      ) : (
        <div ref={elRef} className="h-[400px] w-full" />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.green }} /> On time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.red }} /> Late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.amber }} /> In progress
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-primary" /> Average
          delivery {avg.toFixed(1)}d
        </span>
      </div>
    </div>
  )
}
