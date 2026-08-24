/** Settings page — four sections.
 *
 *  1. Connection: API base URL (client-side, persisted to localStorage)
 *  2. Preferences: theme, default conflict policy, status-bar polling
 *  3. Retrieval: embedding recall and rerank runtime overlay
 *  4. Server status (read-only) + LLM profile editor (writable overlay)
 *
 *  Server state (server + llm) lives on the page so Preferences and the
 *  Server-status card stay in lockstep — picking a conflict policy in
 *  Preferences updates the read-only line below without a re-fetch.
 *
 *  Sections 1-2 work without a backend. Section 3 calls /v1/settings/*
 *  and shows a friendly empty state if the server is offline. */
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, Save, Sun, Moon, Monitor } from "lucide-react";
import { Button, Segmented, Select, Switch, Tooltip } from "antd";

import {
  clearBaseUrlOverride,
  probeBackendBaseUrl,
  setApiToken,
  setBaseUrl,
  getApiToken,
  settings as settingsApi,
  webdavSync,
} from "@/api/client";
import { LlmProfileEditor } from "@/components/LlmProfileEditor";
import { usePrefs, type LanguagePreference } from "@/lib/prefs";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LlmSettings, OnConflict, ServerSettings, WebDavStatus } from "@/types/api";

const STORAGE_KEY = "marginalia.api_base";

type ServerNumberField =
  | "agent_plan_max_tokens"
  | "agent_execute_max_tokens"
  | "agent_execute_max_turns"
  | "worker_batch_size"
  | "llm_ingest_concurrency"
  | "embedding_dimensions"
  | "embedding_batch_size"
  | "semantic_recall_limit"
  | "rerank_top_n"
  | "rerank_max_doc_chars"
  | "rerank_concurrency";

type ServerBooleanField =
  | "compression_enabled"
  | "semantic_recall_enabled"
  | "rerank_enabled"
  | "document_vision_enabled";

type ServerStringField =
  | "embedding_provider"
  | "embedding_base_url"
  | "embedding_model"
  | "semantic_index_backend"
  | "rerank_base_url"
  | "rerank_model"
  | "evidence_selection";

type ServerSecretField = "embedding_api_key" | "rerank_api_key";

interface ServerCtx {
  server: ServerSettings | null;
  llm: LlmSettings | null;
  err: string | null;
  setLlm: (next: LlmSettings) => void;
  setDefaultConflict: (v: OnConflict) => Promise<void>;
  setServerNumber: (field: ServerNumberField, v: number) => Promise<void>;
  setServerBoolean: (field: ServerBooleanField, v: boolean) => Promise<void>;
  setServerString: (field: ServerStringField, v: string) => Promise<void>;
  setServerSecret: (field: ServerSecretField, v: string) => Promise<void>;
}

export function SettingsPage() {
  const ctx = useServerCtx();
  const { t } = useI18n();
  const navItems = [
    { id: "llm-profiles", label: t.settings.modelsTitle },
    { id: "appearance", label: t.settings.appearanceTitle },
    { id: "preferences", label: t.settings.strategyTitle },
    { id: "connection", label: t.settings.connectionTitle },
    { id: "webdav", label: t.settings.webdavTitle },
    { id: "server-status", label: t.settings.serverStatusTitle },
  ];
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto flex max-w-6xl gap-6">
        <SettingsNav items={navItems} />
        <div className="min-w-0 flex-1 space-y-6">
          <h1 className="text-xl font-semibold">{t.settings.title}</h1>

          <ModelsSection ctx={ctx} />
          <AppearanceSection />
          <PreferencesSection ctx={ctx} />
          <ConnectionSection />
          <WebDavSection initial={ctx.server?.webdav ?? null} />
          <ServerSection ctx={ctx} />
        </div>
        <div className="hidden w-80 shrink-0 xl:block">
          <div className="sticky top-8">
            <QuickStartSection ctx={ctx} />
          </div>
        </div>
      </div>
    </div>
  );
}

