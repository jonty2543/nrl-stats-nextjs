"use client";

import { useEffect, useMemo, useState } from "react";

const FEEDBACK_LAST_SHOWN_KEY = "nrl-feedback-last-shown-v1";
const FEEDBACK_SUBMITTED_KEY = "nrl-feedback-submitted-v1";
const FEEDBACK_DISMISSED_KEY = "nrl-feedback-dismissed-v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SUBMITTED_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
const INTEREST_OPTIONS = ["Fantasy", "Draft", "Betting", "Lineups", "Stats"] as const;
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

type FeedbackInterest = (typeof INTEREST_OPTIONS)[number];
type SubmitState = "idle" | "submitting" | "submitted" | "error";

function readStoredTime(key: string): number {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(key) || 0);
  return Number.isFinite(value) ? value : 0;
}

function shouldForceFeedbackPrompt(): boolean {
  if (typeof window === "undefined") return false;
  return LOCALHOST_NAMES.has(window.location.hostname.toLowerCase()) || window.location.search.includes("feedback=1");
}

export function FeedbackPrompt() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [interest, setInterest] = useState<FeedbackInterest | null>(null);
  const [changeRequest, setChangeRequest] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = rating > 0 && interest !== null && submitState !== "submitting";
  const starButtons = useMemo(() => [1, 2, 3, 4, 5], []);

  useEffect(() => {
    if (shouldForceFeedbackPrompt()) {
      setOpen(true);
      return;
    }

    const now = Date.now();
    const submittedAt = readStoredTime(FEEDBACK_SUBMITTED_KEY);
    if (submittedAt && now - submittedAt < SUBMITTED_COOLDOWN_MS) return;

    const dismissedAt = readStoredTime(FEEDBACK_DISMISSED_KEY);
    const lastShownAt = readStoredTime(FEEDBACK_LAST_SHOWN_KEY);
    if (dismissedAt && now - dismissedAt < WEEK_MS) return;
    if (lastShownAt && now - lastShownAt < WEEK_MS) return;

    const delayMs = 60_000 + Math.random() * 90_000;
    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(FEEDBACK_LAST_SHOWN_KEY, String(Date.now()));
      setOpen(true);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const closePrompt = () => {
    window.localStorage.setItem(FEEDBACK_DISMISSED_KEY, String(Date.now()));
    setOpen(false);
  };

  const submitFeedback = async () => {
    if (!canSubmit) return;

    setSubmitState("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          interest,
          changeRequest: changeRequest.trim(),
          path: window.location.pathname,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Failed to submit feedback");
      }

      window.localStorage.setItem(FEEDBACK_SUBMITTED_KEY, String(Date.now()));
      setSubmitState("submitted");
      window.setTimeout(() => setOpen(false), 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit feedback");
      setSubmitState("error");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] grid place-items-end bg-black/45 px-3 py-4 sm:place-items-center sm:px-4">
      <div
        className="w-full max-w-md rounded-xl border border-nrl-border bg-[#10162f] p-4 text-nrl-text shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-prompt-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              Feedback
            </div>
            <h2 id="feedback-prompt-title" className="mt-1 text-base font-bold text-white">Help improve Short Side</h2>
          </div>
          <button
            type="button"
            onClick={closePrompt}
            aria-label="Close feedback"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md border border-white/10 text-sm text-nrl-muted transition-colors hover:text-nrl-text"
          >
            x
          </button>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-nrl-muted">How useful is this site for you?</div>
          <div className="mt-2 flex gap-1.5">
            {starButtons.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                className={`grid h-9 w-9 cursor-pointer place-items-center rounded-md border text-lg transition-colors ${
                  rating >= value
                    ? "border-emerald-300/50 bg-emerald-400/12 text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-nrl-muted hover:text-nrl-text"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-nrl-muted">
            What are you most interested in using this site for?
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setInterest(option)}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                  interest === option
                    ? "border-emerald-300/50 bg-emerald-400/12 text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-nrl-muted hover:text-nrl-text"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-nrl-muted">
            What is one change that would make you use it more?
          </span>
          <textarea
            value={changeRequest}
            onChange={(event) => setChangeRequest(event.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-2 w-full resize-none rounded-md border border-white/10 bg-[#0e1530] px-3 py-2 text-sm text-nrl-text outline-none transition-colors placeholder:text-nrl-muted/70 focus:border-emerald-300/40"
            placeholder="Tell us what would make this more useful..."
          />
        </label>

        {errorMessage ? (
          <div className="mt-3 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {submitState === "submitted" ? (
          <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
            Thanks. Feedback submitted.
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={closePrompt}
            className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-nrl-muted transition-colors hover:border-white/20 hover:text-nrl-text"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={submitFeedback}
            disabled={!canSubmit}
            className="cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitState === "submitting" ? "Submitting" : "Submit feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
