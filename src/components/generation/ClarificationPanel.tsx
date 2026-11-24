import { HelpCircle, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ClarificationAnswer, ClarificationQuestion, ClarificationRequest } from "@/types/generation";
import { cn } from "@/utils/cn";

interface ClarificationPanelProps {
  request: ClarificationRequest;
  submitting: boolean;
  onSubmit: (answers: ClarificationAnswer[]) => void;
  onCancel: () => void;
}

type Draft = Record<string, { optionId?: string; value?: string }>;

function QuestionField({
  question,
  draft,
  onChange,
}: {
  question: ClarificationQuestion;
  draft: Draft[string] | undefined;
  onChange: (next: Draft[string]) => void;
}) {
  if (question.kind === "choice") {
    return (
      <div role="radiogroup" aria-label={question.prompt} className="mt-2 grid gap-1.5">
        {question.options?.map((opt) => {
          const selected = draft?.optionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ optionId: opt.id })}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                selected ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-hover",
              )}
            >
              <span
                className={cn(
                  "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-accent" : "border-fg-faint",
                )}
              >
                {selected && <span className="size-1.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{opt.label}</span>
                {opt.description && <span className="block text-xs text-fg-subtle">{opt.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  const value = draft?.value ?? "";
  const invalid = value !== "" && !(Number.isFinite(Number(value)) && Number(value) >= 0);
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input
        aria-label={question.prompt}
        inputMode="decimal"
        value={value}
        placeholder={question.suggestedValue !== undefined ? `Suggested: ${question.suggestedValue}` : "Enter a value"}
        onChange={(e) => onChange({ value: e.target.value.replace(/[^\d.]/g, "") })}
        invalid={invalid}
        mono
        wrapperClassName="w-44"
        trailing={<span className="text-xs text-fg-subtle">{question.unit ?? "mm"}</span>}
      />
      {question.suggestedValue !== undefined && value === "" && (
        <Button size="sm" variant="ghost" onClick={() => onChange({ value: String(question.suggestedValue) })}>
          Use suggestion
        </Button>
      )}
    </div>
  );
}

/** Shown when the backend pauses for ambiguous or missing dimensions. */
export function ClarificationPanel({ request, submitting, onSubmit, onCancel }: ClarificationPanelProps) {
  const [draft, setDraft] = useState<Draft>({});

  const complete = useMemo(
    () =>
      request.questions.every((q) => {
        const d = draft[q.id];
        if (q.kind === "choice") return Boolean(d?.optionId);
        return d?.value !== undefined && d.value !== "" && Number.isFinite(Number(d.value));
      }),
    [draft, request.questions],
  );

  const answers = (): ClarificationAnswer[] =>
    request.questions.map((q) => {
      const d = draft[q.id];
      return q.kind === "choice" ? { questionId: q.id, optionId: d?.optionId } : { questionId: q.id, value: Number(d?.value) };
    });

  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft/40" role="region" aria-label="Clarification required">
      <div className="flex items-start gap-2.5 border-b border-warning/20 px-4 py-3">
        <HelpCircle size={17} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <p className="text-base font-medium text-fg">Clarification needed</p>
          <p className="mt-0.5 text-sm text-fg-muted">{request.summary}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        {request.questions.map((q, i) => (
          <div key={q.id}>
            <p className="text-sm font-medium text-fg">
              <span className="tabular mr-1.5 text-fg-subtle">{i + 1}.</span>
              {q.prompt}
            </p>
            {q.context && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-subtle">
                <MapPin size={11} /> {q.context}
              </p>
            )}
            <QuestionField question={q} draft={draft[q.id]} onChange={(next) => setDraft((d) => ({ ...d, [q.id]: next }))} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-warning/20 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel generation
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onSubmit(request.questions.map((q) => ({ questionId: q.id })))}
            disabled={submitting}
          >
            Let CADify decide
          </Button>
          <Button size="sm" variant="primary" disabled={!complete} loading={submitting} onClick={() => onSubmit(answers())}>
            Continue generation
          </Button>
        </div>
      </div>
    </div>
  );
}
