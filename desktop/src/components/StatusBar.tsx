import { useEffect, useState } from "react";
import { Activity, Wifi, WifiOff } from "lucide-react";
import { Button, Popover } from "antd";

import { health, tasks } from "@/api/client";
import { ActivityPopover } from "@/components/ActivityPopover";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function StatusBar() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [storage, setStorage] = useState<string>("");
  const [busy, setBusy] = useState({ running: 0, pending: 0 });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const pollMs = usePrefs((s) => s.statusPollMs);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const h = await health();
        if (cancelled) return;
        setOnline(true);
        setStorage(h.storage_backend);
      } catch {
        if (!cancelled) setOnline(false);
      }
      try {
        const c = await tasks.runningCount();
        if (!cancelled) setBusy(c);
      } catch {
        /* keep last value */
      }
    }

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  const totalBusy = busy.running + busy.pending;

  return (
    <footer className="relative flex h-7 items-center justify-between border-t border-border bg-bg-subtle px-3 text-[11px] text-fg-muted">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex items-center gap-1",
            online === false && "text-danger",
          )}
        >
          {online === false ? <WifiOff size={11} /> : <Wifi size={11} />}
          {online === null
            ? t.status.connecting
            : online
              ? t.status.connected(storage)
              : t.status.backendOffline}
        </span>
      </div>
      <Popover
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        trigger="click"
        placement="topRight"
        arrow={false}
        destroyOnHidden
        content={<ActivityPopover open={popoverOpen} pollMs={pollMs} />}
        styles={{ container: { padding: 0 } }}
      >
        <Button
          type="text"
          size="small"
          icon={(
            <Activity
              size={11}
              className={cn(totalBusy > 0 && "text-accent animate-pulse-soft")}
            />
          )}
          className={cn(
            "h-5 px-1 text-[11px]",
            popoverOpen && "bg-bg-muted text-fg-base",
          )}
          title={t.status.showActivity}
        >
          {totalBusy > 0
            ? t.status.busy(busy.running, busy.pending)
            : t.status.idle}
        </Button>
      </Popover>
    </footer>
  );
}
