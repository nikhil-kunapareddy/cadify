import {
  AlertTriangle,
  Box,
  CheckCircle2,
  CircleDot,
  Cylinder,
  Info,
  KeyRound,
  MinusCircle,
  RectangleHorizontal,
  Scissors,
  Shapes,
  SquareRoundCorner,
  Triangle,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { PanelSection, PropertyRow } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { services } from "@/services";
import { useCredentialStore } from "@/stores/credentialStore";
import { useExportStore } from "@/stores/exportStore";
import { useGenerationStore } from "@/stores/generationStore";
import { useNetworkStore } from "@/stores/networkStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import type { CheckResult, DetectedFeature, FeatureKind, GenerationResult, GenerationUsage, OutputSelection } from "@/types/generation";
import { cn } from "@/utils/cn";
import { describePageSize, formatBytes, formatDateTime } from "@/utils/format";
import { ExportCard } from "./ExportCard";

// ---------------------------------------------------------------- document

export function DocumentSection({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const drawing = useProjectStore((s) => s.project?.drawing);
  if (!drawing) return null;
  return (
    <PanelSection title="Document" defaultOpen={defaultOpen}>
      <PropertyRow label="File" title={drawing.fileName}>
        {drawing.fileName}
      </PropertyRow>
      <PropertyRow label="Format">PDF{drawing.pdfVersion ? ` ${drawing.pdfVersion}` : ""}</PropertyRow>
      <PropertyRow label="Pages">{drawing.pageCount}</PropertyRow>
      <PropertyRow label="Sheet size" title={describePageSize(drawing.pageSizes[0])}>
        {describePageSize(drawing.pageSizes[0])}
      </PropertyRow>
      <PropertyRow label="File size">{formatBytes(drawing.sizeBytes)}</PropertyRow>
      {drawing.title && (
        <PropertyRow label="Title" title={drawing.title}>
          {drawing.title}
        </PropertyRow>
      )}
      <PropertyRow label="Uploaded">{formatDateTime(drawing.importedAt)}</PropertyRow>
      <DrawingTypeRow />
    </PanelSection>
  );
}

function DrawingTypeRow() {
  const drawingType = useGenerationStore((s) => s.result?.drawingType);
  return (
    <PropertyRow label="Drawing type" muted={!drawingType} title={drawingType}>
      {drawingType ?? "Detected during generation"}
    </PropertyRow>
  );
}

// --------------------------------------------------------------- generation

export function GenerationConfigSection() {
  const outputs = useGenerationStore((s) => s.outputs);
  const setOutputs = useGenerationStore((s) => s.setOutputs);
  const status = useGenerationStore((s) => s.status);
  const result = useGenerationStore((s) => s.result);
  const cred = useCredentialStore((s) => s.status);
  const credLoading = useCredentialStore((s) => s.loading);
  const online = useNetworkStore((s) => s.online);
  const navigate = useUiStore((s) => s.navigate);
  const drawing = useProjectStore((s) => s.project?.drawing);
  const running = status === "running" || status === "clarification";

  const geometry: { label: string; tone: "neutral" | "accent" | "success" | "danger" | "warning" } = running
    ? { label: status === "clarification" ? "Needs input" : "Generating", tone: status === "clarification" ? "warning" : "accent" }
    : status === "failed"
      ? { label: "Last run failed", tone: "danger" }
      : result
        ? { label: "Generated", tone: "success" }
        : { label: "Not generated", tone: "neutral" };

  return (
    <PanelSection title="Generation">
      <div className="mb-2.5">
        <p className="mb-1.5 text-xs text-fg-subtle">Output format</p>
        <SegmentedControl<OutputSelection>
          label="Output format"
          fullWidth
          size="sm"
          value={outputs}
          onChange={setOutputs}
          options={[
            { value: "step", label: "STEP", disabled: running },
            { value: "stl", label: "STL", disabled: running },
            { value: "both", label: "Both", disabled: running },
          ]}
        />
      </div>
      <PropertyRow label="Input" title={drawing?.fileName} muted={!drawing}>
        {drawing?.fileName ?? "No drawing"}
      </PropertyRow>
      <PropertyRow label="Detected units" muted={!result}>
        {result ? (result.units === "mm" ? "Millimeters (mm)" : "Inches (in)") : "During generation"}
      </PropertyRow>
      <div className="flex min-h-[24px] items-center justify-between gap-3 text-sm">
        <span className="text-fg-subtle">Geometry</span>
        <Badge tone={geometry.tone} dot>
          {geometry.label}
        </Badge>
      </div>
      <div className="flex min-h-[24px] items-center justify-between gap-3 text-sm">
        <span className="text-fg-subtle">Anthropic API</span>
        {credLoading && !cred ? (
          <span className="text-fg-subtle">Checking…</span>
        ) : cred?.configured ? (
          <span className="flex items-center gap-1 text-fg">
            <KeyRound size={12} className="text-success" />
            <span className="font-mono text-xs">••••{cred.hint}</span>
          </span>
        ) : (
          <button type="button" onClick={() => navigate("settings", "ai")} className="text-sm font-medium text-accent hover:underline">
            Add API key
          </button>
        )}
      </div>
      {!online && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-danger-soft px-2.5 py-2 text-xs text-danger">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          No internet connection. Generation needs the Anthropic API.
        </div>
      )}
      {services.generation.backend === "mock" && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-2 text-xs text-warning">
          <Info size={13} className="mt-px shrink-0" />
          <span>
            Mock backend active. Generation returns a bundled sample model, not a model of your drawing.
          </span>
        </div>
      )}
    </PanelSection>
  );
}

