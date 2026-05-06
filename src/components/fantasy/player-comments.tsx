"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { SignInButton, useAuth, useUser } from "@clerk/nextjs"

const MAX_COMMENT_LENGTH = 1000

interface FantasyPlayerComment {
  id: string
  displayName: string
  avatarUrl: string | null
  body: string
  createdAt: string
  updatedAt: string
  canDelete: boolean
}

interface PlayerCommentsProps {
  playerId: number
  playerSlug: string
  playerName: string
}

function formatCommentTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function userDisplayName(user: ReturnType<typeof useUser>["user"]): string {
  return (
    user?.username?.trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    "Shortside user"
  )
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase() || "S"
}

export function PlayerComments({ playerId, playerSlug, playerName }: PlayerCommentsProps) {
  const { isLoaded, userId } = useAuth()
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [comments, setComments] = useState<FantasyPlayerComment[]>([])
  const [commentCount, setCommentCount] = useState(0)
  const [draft, setDraft] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmedDraft = draft.trim()
  const activeDisplayName = useMemo(() => userDisplayName(user), [user])

  const loadComments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/fantasy/player-comments?playerSlug=${encodeURIComponent(playerSlug)}`)
      const payload = await response.json().catch(() => null) as {
        comments?: FantasyPlayerComment[]
        count?: number
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load comments.")
      }

      const nextComments = payload?.comments ?? []
      setComments(nextComments)
      setCommentCount(payload?.count ?? nextComments.length)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load comments.")
    } finally {
      setIsLoading(false)
    }
  }, [playerSlug])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  async function submitComment() {
    if (!trimmedDraft || trimmedDraft.length > MAX_COMMENT_LENGTH || isPosting) return

    setIsPosting(true)
    setError(null)
    try {
      const response = await fetch("/api/fantasy/player-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          playerSlug,
          playerName,
          body: trimmedDraft,
        }),
      })
      const payload = await response.json().catch(() => null) as {
        comment?: FantasyPlayerComment
        error?: string
      } | null

      if (!response.ok || !payload?.comment) {
        throw new Error(payload?.error ?? "Unable to post comment.")
      }

      setComments((current) => [payload.comment as FantasyPlayerComment, ...current])
      setCommentCount((current) => current + 1)
      setDraft("")
      setIsOpen(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to post comment.")
    } finally {
      setIsPosting(false)
    }
  }

  async function deleteComment(id: string) {
    if (deletingId) return

    setDeletingId(id)
    setError(null)
    try {
      const response = await fetch("/api/fantasy/player-comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to delete comment.")
      }

      setComments((current) => current.filter((comment) => comment.id !== id))
      setCommentCount((current) => Math.max(0, current - 1))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete comment.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 bg-nrl-panel-2 px-4 py-3 text-left transition-colors hover:bg-nrl-panel-2/80"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-nrl-accent">
            Comments ({commentCount})
          </div>
        </div>
        <span className="shrink-0 text-lg leading-none text-nrl-muted" aria-hidden="true">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="space-y-4 border-t border-nrl-border p-4">
          {isLoaded && userId ? (
            <div className="space-y-2">
              <div className="text-[11px] text-nrl-muted">Posting as {activeDisplayName}</div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                rows={3}
                className="w-full resize-y rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2 text-sm text-nrl-text outline-none transition-colors placeholder:text-nrl-muted focus:border-nrl-accent"
                placeholder="Add a comment..."
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] text-nrl-muted">
                  {trimmedDraft.length}/{MAX_COMMENT_LENGTH}
                </div>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={!trimmedDraft || trimmedDraft.length > MAX_COMMENT_LENGTH || isPosting}
                  className="rounded-md bg-nrl-accent px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-nrl-accent/90 disabled:cursor-not-allowed disabled:bg-nrl-border disabled:text-nrl-muted"
                >
                  {isPosting ? "Posting..." : "Post comment"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
              <div className="text-sm text-nrl-muted">Sign in to post a comment.</div>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-md border border-nrl-accent/40 px-3 py-1.5 text-xs font-semibold text-nrl-accent transition-colors hover:bg-nrl-accent/10"
                >
                  Sign in
                </button>
              </SignInButton>
            </div>
          )}

          {error ? (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-nrl-muted">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-nrl-muted">No comments yet.</div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-nrl-border bg-nrl-panel bg-cover bg-center text-xs font-bold text-nrl-muted"
                      style={comment.avatarUrl ? { backgroundImage: `url("${comment.avatarUrl}")` } : undefined}
                      aria-label={`${comment.displayName} profile photo`}
                    >
                      {!comment.avatarUrl ? initialsForName(comment.displayName) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div className="min-w-0">
                          <span className="truncate text-sm font-semibold text-nrl-text">{comment.displayName}</span>
                          <span className="ml-2 text-[11px] text-nrl-muted">{formatCommentTime(comment.createdAt)}</span>
                        </div>
                        {comment.canDelete ? (
                          <button
                            type="button"
                            onClick={() => void deleteComment(comment.id)}
                            disabled={deletingId === comment.id}
                            className="rounded border border-nrl-border px-2 py-1 text-[10px] font-semibold text-nrl-muted transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === comment.id ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-nrl-text">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
