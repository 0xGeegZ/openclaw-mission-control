"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

/**
 * Live clock showing current time, updated every second.
 */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4 shrink-0" />
      <time dateTime={now.toISOString()}>
        {now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
    </div>
  );
}
