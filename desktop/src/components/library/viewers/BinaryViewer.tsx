import { Archive, Download, FileText } from "lucide-react";
import { Button } from "antd";

import { maybeAuthDownload } from "@/api/client";
import { useI18n } from "@/lib/i18n";

export function ArchiveView({ url, name }: { url: string; name: string }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fg-muted">
      <Archive size={32} className="text-fg-subtle" />
      <p>{t.library.previewUnavailable}</p>
      <Button
        size="small"
        href={url}
        download={name}
        onClick={(e) => maybeAuthDownload(e, url, name)}
        icon={<Download size={12} />}
      >
        {t.library.download}
      </Button>
    </div>
  );
}
export function BinaryView({ url, name }: { url: string; name: string }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fg-muted">
      <FileText size={32} className="text-fg-subtle" />
      <p>{t.library.previewUnavailable}</p>
      <Button
        size="small"
        href={url}
        download={name}
        onClick={(e) => maybeAuthDownload(e, url, name)}
        icon={<Download size={12} />}
      >
        {t.library.download}
      </Button>
    </div>
  );
}