function useServerCtx(): ServerCtx {
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          settingsApi.server(),
          settingsApi.llm(),
        ]);
        if (cancelled) return;
        setServer(s);
        setLlm(l);
        setErr(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDefaultConflict = async (v: OnConflict) => {
    if (!server || server.default_on_conflict === v) return;
    const prev = server;
    setServer({ ...server, default_on_conflict: v });
    try {
      await settingsApi.updateLlm({ default_on_conflict: v });
    } catch {
      setServer(prev); // roll back the optimistic update
    }
  };

  const setServerNumber = async (field: ServerNumberField, v: number) => {
    if (!server || server[field] === v) return;
    const prev = server;
    setServer({ ...server, [field]: v } as ServerSettings);
    try {
      await settingsApi.updateLlm({ [field]: v });
    } catch {
      setServer(prev);
    }
  };

  const setServerBoolean = async (field: ServerBooleanField, v: boolean) => {
    if (!server || server[field] === v) return;
    const prev = server;
    const next: ServerSettings = { ...server, [field]: v };
    if (field === "semantic_recall_enabled") {
      next.semantic_recall_configured = v && server.embedding_api_key_set;
    } else if (field === "rerank_enabled") {
      next.rerank_configured = v && server.rerank_api_key_set;
    }
    setServer(next);
    try {
      await settingsApi.updateLlm({ [field]: v });
    } catch {
      setServer(prev);
    }
  };

  const setServerString = async (field: ServerStringField, v: string) => {
    const trimmed = v.trim();
    if (!server || !trimmed || server[field] === trimmed) return;
    const prev = server;
    setServer({ ...server, [field]: trimmed } as ServerSettings);
    try {
      await settingsApi.updateLlm({ [field]: trimmed });
    } catch {
      setServer(prev);
    }
  };

  const setServerSecret = async (field: ServerSecretField, v: string) => {
    const trimmed = v.trim();
    if (!server || !trimmed) return;
    const prev = server;
    const flag =
      field === "embedding_api_key"
        ? "embedding_api_key_set"
        : "rerank_api_key_set";
    const next: ServerSettings = { ...server, [flag]: true };
    if (field === "embedding_api_key") {
      next.semantic_recall_configured = server.semantic_recall_enabled;
    } else {
      next.rerank_configured = server.rerank_enabled;
    }
    setServer(next);
    try {
      await settingsApi.updateLlm({ [field]: trimmed });
    } catch {
      setServer(prev);
    }
  };

  return {
    server,
    llm,
    err,
    setLlm,
    setDefaultConflict,
    setServerNumber,
    setServerBoolean,
    setServerString,
    setServerSecret,
  };
}

// ---- First-run guide ------------------------------------------------------

function QuickStartSection({ ctx }: { ctx: ServerCtx }) {
  const { llm, err } = ctx;
  const { t } = useI18n();
  const missing = missingRequiredProfiles(llm);
  const ready = Boolean(llm && missing.length === 0);
  const statusText = err
    ? t.settings.guideStatusOffline
    : !llm
      ? t.settings.guideStatusLoading
      : ready
        ? t.settings.guideStatusReady
        : !llm.defaults.api_key_set && missing.length === 3
          ? t.settings.guideStatusDefaultMissing
          : t.settings.guideStatusMissingProfiles(missing.join(", "));

  return (
    <Section
      id="quickstart"
      title={t.settings.guideTitle}
      subtitle={t.settings.guideSubtitle}
    >
      <div className="space-y-4">
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
            ready
              ? "bg-accent-subtle text-fg-base"
              : "bg-danger/10 text-fg-base",
          )}
        >
          {ready ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          )}
          <span>{statusText}</span>
        </div>

        <ol className="space-y-3 text-sm">
          <GuideStep index={1} title={t.settings.guideConfigureTitle}>
            <p>{t.settings.guideConfigureBody}</p>
          </GuideStep>
          <GuideStep index={2} title={t.settings.guideImportTitle}>
            <p>{t.settings.guideImportBody}</p>
          </GuideStep>
          <GuideStep index={3} title={t.settings.guideAskTitle}>
            <p>{t.settings.guideAskBody}</p>
          </GuideStep>
          <GuideStep index={4} title={t.settings.guideEmbeddingTitle}>
            <p>{t.settings.guideEmbeddingBody}</p>
          </GuideStep>
        </ol>
      </div>
    </Section>
  );
}

function GuideStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-fg-muted">
        {index}
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-fg-muted">{children}</div>
      </div>
    </li>
  );
}

function missingRequiredProfiles(llm: LlmSettings | null): string[] {
  if (!llm) return [];
  return (["chat", "reflect", "ingest"] as const).filter(
    (profile) => !llm.profiles[profile]?.api_key_set,
  );
}

// ---- Connection ------------------------------------------------------------

