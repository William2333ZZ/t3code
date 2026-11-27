import type { ScopedThreadRef } from "@t3tools/contracts";
import { T } from "gt-react";
import { useEffect, useRef, type ReactNode } from "react";

import ChatMarkdown from "../components/ChatMarkdown";
import { observeResize } from "../lib/observeResize";
import { useAssistantMessageText } from "../state/entities";
import { blockNonWebLinks } from "./customerLinks";
import { CustomerWorkingLine } from "./CustomerProgressCard";
import type { CustomerRow } from "./customerTimeline.logic";

const STICK_TO_END_PX = 48;

function AssistantRow(props: {
  threadRef: ScopedThreadRef;
  row: Extract<CustomerRow, { kind: "assistant" }>;
}) {
  // A streaming reply's row holds still while its text grows; the text comes from its own atom.
  const liveText = useAssistantMessageText(
    props.row.streaming ? props.threadRef : null,
    props.row.itemId,
  );
  const text = liveText ?? props.row.text;
  if (text === "") return null;
  return (
    <div onClickCapture={blockNonWebLinks}>
      <ChatMarkdown text={text} cwd={undefined} isStreaming={props.row.streaming} />
    </div>
  );
}

/** The left column's scrolling part: the conversation, then whatever the workspace adds below. */
export function CustomerConversation(props: {
  threadRef: ScopedThreadRef;
  rows: ReadonlyArray<CustomerRow>;
  /** False when a progress card already says the team is working. */
  showWorkingLine: boolean;
  workStartedAt: string | null;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickToEnd = useRef(true);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the scroll position at the end as the content grows, which streamed text does without a render here
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (scroller === null || content === null) return;
    const follow = () => {
      if (stickToEnd.current) scroller.scrollTop = scroller.scrollHeight;
    };
    follow();
    return observeResize(content, follow);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        stickToEnd.current = scrollHeight - scrollTop - clientHeight < STICK_TO_END_PX;
      }}
    >
      <div ref={contentRef} className="flex flex-col gap-3.5">
        {props.rows.map((row) => {
          switch (row.kind) {
            case "user":
              return (
                <div
                  key={row.id}
                  className="flex max-w-[320px] flex-col gap-1 self-end rounded-xl rounded-br-sm bg-primary px-3.5 py-2.5 whitespace-pre-wrap text-primary-foreground"
                >
                  {row.queued ? (
                    <span className="self-start rounded-md bg-white/15 px-2 text-xs">
                      <T>Waiting in line</T>
                    </span>
                  ) : null}
                  <span className="wrap-anywhere">{row.text}</span>
                </div>
              );
            case "assistant":
              return <AssistantRow key={row.id} threadRef={props.threadRef} row={row} />;
            case "summary":
              return (
                <div key={row.id} className="text-(length:--customer-note) text-muted-foreground">
                  {row.label}
                </div>
              );
            case "working":
              return props.showWorkingLine ? (
                <CustomerWorkingLine key={row.id} startedAt={props.workStartedAt} />
              ) : null;
          }
        })}
        {props.children}
      </div>
    </div>
  );
}
