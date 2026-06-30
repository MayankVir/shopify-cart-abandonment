"use client";

import { Loader2 } from "lucide-react";
import type { TtaiSessionDetails } from "@/lib/ttai";
import {
  formatTtaiPayload,
  getTtaiAnalysisWaitMessage,
  getTtaiEventPayload,
  hasAnalyzedAndExtractedEvents,
  isTtaiWebhookStore,
  validateLinkedEvents,
  type TtaiWebhookEventName,
} from "@/lib/ttai-webhook";

function TextBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function SessionDetailsBlock({ session }: { session: TtaiSessionDetails }) {
  const evaluation = session.evaluation_results;
  const improvement = session.improvement_results;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Session details (TTAI API)
        </p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {session.scenario_name ? (
            <p>
              <span className="text-muted-foreground">Scenario: </span>
              {session.scenario_name}
            </p>
          ) : null}
          {session.status ? (
            <p>
              <span className="text-muted-foreground">Status: </span>
              {session.status}
            </p>
          ) : null}
          {session.duration_minutes != null ? (
            <p>
              <span className="text-muted-foreground">Duration: </span>
              {session.duration_minutes.toFixed(1)} min
            </p>
          ) : session.duration != null ? (
            <p>
              <span className="text-muted-foreground">Duration: </span>
              {Math.round(session.duration)} sec
            </p>
          ) : null}
          {session.completed_at ? (
            <p>
              <span className="text-muted-foreground">Completed: </span>
              {new Date(session.completed_at).toLocaleString()}
            </p>
          ) : null}
        </div>
        {session.transcript_url ? (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Transcript: </span>
            <a
              href={session.transcript_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline break-all"
            >
              {session.transcript_url}
            </a>
          </p>
        ) : null}
      </div>

      {evaluation ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evaluation
          </p>
          {evaluation.overall_score ? (
            <p className="text-sm font-medium">{evaluation.overall_score}</p>
          ) : evaluation.final_score != null ? (
            <p className="text-sm font-medium">{evaluation.final_score}/10</p>
          ) : null}
          {evaluation.detailed_feedback ? (
            <TextBlock title="Feedback">{evaluation.detailed_feedback}</TextBlock>
          ) : null}
          {evaluation.strengths ? (
            <TextBlock title="Strengths">{evaluation.strengths}</TextBlock>
          ) : null}
          {evaluation.weaknesses ? (
            <TextBlock title="Weaknesses">{evaluation.weaknesses}</TextBlock>
          ) : null}
          {evaluation.report_card && evaluation.report_card.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Report card
              </p>
              <ul className="space-y-2">
                {evaluation.report_card.map((item) => (
                  <li
                    key={item.topic}
                    className="rounded border border-border/50 bg-background/50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {item.topic}
                      {item.score_str ? ` · ${item.score_str}` : item.score != null ? ` · ${item.score}/10` : ""}
                    </p>
                    {item.note ? (
                      <p className="mt-1 text-muted-foreground">{item.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {improvement ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Improvement
          </p>
          {improvement.improvement_areas ? (
            <TextBlock title="Areas">{improvement.improvement_areas}</TextBlock>
          ) : null}
          {improvement.action_items ? (
            <TextBlock title="Action items">{improvement.action_items}</TextBlock>
          ) : null}
          {improvement.resources ? (
            <TextBlock title="Resources">{improvement.resources}</TextBlock>
          ) : null}
        </div>
      ) : null}

      {session.user_metadata &&
      Object.keys(session.user_metadata).length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <PayloadBlock
            title="User metadata"
            payload={session.user_metadata}
            emptyMessage=""
          />
        </div>
      ) : null}
    </div>
  );
}

function PayloadBlock({
  title,
  payload,
  emptyMessage,
}: {
  title: string;
  payload: unknown;
  emptyMessage: string;
}) {
  const hasPayload =
    payload != null &&
    (typeof payload === "string"
      ? payload.trim().length > 0
      : Object.keys(payload as object).length > 0);

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {hasPayload ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
          {formatTtaiPayload(payload)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

export function TtaiCallDetails({
  transcript,
  aiSummary,
  toolCallsJson,
}: {
  transcript: string | null | undefined;
  aiSummary: string | null | undefined;
  toolCallsJson: unknown;
}) {
  const store = isTtaiWebhookStore(toolCallsJson) ? toolCallsJson : null;
  const completed = getTtaiEventPayload(store, "session.completed");
  const analyzed = getTtaiEventPayload(store, "session.analyzed");
  const extracted = getTtaiEventPayload(store, "session.extracted");
  const terminated = getTtaiEventPayload(store, "session.terminated");

  const receivedEvents = store
    ? (Object.keys(store.events) as TtaiWebhookEventName[])
    : [];
  const linkCheck = store ? validateLinkedEvents(store) : null;
  const sessionDetails = store?.sessionDetails;
  const hasBothEvents = store ? hasAnalyzedAndExtractedEvents(store) : false;
  const analysisReady = Boolean(sessionDetails);
  const waitMessage = getTtaiAnalysisWaitMessage(store);
  const displayTranscript = analysisReady
    ? transcript?.trim() || aiSummary?.trim() || undefined
    : undefined;

  if (!store && toolCallsJson == null) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <p className="font-medium">Waiting for TTAI to generate analysis</p>
        <p className="mt-1 text-xs opacity-90">
          Waiting for session.analyzed and session.extracted webhooks from TTAI.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {store && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Linked call: </span>
            session{" "}
            <span className="font-mono">
              {linkCheck?.sessionId ?? store.sessionId ?? "—"}
            </span>
            {linkCheck?.callId || store.callId ? (
              <>
                {" "}
                · call{" "}
                <span className="font-mono">
                  {linkCheck?.callId ?? store.callId}
                </span>
              </>
            ) : null}
          </p>
          {hasBothEvents && linkCheck?.ok && (
            <p className="mt-1 text-green-600 dark:text-green-400">
              session.analyzed and session.extracted are linked to the same call.
            </p>
          )}
          {linkCheck && !linkCheck.ok && (
            <p className="mt-1 text-destructive">
              Mismatched session/call ids across events:{" "}
              {linkCheck.sessionIds.join(", ") || linkCheck.callIds.join(", ")}
            </p>
          )}
        </div>
      )}

      {!analysisReady && (
        <div
          className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
            store?.sessionDetailsError
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {!store?.sessionDetailsError && hasBothEvents && linkCheck?.ok ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : null}
          <div>
            <p className="font-medium">
              {store?.sessionDetailsError
                ? "Could not load analysis from TTAI"
                : "Waiting for TTAI to generate analysis"}
            </p>
            <p className="mt-1 text-xs opacity-90">{waitMessage}</p>
            {store && receivedEvents.length > 0 && (
              <p className="mt-2 text-xs opacity-75">
                Events received: {receivedEvents.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {sessionDetails ? <SessionDetailsBlock session={sessionDetails} /> : null}

      {analysisReady && (
        <PayloadBlock
          title="Transcript / summary"
          payload={displayTranscript}
          emptyMessage="No transcript in session details."
        />
      )}

      {Boolean(analyzed || extracted || completed || terminated) && (
        <details className="rounded-md border border-border/60 bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Raw TTAI webhook payloads
          </summary>
          <div className="mt-3 space-y-3">
            <PayloadBlock
              title="session.analyzed"
              payload={analyzed}
              emptyMessage={
                receivedEvents.includes("session.analyzed")
                  ? "Event received but payload was empty."
                  : "Not received yet."
              }
            />
            <PayloadBlock
              title="session.extracted"
              payload={extracted}
              emptyMessage={
                receivedEvents.includes("session.extracted")
                  ? "Event received but payload was empty."
                  : "Not received yet."
              }
            />
            {completed ? (
              <PayloadBlock
                title="session.completed"
                payload={completed}
                emptyMessage=""
              />
            ) : null}
            {terminated ? (
              <PayloadBlock
                title="session.terminated"
                payload={terminated}
                emptyMessage=""
              />
            ) : null}
          </div>
        </details>
      )}

      {!store && toolCallsJson != null && (
        <PayloadBlock
          title="Raw webhook data (legacy)"
          payload={toolCallsJson}
          emptyMessage="No webhook payload stored."
        />
      )}

      {store && analysisReady && (
        <p className="text-xs text-muted-foreground">
          TTAI events received:{" "}
          {receivedEvents.length > 0 ? receivedEvents.join(", ") : "none yet"}
          {store.lastEvent ? ` · last: ${store.lastEvent}` : ""}
          {store.sessionDetailsFetchedAt
            ? ` · session API: ${new Date(store.sessionDetailsFetchedAt).toLocaleString()}`
            : ""}
        </p>
      )}
    </div>
  );
}