function ConnectionSection() {
  const { t } = useI18n();
  // This field represents only an explicit remote-backend override. Never
  // expose Tauri's ephemeral bundled-sidecar URL here: saving that runtime
  // port would make the next app launch point at a dead backend.
  const [base, setBase] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [token, setToken] = useState(() => getApiToken());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    const v = base.trim().replace(/\/$/, "");
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      if (v) {
        await probeBackendBaseUrl(v, token);
        localStorage.setItem(STORAGE_KEY, v);
        setBaseUrl(v);
      } else {
        clearBaseUrlOverride();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setSaveError(t.settings.apiBaseValidationFailed(detail));
      return;
    } finally {
      setSaving(false);
    }
    setApiToken(token);
    setSavedAt(Date.now());
  };

  return (
    <Section id="connection" title={t.settings.connectionTitle} subtitle={t.settings.connectionSubtitle}>
      <label className="block text-sm font-medium">{t.settings.apiBaseUrl}</label>
      <p className="mt-1 text-xs text-fg-subtle">
        {t.settings.apiBaseHelp}
        <span className="mx-1 font-mono">http://host:8000</span>
        {t.settings.apiBaseHelpTail}
      </p>
      <p className="mt-1 text-xs text-warning">{t.settings.apiBaseModelWarning}</p>
      <div className="mt-3 flex gap-2">
        <input
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder={t.settings.apiBasePlaceholder}
          className="flex-1 rounded-md border border-border bg-bg-base px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
        <Button
          type="primary"
          loading={saving}
          icon={<Save size={13} />}
          onClick={() => void save()}
        >
          {saving ? t.settings.apiBaseValidating : t.common.save}
        </Button>
      </div>
      <label className="mt-4 block text-sm font-medium">{t.settings.apiToken}</label>
      <p className="mt-1 text-xs text-fg-subtle">{t.settings.apiTokenHelp}</p>
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        type="password"
        placeholder={t.settings.apiTokenPlaceholder}
        className="mt-3 w-full rounded-md border border-border bg-bg-base px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
      />
      {savedAt && (
        <p className="mt-2 text-xs text-fg-subtle">
          {t.common.saved} · {new Date(savedAt).toLocaleTimeString()}
        </p>
      )}
      {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
    </Section>
  );
}

// ---- WebDAV sync -----------------------------------------------------------

