import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { Segmented } from "antd";

import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

export function TopBar() {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-bg-base/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span className="font-medium text-fg-base">Marginalia</span>
      </div>

      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as "light" | "system" | "dark")}
        options={[
          { value: "light", label: <span title={t.theme.light}><Sun size={14} /></span> },
          { value: "system", label: <span title={t.theme.system}><MonitorSmartphone size={14} /></span> },
          { value: "dark", label: <span title={t.theme.dark}><Moon size={14} /></span> },
        ]}
      />
    </header>
  );
}
