'use client'

import { useState } from 'react'

type Source = { n: number; filename: string; content: string }
type CitationCheck = { citedCount: number; invalid: number[]; unused: number[] }
type AnswerResponse = { answer: string; sources: Source[]; citationCheck: CitationCheck }

const USERS = [
  { email: 'attorney1@firmly.test', name: 'Dana Reyes', role: 'Attorney' },
  { email: 'attorney2@firmly.test', name: 'James Rutter', role: 'Attorney' },
  { email: 'paralegal1@firmly.test', name: 'Jessica Ji', role: 'Paralegal' },
]

const MATTERS = [
  { code: '', name: 'All matters I can access' },
  { code: 'A', name: 'A — Coinbase arbitration' },
  { code: 'B', name: 'B — SEIU labor dispute' },
  { code: 'C', name: 'C — Ohio v. EPA regulatory' },
  { code: 'D', name: 'D — Transactional contracts' },
]

const EXAMPLES = [
  'What is the effective date of the First Amendment to the Employment Agreement?',
  "What did the Court hold about Coinbase's arbitration argument?",
  'What did the EPA argue in Ohio v. EPA?',
]

function prettyFilename(f: string) {
  const title = f
    .replace(/^matter[A-D]_\d{2}_/, '')
    .replace(/-SCANNED/i, '')
    .replace(/\.pdf$/, '')
    .replace(/-/g, ' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
}

function matterOf(f: string) {
  return f.match(/^matter([A-D])_/)?.[1] ?? null
}

export default function Home() {
  const [userEmail, setUserEmail] = useState(USERS[0].email)
  const [matterCode, setMatterCode] = useState('')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnswerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openSource, setOpenSource] = useState<number | null>(null)

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)
    setOpenSource(null)

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          userEmail,
          matterCode: matterCode || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setLoading(false)
    }
  }

  const activeUser = USERS.find((u) => u.email === userEmail)!
  const cited = new Set(
    result ? result.sources.map((s) => s.n).filter((n) => !result.citationCheck.unused.includes(n)) : [],
  )

  return (
    <div className="flex flex-col min-h-full">
      <header className="bg-[#2b2b2b] text-white">
        <div className="mx-auto max-w-4xl px-6 py-5 text-center">
          <p
            className="text-xs uppercase"
            style={{ letterSpacing: '0.22em' }}
          >
            Law Offices of Juliet Cohen, P.C.
          </p>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-[#3a3a3a] text-white">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center">
            <h1
              className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-normal leading-tight"
            >
              Firm Document Assistant
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80">
              Ask a question about the firm&apos;s documents. Every answer cites the
              source it came from, and you only ever see matters you have access to.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-6 py-10">
          <form
            onSubmit={ask}
            className="bg-surface border border-rule p-6 sm:p-8"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs uppercase text-ink-muted mb-2" style={{ letterSpacing: '0.12em' }}>
                  Signed in as
                </span>
                <select
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full border border-rule bg-white px-3 py-2.5 text-ink focus:border-accent focus:outline-none"
                >
                  {USERS.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs uppercase text-ink-muted mb-2" style={{ letterSpacing: '0.12em' }}>
                  Matter
                </span>
                <select
                  value={matterCode}
                  onChange={(e) => setMatterCode(e.target.value)}
                  className="w-full border border-rule bg-white px-3 py-2.5 text-ink focus:border-accent focus:outline-none"
                >
                  {MATTERS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="block text-xs uppercase text-ink-muted mb-2" style={{ letterSpacing: '0.12em' }}>
                Your question
              </span>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="What is the effective date of the First Amendment to the Employment Agreement?"
                className="w-full resize-y border border-rule bg-white px-3 py-2.5 text-ink placeholder:text-ink-muted/60 focus:border-accent focus:outline-none"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuestion(ex)}
                  className="border border-rule px-3 py-1.5 text-sm text-ink-muted hover:border-accent hover:text-accent"
                >
                  {ex.length > 52 ? ex.slice(0, 52) + '…' : ex}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="mt-6 bg-accent px-8 py-3 text-sm uppercase text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              style={{ letterSpacing: '0.14em' }}
            >
              {loading ? 'Searching…' : 'Ask'}
            </button>

            {loading && (
              <p className="mt-4 text-sm text-ink-muted">
                Searching your documents and drafting an answer. This runs on a local
                model and can take up to a minute.
              </p>
            )}
          </form>

          {error && (
            <div className="mt-6 border border-accent bg-white p-5">
              <p className="font-[family-name:var(--font-display)] text-lg text-accent">
                Couldn&apos;t answer that
              </p>
              <p className="mt-1 text-ink-muted">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-8">
              <div className="bg-surface border border-rule p-6 sm:p-8">
                <h2
                  className="font-[family-name:var(--font-display)] text-2xl mb-4"
                >
                  Answer
                </h2>
                <p className="whitespace-pre-wrap text-lg leading-relaxed">
                  {result.answer}
                </p>

                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-4 text-sm text-ink-muted">
                  <span>
                    Answering as <strong className="text-ink">{activeUser.name}</strong>
                  </span>
                  <span>
                    {result.sources.length} document
                    {result.sources.length === 1 ? '' : 's'} searched
                  </span>
                  <span>
                    {result.citationCheck.citedCount} cited
                    {result.citationCheck.invalid.length === 0
                      ? ', all verified real'
                      : `, ${result.citationCheck.invalid.length} invalid`}
                  </span>
                </div>
              </div>

              {result.sources.length > 0 ? (
                <div className="mt-6">
                  <h3
                    className="text-xs uppercase text-ink-muted mb-3"
                    style={{ letterSpacing: '0.14em' }}
                  >
                    Sources
                  </h3>
                  <ul className="space-y-2">
                    {result.sources.map((s) => (
                      <li key={s.n} className="bg-surface border border-rule">
                        <button
                          type="button"
                          onClick={() => setOpenSource(openSource === s.n ? null : s.n)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/[.02]"
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center text-xs ${
                              cited.has(s.n)
                                ? 'bg-accent text-white'
                                : 'border border-rule text-ink-muted'
                            }`}
                          >
                            {s.n}
                          </span>
                          <span className="flex-1 text-ink">
                            {prettyFilename(s.filename)}
                            {matterOf(s.filename) && (
                              <span className="ml-2 text-sm text-ink-muted">
                                {' · Matter '}
                                {matterOf(s.filename)}
                              </span>
                            )}
                          </span>
                          <span className="text-sm text-ink-muted">
                            {cited.has(s.n) ? 'Cited' : 'Not cited'}
                          </span>
                        </button>
                        {openSource === s.n && (
                          <div className="border-t border-rule px-4 py-4">
                            <p className="mb-2 text-xs text-ink-muted">{s.filename}</p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                              {s.content}
                            </p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-6 border border-rule bg-surface p-6">
                  <p className="text-ink-muted">
                    No documents were found that you have access to for this question.
                    If this matter is restricted for your account, nothing from it is
                    ever retrieved.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-rule bg-surface">
        <div className="mx-auto max-w-4xl px-6 py-6 text-sm text-ink-muted">
          Internal demo. Answers come only from documents this account is permitted to
          see, and every claim is checked against a real source before it is shown.
        </div>
      </footer>
    </div>
  )
}