function WebDavSection({ initial }: { initial: WebDavStatus | null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<WebDavStatus | null>(initial);
  const [url, setUrl] = useState(initial?.url ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [remotePath, setRemotePath] = useState(initial?.remote_path ?? "/marginalia");
  const [autoSync, setAutoSync] = useState(Boolean(initial?.auto_sync_enabled));
  const [interval, setIntervalValue] = useState(String(initial?.auto_sync_interval_minutes ?? 60));
  const [busy, setBusy] = useState<"save" | "remote" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    webdavSync.status().then(
      (s) => {
        if (cancelled) return;
        setStatus(s);
        setUrl(s.url ?? "");
        setUsername(s.username ?? "");
        setRemotePath(s.remote_path || "/marginalia");
        setAutoSync(Boolean(s.auto_sync_enabled));
        setIntervalValue(String(s.auto_sync_interval_minutes ?? 60));
      },
      () => {},
    );
    return () => { cancelled = true; };
  }, []);

  const refresh = async () => {
    const next = await webdavSync.status();
    setStatus(next);
    return next;
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    setError(null);
    try {
      const patch: Record<string, string | number | boolean | null> = {
        webdav_url: url.trim() || null,
        webdav_username: username.trim() || null,
        webdav_remote_path: remotePath.trim() || "/marginalia",
        webdav_auto_sync_enabled: autoSync,
        webdav_auto_sync_interval_minutes: parseInt(interval, 10) || 60,
      };
      if (password.trim()) patch.webdav_password = password.trim();
      const next = await webdavSync.updateConfig(patch);
      setStatus(next);
      setPassword("");
      setMessage(t.settings.webdavSaved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const syncRemoteStatus = async () => {
    setBusy("remote");
    setMessage(null);
    setError(null);
    try {
      const result = await webdavSync.remoteStatus();
      await refresh();
      setMessage(t.settings.webdavRemoteStatusOk(result.status));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const last = status?.last;
  const lastUpload = last?.finished_at ? formatDateTime(last.finished_at) : t.common.unset;
  const lastRemoteCheck = last?.last_remote_check_at
    ? formatDateTime(last.last_remote_check_at)
    : t.common.unset;
  const remoteUpdated = last?.remote_updated_at
    ? formatDateTime(last.remote_updated_at)
    : t.common.unset;
  const remoteSnapshot = last?.remote_snapshot_id || t.common.unset;

  return (
    <Section id="webdav" title={t.settings.webdavTitle} subtitle={t.settings.webdavSubtitle}>
      <div className="space-y-4">
        <Row label={t.settings.webdavUrl}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/dav"
            className="w-80 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs"
          />
        </Row>
        <Row label={t.settings.webdavRemotePath} hint={t.settings.webdavRemotePathHint}>
          <input
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            placeholder="/marginalia"
            className="w-56 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs"
          />
        </Row>
        <Row label={t.settings.webdavUsername}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-56 rounded border border-border bg-bg-base px-2 py-1 text-sm"
          />
        </Row>
        <Row
          label={t.settings.webdavPassword}
          hint={status?.password_set ? t.settings.webdavPasswordSet : t.settings.webdavPasswordHint}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={status?.password_set ? t.settings.webdavKeepPassword : ""}
            className="w-56 rounded border border-border bg-bg-base px-2 py-1 text-sm"
          />
        </Row>
        <Row label={t.settings.webdavAutoSync} hint={t.settings.webdavAutoSyncHint}>
          <div className="flex items-center gap-2">
            <Switch
              size="small"
              checked={autoSync}
              onChange={(checked) => setAutoSync(checked)}
            />
            <input
              type="number"
              min={5}
              max={10080}
              value={interval}
              onChange={(e) => setIntervalValue(e.target.value)}
              className="w-20 rounded border border-border bg-bg-base px-2 py-1 text-right font-mono text-xs"
            />
            <span className="text-xs text-fg-subtle">{t.settings.webdavMinutes}</span>
          </div>
        </Row>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            loading={busy === "save"}
            icon={<Save size={13} />}
            onClick={save}
          >
            {busy === "save" ? t.settings.webdavSaving : t.common.save}
          </Button>
          <Button
            onClick={syncRemoteStatus}
            disabled={busy !== null || !status?.configured}
            loading={busy === "remote"}
          >
            {t.settings.webdavRemoteStatus}
          </Button>
        </div>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
          <Kv k={t.settings.webdavConfigured} v={status?.configured ? t.common.yes : t.common.no} />
          <Kv k={t.settings.webdavLastRemoteCheck} v={lastRemoteCheck} />
          <Kv k={t.settings.webdavRemoteUpdated} v={remoteUpdated} />
          <Kv k={t.settings.webdavSnapshot} v={remoteSnapshot} mono />
          <Kv k={t.settings.webdavLastUpload} v={lastUpload} />
          {last?.last_download_at && (
            <Kv k={t.settings.webdavLastDownload} v={formatDateTime(last.last_download_at)} />
          )}
          {last?.remote_error && <Kv k={t.settings.webdavRemoteError} v={last.remote_error} />}
          {last?.error && <Kv k={t.settings.webdavLastError} v={last.error} />}
        </dl>
        {message && <p className="text-xs text-fg-subtle">{message}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Section>
  );
}

// ---- Models ----------------------------------------------------------------

function AppearanceSection() {
  const { mode, setMode } = useTheme();
  const prefs = usePrefs();
  const { t, language, setLanguage } = useI18n();
  return (
    <Section id="appearance" title={t.settings.appearanceTitle}>
      <div className="space-y-5">
        <Row label={t.settings.language} hint={t.settings.languageHint}>
          <Select
            size="small"
            value={language}
            className="w-32"
            onChange={(v) => setLanguage(v as LanguagePreference)}
            options={[
              { value: "auto", label: t.locale.auto },
              { value: "en", label: t.locale.en },
              { value: "zh", label: t.locale.zh },
            ]}
          />
        </Row>

        <Row label={t.settings.theme}>
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as "light" | "dark" | "system")}
            options={[
              { value: "light", icon: <Sun size={14} />, label: t.theme.light },
              { value: "dark", icon: <Moon size={14} />, label: t.theme.dark },
              { value: "system", icon: <Monitor size={14} />, label: t.theme.system },
            ]}
          />
        </Row>

        <Row label={t.settings.compactSidebar} hint={t.settings.compactSidebarHint}>
          <Switch
            size="small"
            checked={prefs.compactSidebar}
            onChange={(checked) => prefs.setCompactSidebar(checked)}
          />
        </Row>
      </div>
    </Section>
  );
}

function ModelsSection({ ctx }: { ctx: ServerCtx }) {
  const { llm, setLlm } = ctx;
  const { t } = useI18n();
  if (!llm) {
    return (
      <Section id="llm-profiles" title={t.settings.llmProfilesTitle} subtitle={t.settings.llmProfilesSubtitle}>
        <p className="text-sm text-fg-subtle">{t.common.loading}</p>
      </Section>
    );
  }
  return (
    <>
      <Section id="llm-profiles" title={t.settings.llmProfilesTitle} subtitle={t.settings.llmProfilesSubtitle}>
        <LlmProfileEditor data={llm} onChange={setLlm} />
      </Section>
      <RetrievalSection ctx={ctx} />
    </>
  );
}

// ---- Strategy (preferences minus appearance) --------------------------------

function PreferencesSection({ ctx }: { ctx: ServerCtx }) {
  const prefs = usePrefs();
  const { t } = useI18n();
  const {
    server,
    setDefaultConflict,
    setServerNumber,
    setServerBoolean,
  } = ctx;

  return (
    <Section id="preferences" title={t.settings.strategyTitle} subtitle={t.settings.preferencesSubtitle}>
      <div className="space-y-5">
        <Row
          label={t.settings.conflictPolicy}
          hint={t.settings.conflictHint}
        >
          <Select
            size="small"
            value={server?.default_on_conflict ?? "rename"}
            disabled={!server}
            className="w-40"
            onChange={(v) => setDefaultConflict(v as OnConflict)}
            options={[
              { value: "rename", label: t.settings.conflictRename },
              { value: "error", label: t.settings.conflictError },
              { value: "skip", label: t.settings.conflictSkip },
            ]}
          />
        </Row>

        <Row
          label={t.settings.agentTokenBudget}
          hint={t.settings.agentTokenBudgetHint}
        >
          <div className="flex items-center gap-1.5">
            <NumberInput
              value={server?.agent_plan_max_tokens}
              disabled={!server}
              min={1}
              max={200000}
              step={128}
              className="w-20"
              onCommit={(v) => setServerNumber("agent_plan_max_tokens", v)}
            />
            <span className="text-xs text-fg-subtle">/</span>
            <NumberInput
              value={server?.agent_execute_max_tokens}
              disabled={!server}
              min={1}
              max={200000}
              step={128}
              className="w-20"
              onCommit={(v) => setServerNumber("agent_execute_max_tokens", v)}
            />
          </div>
        </Row>

        <Row
          label={t.settings.executeTurnBudget}
          hint={t.settings.executeTurnBudgetHint}
        >
          <NumberInput
            value={server?.agent_execute_max_turns}
            disabled={!server}
            min={3}
            max={100}
            step={1}
            className="w-16"
            onCommit={(v) => setServerNumber("agent_execute_max_turns", v)}
          />
        </Row>

        <Row
          label={t.settings.compression}
          hint={t.settings.compressionHint}
        >
          <Switch
            size="small"
            checked={Boolean(server?.compression_enabled)}
            disabled={!server}
            onChange={(checked) => setServerBoolean("compression_enabled", checked)}
          />
        </Row>

        <Row
          label={t.settings.concurrentIngest}
          hint={t.settings.concurrentIngestHint}
        >
          <NumberInput
            value={server?.worker_batch_size}
            disabled={!server}
            min={1}
            max={32}
            step={1}
            className="w-16"
            onCommit={(v) => setServerNumber("worker_batch_size", v)}
          />
        </Row>

        <Row
          label={t.settings.ingestLlmConcurrency}
          hint={t.settings.ingestLlmConcurrencyHint}
        >
          <NumberInput
            value={server?.llm_ingest_concurrency}
            disabled={!server}
            min={1}
            max={32}
            step={1}
            className="w-16"
            onCommit={(v) => setServerNumber("llm_ingest_concurrency", v)}
          />
        </Row>

        <Row
          label={t.settings.statusRefresh}
          hint={t.settings.statusRefreshHint}
        >
          <Select
            size="small"
            value={prefs.statusPollMs}
            className="w-32"
            onChange={(v) => prefs.setStatusPollMs(v as number)}
            options={[
              { value: 2000, label: "2 s" },
              { value: 4000, label: "4 s (default)" },
              { value: 10000, label: "10 s" },
              { value: 30000, label: "30 s" },
              { value: 60000, label: "60 s" },
            ]}
          />
        </Row>
      </div>
    </Section>
  );
}

// ---- Retrieval ------------------------------------------------------------

function RetrievalSection({ ctx }: { ctx: ServerCtx }) {
  const {
    server,
    setServerBoolean,
    setServerNumber,
    setServerString,
    setServerSecret,
  } = ctx;
  const { t } = useI18n();
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  if (!server) {
    return (
      <Section title={t.settings.retrievalTitle} subtitle={t.settings.retrievalSubtitle}>
        <p className="text-sm text-fg-subtle">{t.common.loading}</p>
      </Section>
    );
  }

  const rebuildSemanticIndex = async () => {
    setRebuildBusy(true);
    setRebuildMessage(null);
    setRebuildError(null);
    try {
      const result = await settingsApi.rebuildSemanticIndex();
      setRebuildMessage(t.settings.semanticRebuildQueued(result.task_id?.slice(0, 8) ?? ""));
    } catch (e: unknown) {
      setRebuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setRebuildBusy(false);
    }
  };

  return (
    <Section id="retrieval" title={t.settings.retrievalTitle} subtitle={t.settings.retrievalSubtitle}>
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="text-xs font-semibold text-fg-muted">
            {t.settings.embeddingGroup}
          </div>

          <Row label={t.settings.semanticRecall} hint={t.settings.semanticRecallHint}>
            <Switch
              size="small"
              checked={server.semantic_recall_enabled}
              onChange={(checked) => setServerBoolean("semantic_recall_enabled", checked)}
            />
          </Row>

          <Row label={t.settings.embeddingProvider}>
            <Select
              size="small"
              value={server.embedding_provider}
              className="w-48"
              onChange={(v) => setServerString("embedding_provider", v as string)}
              options={[
                { value: "openai-compatible", label: "openai-compatible" },
                { value: "dashscope", label: "dashscope" },
              ]}
            />
          </Row>

          <Row label={t.settings.embeddingApiKey} hint={t.llm.keepKeyHint}>
            <SecretInput
              configured={server.embedding_api_key_set}
              onCommit={(v) => setServerSecret("embedding_api_key", v)}
            />
          </Row>

          <Row label={t.settings.embeddingBaseUrl}>
            <TextInput
              value={server.embedding_base_url}
              className="w-72"
              onCommit={(v) => setServerString("embedding_base_url", v)}
            />
          </Row>

          <Row label={t.settings.embeddingModel}>
            <TextInput
              value={server.embedding_model}
              className="w-48"
              onCommit={(v) => setServerString("embedding_model", v)}
            />
          </Row>

          <Row label={t.settings.embeddingDimensions}>
            <NumberInput
              value={server.embedding_dimensions}
              min={1}
              max={8192}
              step={1}
              className="w-20"
              onCommit={(v) => setServerNumber("embedding_dimensions", v)}
            />
          </Row>

          <Row label={t.settings.embeddingBatchSize}>
            <NumberInput
              value={server.embedding_batch_size}
              min={1}
              max={10}
              step={1}
              className="w-16"
              onCommit={(v) => setServerNumber("embedding_batch_size", v)}
            />
          </Row>

          <Row label={t.settings.semanticRecallLimit}>
            <NumberInput
              value={server.semantic_recall_limit}
              min={1}
              max={1000}
              step={1}
              className="w-20"
              onCommit={(v) => setServerNumber("semantic_recall_limit", v)}
            />
          </Row>

          <Row label={t.settings.semanticIndexBackend}>
            <Select
              size="small"
              value={server.semantic_index_backend}
              className="w-40"
              onChange={(v) => setServerString("semantic_index_backend", v as string)}
              options={[
                { value: "auto", label: "auto" },
                { value: "file", label: "file" },
                { value: "sqlite-vec", label: "sqlite-vec" },
              ]}
            />
          </Row>

          <Row label={t.settings.semanticIndex} hint={t.settings.semanticIndexHint}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-fg-muted">
                  {semanticIndexStatusLabel(server, t)}
                </span>
                <Button
                  size="small"
                  disabled={!server.embedding_api_key_set || rebuildBusy}
                  loading={rebuildBusy}
                  onClick={rebuildSemanticIndex}
                  title={server.embedding_api_key_set ? t.settings.rebuildSemanticIndex : t.settings.semanticRebuildNoKey}
                >
                  {t.settings.rebuildSemanticIndex}
                </Button>
              </div>
              {rebuildMessage && <p className="text-xs text-fg-muted">{rebuildMessage}</p>}
              {rebuildError && <p className="text-xs text-danger">{rebuildError}</p>}
            </div>
          </Row>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="text-xs font-semibold text-fg-muted">
            {t.settings.documentVisionGroup}
          </div>

          <Row label={t.settings.documentVisionEnabled} hint={t.settings.documentVisionEnabledHint}>
            <Switch
              size="small"
              checked={server.document_vision_enabled}
              onChange={(checked) => setServerBoolean("document_vision_enabled", checked)}
            />
          </Row>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="text-xs font-semibold text-fg-muted">
            {t.settings.rerankGroup}
          </div>

          <Row label={t.settings.rerankEnabled} hint={t.settings.rerankEnabledHint}>
            <Switch
              size="small"
              checked={server.rerank_enabled}
              onChange={(checked) => setServerBoolean("rerank_enabled", checked)}
            />
          </Row>

          <Row label={t.settings.rerankApiKey} hint={t.llm.keepKeyHint}>
            <SecretInput
              configured={server.rerank_api_key_set}
              onCommit={(v) => setServerSecret("rerank_api_key", v)}
            />
          </Row>

          <Row label={t.settings.rerankBaseUrl}>
            <TextInput
              value={server.rerank_base_url}
              className="w-72"
              onCommit={(v) => setServerString("rerank_base_url", v)}
            />
          </Row>

          <Row label={t.settings.rerankModel}>
            <TextInput
              value={server.rerank_model}
              className="w-48"
              onCommit={(v) => setServerString("rerank_model", v)}
            />
          </Row>

          <Row label={t.settings.rerankTopN}>
            <NumberInput
              value={server.rerank_top_n}
              min={1}
              max={1000}
              step={1}
              className="w-20"
              onCommit={(v) => setServerNumber("rerank_top_n", v)}
            />
          </Row>

          <Row label={t.settings.rerankMaxDocChars}>
            <NumberInput
              value={server.rerank_max_doc_chars}
              min={1}
              max={200000}
              step={100}
              className="w-24"
              onCommit={(v) => setServerNumber("rerank_max_doc_chars", v)}
            />
          </Row>

          <Row label={t.settings.rerankConcurrency}>
            <NumberInput
              value={server.rerank_concurrency}
              min={1}
              max={64}
              step={1}
              className="w-16"
              onCommit={(v) => setServerNumber("rerank_concurrency", v)}
            />
          </Row>

          <Row label={t.settings.evidenceSelection} hint={t.settings.evidenceSelectionHint}>
            <Select
              size="small"
              value={server.evidence_selection}
              className="w-28"
              onChange={(v) => setServerString("evidence_selection", v as string)}
              options={[
                { value: "quota", label: "quota" },
                { value: "rerank", label: "rerank" },
              ]}
            />
          </Row>
        </div>
      </div>
    </Section>
  );
}

// ---- Server status + LLM editor --------------------------------------------

function ServerSection({ ctx }: { ctx: ServerCtx }) {
  const { server, llm, err } = ctx;
  const { t } = useI18n();

  if (err) {
    return (
      <Section title={t.settings.serverTitle} subtitle={t.settings.serverSubtitle}>
        <p className="text-sm text-danger">{t.settings.backendUnreachable(err)}</p>
      </Section>
    );
  }

  if (!server || !llm) {
    return (
      <Section title={t.settings.serverTitle} subtitle={t.settings.serverSubtitle}>
        <p className="text-sm text-fg-subtle">{t.common.loading}</p>
      </Section>
    );
  }

  return (
    <>
      <Section id="server-status" title={t.settings.serverStatusTitle} subtitle={t.settings.serverStatusSubtitle}>
        <dl className="grid grid-cols-[1fr_2fr] gap-x-4 gap-y-2 text-sm">
          <Kv k={t.settings.kv.appEnv} v={server.app_env} />
          <Kv k={t.settings.kv.home} v={server.marginalia_home} mono />
          <Kv k={t.settings.kv.db} v={server.db_backend} />
          <Kv k={t.settings.kv.storage} v={server.storage_backend} />
          <Kv k={t.settings.kv.worker} v={server.worker_enabled ? t.common.yes : t.common.no} />
          {server.worker_batch_size != null && (
            <Kv k={t.settings.kv.concurrentIngest} v={String(server.worker_batch_size)} />
          )}
          <Kv k={t.settings.kv.autoLifecycle} v={server.auto_lifecycle_enabled ? t.common.enabled : t.common.disabled} />
          <Kv k={t.settings.kv.conflict} v={server.default_on_conflict} />
          <Kv
            k={t.settings.kv.tokenBudget}
            v={`${server.agent_plan_max_tokens.toLocaleString()} / ${server.agent_execute_max_tokens.toLocaleString()}`}
          />
          <Kv k={t.settings.kv.executeTurns} v={String(server.agent_execute_max_turns)} />
          <Kv
            k={t.settings.kv.compression}
            v={server.compression_enabled ? t.common.enabled : t.common.disabled}
          />
          <Kv k={t.settings.kv.ingestConcurrency} v={String(server.llm_ingest_concurrency)} />
          <Kv
            k={t.settings.kv.semanticRecall}
            v={capabilityStatus(
              server.semantic_recall_enabled,
              server.embedding_api_key_set,
              t,
            )}
          />
          <Kv
            k={t.settings.kv.embedding}
            v={`${server.embedding_provider}/${server.embedding_model} (${server.embedding_dimensions}d)`}
          />
          <Kv
            k={t.settings.kv.rerank}
            v={capabilityStatus(server.rerank_enabled, server.rerank_api_key_set, t)}
          />
          <Kv k={t.settings.kv.evidenceSelection} v={server.evidence_selection} />
          <Kv
            k={t.settings.kv.documentVision}
            v={server.document_vision_enabled ? t.common.enabled : t.common.disabled}
          />
          <Kv
            k={t.settings.kv.vision}
            v={visionConfigured(llm) ? t.settings.visionConfigured : t.settings.visionMissing}
          />
        </dl>
      </Section>
    </>
  );
}

// ---- shared bits -----------------------------------------------------------

function SettingsNav({ items }: { items: { id: string; label: string }[] }) {
  const { t } = useI18n();
  return (
    <aside className="hidden w-44 shrink-0 lg:block">
      <div className="sticky top-8 space-y-0.5">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {t.settings.title}
        </div>
        <nav className="flex flex-col">
          {items.map((it) => (
            <Button
              key={it.id}
              type="text"
              size="small"
              onClick={() =>
                document
                  .getElementById(it.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="h-auto w-full px-2 py-1 text-sm text-fg-muted"
              style={{ justifyContent: "flex-start", textAlign: "left" }}
            >
              {it.label}
            </Button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 rounded-md border border-border bg-bg-subtle p-4">
      <h2 className="text-sm font-semibold">
        {title}
        {subtitle && (
          <Tooltip title={subtitle}>
            <span className="ml-1 inline-flex translate-y-px cursor-help text-fg-subtle hover:text-fg-muted">
              <CircleHelp size={12} aria-label={subtitle} />
            </span>
          </Tooltip>
        )}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {label}
          {hint && (
            <Tooltip title={hint}>
              <span className="ml-1 inline-flex translate-y-px cursor-help text-fg-subtle hover:text-fg-muted">
                <CircleHelp size={12} aria-label={hint} />
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-fg-muted">{k}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs")}>{v}</dd>
    </>
  );
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function capabilityStatus(
  enabled: boolean,
  keySet: boolean,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!enabled) return t.common.disabled;
  return keySet ? t.common.enabled : t.settings.enabledMissingKey;
}

function semanticIndexStatusLabel(
  server: ServerSettings,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const index = server.semantic_index;
  if (!index?.exists) return t.settings.semanticIndexMissing;
  if (index.needs_rebuild || !index.compatible) return t.settings.semanticIndexNeedsRebuild;
  return t.settings.semanticIndexReady(index.entries);
}

// Local-state number input that commits on blur / Enter, so the server
// only sees the final value (PUT per keystroke would spam the overlay
// with intermediate junk like 1, 12, 124, ...). Out-of-range values
// roll back to the last accepted server value.
function NumberInput({
  value,
  disabled,
  min,
  max,
  step,
  className,
  onCommit,
}: {
  value: number | undefined;
  disabled?: boolean;
  min: number;
  max: number;
  step: number;
  className?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < min || n > max || n === value) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    onCommit(n);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "rounded border border-border bg-bg-base px-2 py-1 text-right font-mono text-xs disabled:opacity-50",
        className,
      )}
    />
  );
}

function TextInput({
  value,
  disabled,
  className,
  onCommit,
}: {
  value: string | undefined;
  disabled?: boolean;
  className?: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string>(value ?? "");
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    const v = draft.trim();
    if (!v || v === value) {
      setDraft(value ?? "");
      return;
    }
    onCommit(v);
  };

  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs disabled:opacity-50",
        className,
      )}
    />
  );
}

function SecretInput({
  configured,
  disabled,
  onCommit,
}: {
  configured: boolean;
  disabled?: boolean;
  onCommit: (v: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    const v = draft.trim();
    if (!v || saving) return;
    setSaving(true);
    try {
      await onCommit(v);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={draft}
        disabled={disabled || saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
        }}
        placeholder={configured ? t.settings.secretConfigured : t.common.unset}
        className="w-48 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs disabled:opacity-50"
      />
      <Button
        type="text"
        size="small"
        title={t.common.save}
        icon={<Save size={13} />}
        onClick={() => void commit()}
        disabled={disabled || saving || !draft.trim()}
      />
    </div>
  );
}

// vision_profile_configured from /v1/settings/server is captured at first
// fetch and goes stale after the user edits the overlay. The /v1/settings/llm
// response always reflects current overlay+env state, so derive from there.
function visionConfigured(llm: LlmSettings): boolean {
  const v = llm.profiles.vision;
  return Boolean(v?.api_key_set || v?.base_url || v?.model);
}
