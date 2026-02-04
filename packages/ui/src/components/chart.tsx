"use client"

import * as React from "react"
import { cn } from "../lib/utils"

// Chart config type
export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
    theme?: {
      light?: string
      dark?: string
    }
  }
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

interface ChartContainerProps
  extends React.ComponentProps<"div">,
    ChartContextProps {
  children: React.ReactNode
}

function ChartContainer({
  config,
  children,
  className,
  ...props
}: ChartContainerProps) {
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart=""
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border/50",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_[stroke]]:stroke-border",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/30",
          "[&_.recharts-reference-line_[stroke]]:stroke-border",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  )
}

interface ChartTooltipContentProps
  extends React.ComponentProps<"div"> {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number
    dataKey?: string
    payload?: Record<string, unknown>
    fill?: string
    color?: string
  }>
  label?: string
  labelKey?: string
  nameKey?: string
  indicator?: "line" | "dot" | "dashed"
  hideLabel?: boolean
  hideIndicator?: boolean
  formatter?: (value: number, name: string) => React.ReactNode
  labelFormatter?: (label: string) => React.ReactNode
}

function ChartTooltipContent({
  active,
  payload,
  label,
  labelKey,
  nameKey,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  className,
  formatter,
  labelFormatter,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  const getPayloadLabel = (item: typeof payload[0]) => {
    const key = nameKey || item.dataKey || item.name || "value"
    const configItem = config[key as keyof typeof config]
    return configItem?.label || key
  }

  const tooltipLabel = hideLabel
    ? null
    : labelFormatter
      ? labelFormatter(label || "")
      : label

  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {tooltipLabel && (
        <div className="font-medium text-foreground">{tooltipLabel}</div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = nameKey || item.dataKey || item.name || "value"
          const itemConfig = config[key as keyof typeof config]
          const indicatorColor = item.fill || item.color || itemConfig?.color

          return (
            <div
              key={item.dataKey || index}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-1.5">
                {!hideIndicator && (
                  <div
                    className={cn(
                      "shrink-0",
                      indicator === "dot" && "h-2.5 w-2.5 rounded-full",
                      indicator === "line" && "h-0.5 w-3.5",
                      indicator === "dashed" && "h-0.5 w-3.5 border-b border-dashed"
                    )}
                    style={{
                      backgroundColor: indicator === "dot" || indicator === "line" ? indicatorColor : undefined,
                      borderColor: indicator === "dashed" ? indicatorColor : undefined,
                    }}
                  />
                )}
                <span className="text-muted-foreground">
                  {getPayloadLabel(item)}
                </span>
              </div>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatter ? formatter(item.value ?? 0, String(key)) : item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ChartLegendContentProps extends React.ComponentProps<"div"> {
  payload?: Array<{
    value?: string
    dataKey?: string
    color?: string
  }>
  nameKey?: string
  hideIcon?: boolean
}

function ChartLegendContent({
  payload,
  nameKey,
  hideIcon = false,
  className,
}: ChartLegendContentProps) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-4 pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const key = nameKey || item.dataKey || item.value || "value"
        const itemConfig = config[key as keyof typeof config]

        return (
          <div key={item.value} className="flex items-center gap-1.5 text-xs">
            {!hideIcon && (
              <div
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color || itemConfig?.color }}
              />
            )}
            <span className="text-muted-foreground">
              {itemConfig?.label || item.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export {
  ChartContainer,
  ChartTooltipContent,
  ChartLegendContent,
  useChart,
  type ChartConfig,
}
