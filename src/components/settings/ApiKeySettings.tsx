import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { ANTHROPIC_KEYS_URL } from "@/config/app";
import { services } from "@/services";
import { useCredentialStore } from "@/stores/credentialStore";
import { useNetworkStore } from "@/stores/networkStore";
import { toast } from "@/stores/toastStore";
import type { KeyValidation, KeyValidationState } from "@/types/settings";
import { errorCopy } from "@/utils/errors";
import { formatRelativeDate } from "@/utils/format";
import { SettingsPage, SettingsRow, SettingsSection } from "./SettingsSection";

const VALIDATION_TONE: Record<KeyValidationState, { tone: BadgeTone; label: string }> = {
  valid: { tone: "success", label: "Valid" },
  invalid: { tone: "danger", label: "Rejected" },
  permission_denied: { tone: "danger", label: "No permission" },
  rate_limited: { tone: "warning", label: "Valid · rate limited" },
  unreachable: { tone: "neutral", label: "Could not verify" },
  offline: { tone: "neutral", label: "Offline" },
  unverified: { tone: "neutral", label: "Not verified" },
};

function ValidationLine({ validation }: { validation: KeyValidation }) {
  const v = VALIDATION_TONE[validation.state];
  const icon: ReactNode =
    validation.state === "valid" || validation.state === "rate_limited" ? (
      <CheckCircle2 size={13} className="text-success" />
    ) : validation.state === "invalid" || validation.state === "permission_denied" ? (
      <XCircle size={13} className="text-danger" />
    ) : null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-[3px]">{icon}</span>}
      <div>
        <div className="flex items-center gap-2">
          <Badge tone={v.tone}>{v.label}</Badge>
          <span className="text-xs text-fg-subtle">Checked {formatRelativeDate(validation.checkedAt)}</span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">{validation.message}</p>
      </div>
    </div>
  );
}

function KeyEntry({ onDone, replacing }: { onDone: () => void; replacing: boolean }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [check, setCheck] = useState<KeyValidation | null>(null);
  const { busy, validate, save } = useCredentialStore();
  const online = useNetworkStore((s) => s.online);
  const trimmed = value.trim();
  const formatOk = trimmed.length >= 20;

  const onValidate = async () => setCheck(await validate(trimmed));

  const onSave = async () => {
    // Validate first; refuse keys the API explicitly rejects.
    const result = online ? await validate(trimmed) : null;
    if (result) setCheck(result);
    if (result && (result.state === "invalid" || result.state === "permission_denied")) return;
    if (await save(trimmed)) {
      setValue("");
      toast.success(replacing ? "API key replaced" : "API key saved", {
        description: services.credentials.storage === "keychain" ? "Stored in the macOS Keychain." : "Kept in memory for this session.",
      });
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setCheck(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && formatOk) void onSave();
        }}
        placeholder="sk-ant-api03-…"
        aria-label="Anthropic API key"
        mono
        autoFocus
        leading={<KeyRound size={14} />}
        invalid={check?.state === "invalid"}
        trailing={
          <IconButton
            size="xs"
            label={visible ? "Hide key" : "Show key"}
            icon={visible ? <EyeOff size={14} /> : <Eye size={14} />}
            onClick={() => setVisible((v) => !v)}
          />
        }
      />
      {check && <ValidationLine validation={check} />}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void services.settings.openExternal(ANTHROPIC_KEYS_URL)}
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          Get an API key <ExternalLink size={12} />
        </button>
        <div className="flex gap-2">
          {replacing && (
            <Button variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button size="sm" disabled={!formatOk || !online || busy !== null} loading={busy === "validating"} onClick={() => void onValidate()}>
            Validate
          </Button>
          <Button size="sm" variant="primary" disabled={!formatOk || busy !== null} loading={busy === "saving"} onClick={() => void onSave()}>
            Save key
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ApiKeySettings() {
  const { status, loading, busy, error, validate, remove, refresh } = useCredentialStore();
  const online = useNetworkStore((s) => s.online);
  const [replacing, setReplacing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const configured = Boolean(status?.configured);
  const keychain = services.credentials.storage === "keychain";

  useEffect(() => {
    if (!status && !loading) void refresh();
  }, [status, loading, refresh]);

  const connection = !configured
    ? { label: "Not configured", tone: "warning" as BadgeTone }
    : status?.lastValidation
      ? { label: VALIDATION_TONE[status.lastValidation.state].label, tone: VALIDATION_TONE[status.lastValidation.state].tone }
      : { label: "Configured · not yet verified", tone: "neutral" as BadgeTone };

  return (
    <SettingsPage title="AI Configuration" description="CADify uses Claude by Anthropic to interpret engineering drawings.">
      <SettingsSection>
        <SettingsRow
          label="Connection status"
          description={
            configured
              ? `Key ending in ${status?.hint ?? "····"} · stored in ${keychain ? "the macOS Keychain" : "memory for this session"}`
              : "Add an Anthropic API key to enable model generation."
          }
        >
          <Badge tone={connection.tone} dot>
            {loading && !status ? "Checking…" : connection.label}
          </Badge>
        </SettingsRow>

        {configured && !replacing ? (
          <>
            {status?.lastValidation && (
              <SettingsRow label="Last check" stacked>
                <ValidationLine validation={status.lastValidation} />
              </SettingsRow>
            )}
            <SettingsRow label="Anthropic API key" description={<span className="font-mono">sk-ant-••••••••••••{status?.hint}</span>}>
              <Button size="sm" loading={busy === "validating"} disabled={!online || busy !== null} onClick={() => void validate()}>
                Validate key
              </Button>
              <Button size="sm" onClick={() => setReplacing(true)} disabled={busy !== null}>
                Replace key
              </Button>
              <Button size="sm" variant="danger-ghost" icon={<Trash2 size={13} />} onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
                Remove
              </Button>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow label={replacing ? "Replace API key" : "Anthropic API key"} description="Paste a key from the Anthropic Console." stacked>
            <KeyEntry replacing={replacing} onDone={() => setReplacing(false)} />
          </SettingsRow>
        )}

        {error && (
          <div className="border-t border-line bg-danger-soft/50 px-4 py-2.5 text-sm text-danger" role="alert">
            {errorCopy(error.code).title}: {error.message}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="How your key is protected">
        <div className="flex flex-col gap-3 px-4 py-3.5 text-sm text-fg-muted">
          <p className="flex gap-2.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
            {keychain
              ? "The key is stored in the macOS Keychain by CADify’s native backend. It is never written to local storage, the project database, configuration files or environment files."
              : "Browser preview: the key is held in memory for this tab only and is never written to web storage. Use the desktop app to store it in the macOS Keychain."}
          </p>
          <p className="flex gap-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
            The interface never receives the key back — only whether one is configured and its last four characters. Requests to Anthropic are made by the native backend.
          </p>
        </div>
      </SettingsSection>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove API key?"
        description="Generation will be unavailable until you add a key again. The key is deleted from the Keychain."
        confirmLabel="Remove key"
        destructive
        busy={busy === "removing"}
        onConfirm={async () => {
          if (await remove()) {
            setConfirmRemove(false);
            toast.info("API key removed");
          }
        }}
      />
    </SettingsPage>
  );
}