// -------------------------------------------------------------------- model

function round(v: number) {
  return Math.round(v * 10) / 10;
}

export function ModelInfoSection({ result }: { result: GenerationResult }) {
  const featureCount = result.features.reduce((n, f) => n + f.count, 0);
  const u = result.units;
  return (
    <PanelSection title="Model">
      <PropertyRow label="Name" title={result.modelName}>
        {result.modelName}
      </PropertyRow>
      <PropertyRow label="Source" title={result.sourceFileName}>
        {result.sourceFileName}
      </PropertyRow>
      <PropertyRow label="Generated">{formatDateTime(result.generatedAt)}</PropertyRow>
      <PropertyRow label="Units">{u === "mm" ? "Millimeters" : "Inches"}</PropertyRow>
      <div className="my-2 grid grid-cols-3 gap-1.5">
        {(
          [
            ["Length", result.dimensions.length, "X"],
            ["Width", result.dimensions.width, "Y"],
            ["Height", result.dimensions.height, "Z"],
          ] as const
        ).map(([label, value, axis]) => (
          <div key={label} className="rounded-md bg-sunken/70 px-2 py-1.5 ring-1 ring-line">
            <p className="flex items-center justify-between text-2xs text-fg-subtle">
              {label}
              <span className="font-mono text-fg-faint">{axis}</span>
            </p>
            <p className="tabular font-mono text-sm text-fg">
              {round(value)}
              <span className="ml-0.5 text-xs text-fg-subtle">{u}</span>
            </p>
          </div>
        ))}
      </div>
      <PropertyRow label="Solids">{result.solidCount}</PropertyRow>
      <PropertyRow label="Features">{featureCount}</PropertyRow>
      {result.drawingType && (
        <PropertyRow label="Drawing type" title={result.drawingType}>
          {result.drawingType}
        </PropertyRow>
      )}
      {result.usage && <UsageRows usage={result.usage} />}
      {result.backend === "mock" && (
        <p className="mt-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">Sample data from the mock backend.</p>
      )}
    </PanelSection>
  );
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : String(n);
}

function UsageRows({ usage }: { usage: GenerationUsage }) {
  const served = usage.servedBy.filter((m) => m !== usage.model);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <PropertyRow label="Claude model" mono title={served.length ? `Fallback served by ${served.join(", ")}` : undefined}>
        {usage.model}
        {served.length > 0 && " (fallback)"}
      </PropertyRow>
      <PropertyRow label="Requests">{usage.requests}</PropertyRow>
      <PropertyRow label="Tokens" mono title="Uncached input · cached input read · output (including thinking)">
        {tokens(usage.inputTokens)} in · {tokens(usage.cacheReadTokens)} cached · {tokens(usage.outputTokens)} out
      </PropertyRow>
    </div>
  );
}

