import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { T, useGT } from "gt-react";

import { usePendingUserInputDraft } from "../components/chat/usePendingThreadRequests";
import { cn } from "../lib/utils";
import type { PendingUserInput } from "../session-logic";

/** A question the assistant is waiting on, answered by picking an option or typing one. */
export function CustomerQuestionCard(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  pendingUserInput: PendingUserInput;
  answering: boolean;
  onSelectOption: (questionId: string, optionValue: string) => void;
  onChangeCustomAnswer: (questionId: string, value: string) => void;
  onAdvance: () => void;
}) {
  const gt = useGT();
  const { activePendingProgress: progress } = usePendingUserInputDraft({
    environmentId: props.environmentId,
    activeThreadId: props.threadId,
    activePendingUserInput: props.pendingUserInput,
    supportsQuestionAttachments: false,
  });
  const question = progress?.activeQuestion;
  if (!progress || !question) return null;
  const customAnswerSelected = progress.usingCustomAnswer;
  const needsButton = question.multiSelect === true || question.allowCustomAnswer !== false;

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl bg-card px-4 py-3 shadow-(--customer-shadow-line)"
      data-testid="customer-question"
    >
      <div className="font-medium">{question.question}</div>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const value = option.value ?? option.label;
          const selected = !customAnswerSelected && progress.selectedOptionValues.includes(value);
          return (
            <button
              key={value}
              type="button"
              disabled={props.answering}
              aria-pressed={selected}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-0.75 disabled:cursor-default disabled:opacity-60",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
              onClick={() => {
                props.onSelectOption(question.id, value);
                // One choice is the whole answer, so picking it sends it.
                if (question.multiSelect !== true) props.onAdvance();
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {question.allowCustomAnswer !== false ? (
        <input
          value={progress.customAnswer}
          disabled={props.answering}
          aria-label={gt("Your own answer")}
          placeholder={gt("Or type your own answer")}
          className="rounded-sm bg-background px-3 py-1.5 outline-none placeholder:text-(--placeholder) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onChange={(event) => props.onChangeCustomAnswer(question.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (progress.canAdvance) props.onAdvance();
          }}
        />
      ) : null}
      {needsButton ? (
        <button
          type="button"
          disabled={props.answering || !progress.canAdvance}
          className="cursor-pointer self-end rounded-full bg-primary px-4 py-1 font-medium text-primary-foreground disabled:cursor-default disabled:opacity-40"
          onClick={props.onAdvance}
        >
          {progress.isLastQuestion ? <T>Send answer</T> : <T>Next question</T>}
        </button>
      ) : null}
    </div>
  );
}
