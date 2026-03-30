import { Heart, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { apiDelete, apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { useAuth } from '../useAuth'

type MessageAuthor = {
  id: string
  firstName: string | null
  lastName: string | null
  role: 'DIRECTION' | 'COACH' | 'PLAYER' | 'PARENT'
}

type TeamMessage = {
  id: string
  teamId: string
  clubId: string
  content: string
  createdAt: string
  updatedAt: string
  author: MessageAuthor | null
  likesCount: number
  likedByMe: boolean
}

type TeamMessagesResponse = {
  items: TeamMessage[]
  pagination: { limit: number; offset: number; returned: number }
}

export default function MessagesPage() {
  const { me } = useAuth()
  const canPost = me?.role === 'DIRECTION' || me?.role === 'COACH'
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<TeamMessage[]>([])
  const [likePendingIds, setLikePendingIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiGet<TeamMessagesResponse>(apiRoutes.teamMessages.list)
      setItems(payload.items)
      window.dispatchEvent(new CustomEvent('izifoot:messages-unread-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les messages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const orderedItems = useMemo(
    () => items.slice().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [items],
  )

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPost) return
    const content = draft.trim()
    if (!content) return

    setSending(true)
    setError(null)
    try {
      const created = await apiPost<TeamMessage>(apiRoutes.teamMessages.list, { content })
      setItems((prev) => [created, ...prev])
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d\'envoyer le message')
    } finally {
      setSending(false)
    }
  }

  async function toggleLike(message: TeamMessage) {
    if (likePendingIds.has(message.id)) return
    setLikePendingIds((prev) => new Set(prev).add(message.id))

    try {
      const response = message.likedByMe
        ? await apiDelete<{ ok: true; likesCount: number; likedByMe: boolean }>(apiRoutes.teamMessages.like(message.id))
        : await apiPost<{ ok: true; likesCount: number; likedByMe: boolean }>(apiRoutes.teamMessages.like(message.id), {})

      setItems((prev) => prev.map((item) => (
        item.id === message.id
          ? { ...item, likesCount: response.likesCount, likedByMe: response.likedByMe }
          : item
      )))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de mettre à jour la réaction')
    } finally {
      setLikePendingIds((prev) => {
        const next = new Set(prev)
        next.delete(message.id)
        return next
      })
    }
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Messagerie équipe</h1>
        <p style={{ margin: '6px 0 0', color: '#475569' }}>
          Canal officiel coach/direction vers joueurs et parents.
        </p>
      </header>

      {canPost && (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Écrire un message à toute l'équipe..."
            maxLength={2000}
            rows={4}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              padding: 12,
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: 15,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small style={{ color: '#64748b' }}>{draft.length}/2000</small>
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="players-primary-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
              Envoyer
            </button>
          </div>
        </form>
      )}

      {error && (
        <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: 10 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Chargement des messages...
        </div>
      ) : orderedItems.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 18, color: '#64748b' }}>
          Aucun message pour le moment.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {orderedItems.map((message) => {
            const authorName = [message.author?.firstName, message.author?.lastName].filter(Boolean).join(' ').trim() || 'Staff'
            const createdAt = new Date(message.createdAt)
            const likePending = likePendingIds.has(message.id)
            return (
              <article key={message.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <strong style={{ color: '#0f172a' }}>{authorName}</strong>
                  <small style={{ color: '#64748b' }}>{createdAt.toLocaleString('fr-FR')}</small>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#1e293b' }}>{message.content}</p>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { void toggleLike(message) }}
                    disabled={likePending}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 999,
                      padding: '5px 10px',
                      background: message.likedByMe ? '#ffe4e6' : '#fff',
                      color: message.likedByMe ? '#be123c' : '#334155',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: likePending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Heart size={14} fill={message.likedByMe ? 'currentColor' : 'none'} />
                    {message.likesCount}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