const CHECK_ICON: Record<CheckResult["status"], ReactNode> = {
  pass: <CheckCircle2 size={14} className="text-success" />,
  warn: <AlertTriangle size={14} className="text-warning" />,
  fail: <XCircle size={14} className="text-danger" />,
  not_applicable: <MinusCircle size={14} className="text-fg-faint" />,
};

const CHECK_LABEL: Record<CheckResult["status"], string> = {
  pass: "Passed",
  warn: "Warning",
  fail: "Failed",
  not_applicable: "Not applicable",
};

function CheckRow({ label, check }: { label: string; check: CheckResult }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-[3px] shrink-0">{CHECK_ICON[check.status]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-fg">{label}</span>
          <span
            className={cn(
              "text-xs",
              check.status === "pass" && "text-success",
              check.status === "warn" && "text-warning",
              check.status === "fail" && "text-danger",
              check.status === "not_applicable" && "text-fg-subtle",
            )}
          >
            {CHECK_LABEL[check.status]}
          </span>
        </div>
        {check.detail && <p className="text-xs text-fg-subtle">{check.detail}</p>}
      </div>
    </div>
  );
}

export function ValidationSection({ result }: { result: GenerationResult }) {
  const v = result.validation;
  return (
    <PanelSection title="Geometry validation">
      <CheckRow label="Solid validity" check={v.solidValid} />
      <CheckRow label="Watertight" check={v.watertight} />
      <CheckRow label="Dimension consistency" check={v.dimensionConsistency} />
      <CheckRow label="Export validation" check={v.exportValidation} />
      {result.warnings.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-warning/25 bg-warning-soft/50 px-2.5 py-2">
          <p className="text-xs font-medium text-warning">
            {result.warnings.length} {result.warnings.length === 1 ? "warning" : "warnings"}
          </p>
          {result.warnings.map((w) => (
            <p key={w.code + w.message} className="text-xs text-fg-muted">
              {w.message}
            </p>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

const FEATURE_ICON: Record<FeatureKind, ReactNode> = {
  hole: <CircleDot size={14} />,
  slot: <RectangleHorizontal size={14} />,
  cylinder: <Cylinder size={14} />,
  extrusion: <Box size={14} />,
  fillet: <SquareRoundCorner size={14} />,
  chamfer: <Triangle size={13} />,
  cutout: <Scissors size={14} />,
  pocket: <Scissors size={14} />,
  other: <Shapes size={14} />,
};

function FeatureRow({ feature }: { feature: DetectedFeature }) {
  return (
    <div className="flex h-7 items-center gap-2 rounded-md px-1.5 hover:bg-hover">
      <span className="text-fg-subtle">{FEATURE_ICON[feature.kind]}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{feature.label}</span>
      {feature.inferred && (
        <Tooltip content="Dimension inferred rather than read from the drawing">
          <span className="rounded-xs bg-warning-soft px-1 text-2xs font-medium text-warning">Inferred</span>
        </Tooltip>
      )}
      {feature.parameters && <span className="truncate font-mono text-xs text-fg-subtle">{feature.parameters}</span>}
      <span className="tabular w-6 shrink-0 text-right text-xs text-fg-muted">×{feature.count}</span>
    </div>
  );
}

export function FeaturesSection({ result }: { result: GenerationResult }) {
  const total = result.features.reduce((n, f) => n + f.count, 0);
  return (
    <PanelSection title="Detected features" aside={<span className="tabular text-xs text-fg-subtle">{total}</span>}>
      {result.features.length === 0 ? (
        <p className="text-sm text-fg-subtle">No features were reported.</p>
      ) : (
        <div className="-mx-1.5">
          {result.features.map((f) => (
            <FeatureRow key={f.id} feature={f} />
          ))}
        </div>
      )}
    </PanelSection>
  );
}

export function ExportSection({ result }: { result: GenerationResult }) {
  const busy = useExportStore((s) => s.busy);
  const exportOne = useExportStore((s) => s.exportOne);
  return (
    <PanelSection title="Export">
      <div className="flex flex-col gap-2">
        {(["step", "stl"] as const).map((format) => (
          <ExportCard
            key={format}
            format={format}
            artifact={result.artifacts.find((a) => a.format === format)}
            busy={busy === format}
            disabled={busy !== null}
            onExport={() => void exportOne(format)}
          />
        ))}
      </div>
    </PanelSection>
  );
}
