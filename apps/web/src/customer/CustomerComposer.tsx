import { T, useGT } from "gt-react";
import { useState } from "react";

/** The one place a customer types: plain text, Enter to send. */
export function CustomerComposer(props: {
  onSend: (text: string) => Promise<boolean>;
  working: boolean;
  onStop: () => void;
  /** An operator writing into a customer's conversation. */
  asFrontDesk?: boolean;
}) {
  const gt = useGT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canSend = text.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSend) return;
    const sent = text;
    setBusy(true);
    setText("");
    void props.onSend(sent).then((ok) => {
      setBusy(false);
      // A failed send gives the words back, unless the customer has already typed on.
      if (!ok) setText((current) => (current === "" ? sent : current));
    });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-card py-3.5 pr-3.5 pb-2.5 pl-4.5 shadow-(--customer-shadow-card)">
      {props.asFrontDesk ? (
        <span className="self-start rounded-xl bg-primary px-2.5 text-(length:--customer-note) text-primary-foreground">
          <T>Reply as the front desk</T>
        </span>
      ) : null}
      <textarea
        value={text}
        rows={1}
        aria-label={gt("Message", { $context: "label of the box where a message is typed" })}
        placeholder={
          props.asFrontDesk
            ? gt("The customer sees this in their conversation")
            : props.working
              ? gt("Add anything that comes to mind, no need to wait")
              : gt("Say what's off, or what you'd like added")
        }
        className="field-sizing-content max-h-40 w-full resize-none bg-transparent outline-none placeholder:text-(--placeholder)"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter also confirms an input-method candidate; that one is not a send.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          submit();
        }}
      />
      <div className="flex items-center gap-2">
        {props.asFrontDesk ? (
          <span className="min-w-0 flex-1 text-xs text-(--placeholder)">
            <T>
              It goes into the conversation like the customer's own messages, and the assistant
              answers it.
            </T>
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {props.working ? (
          <button
            type="button"
            className="cursor-pointer rounded-full border border-border px-3 py-0.75 text-(length:--customer-note) text-muted-foreground hover:bg-muted"
            onClick={props.onStop}
          >
            <T context="button: stop the work in progress">Stop</T>
          </button>
        ) : null}
        <button
          type="button"
          aria-label={gt("Send", { $context: "button: send the typed message" })}
          disabled={!canSend}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-default disabled:opacity-40"
          onClick={submit}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M8 12.5v-9M4 7.5l4-4 4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
