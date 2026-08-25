import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search as SearchIcon, FileText, Loader2 } from "lucide-react";
import { Input, type InputRef } from "antd";

import { search } from "@/api/client";
import type { SearchEntry } from "@/types/api";
import { useI18n } from "@/lib/i18n";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<InputRef>(null);
  const { t } = useI18n();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    // Clear any stale failure banner from a previous request; a new
    // search's success path never touched `error` before.
    setError(null);
    const handle = window.setTimeout(async () => {
      try {
        const r = await search.query(term, 25);
        if (!cancelled) setResults(r.entries);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [q]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg-subtle px-6 py-4">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search.placeholder}
          prefix={<SearchIcon size={16} className="text-fg-subtle" />}
          suffix={loading ? <Loader2 size={14} className="animate-spin text-fg-subtle" /> : null}
          className="mx-auto max-w-3xl text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          {results === null && !error && !loading && (
            <p className="text-sm text-fg-subtle">{t.search.empty}</p>
          )}
          {results && results.length === 0 && !loading && (
            <p className="text-sm text-fg-subtle">{t.search.noMatches}</p>
          )}
          {results && results.map((e) => (
            <Link
              to={`/library?entry=${encodeURIComponent(e.entry_id)}`}
              key={e.entry_id}
              className="mb-2 block rounded-md border border-border bg-bg-subtle p-3 hover:bg-bg-muted"
            >
              <header className="flex items-center gap-2 text-sm">
                <FileText size={14} className="text-fg-muted" />
                <span className="font-medium">{e.display_name}</span>
                {e.folder_path && (
                  <span className="text-xs text-fg-subtle">{e.folder_path}</span>
                )}
              </header>
              {e.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{e.summary}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
