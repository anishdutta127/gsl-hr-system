'use client'

import { useMemo, useState } from 'react'
import type { Prompt } from '@/lib/types'
import { validateAgainstSchema } from '@/lib/promptValidator'

const CATEGORY_LABELS: Record<Prompt['category'], string> = {
  resume: 'Resume',
  jd: 'JD drafting',
  interview: 'Interview',
  shortlist: 'Shortlist',
  other: 'Other',
}

export function PromptLibrary({ prompts }: { prompts: Prompt[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Prompt['category'] | 'all'>('all')
  const [selected, setSelected] = useState<Prompt | null>(null)

  const categories = useMemo(() => {
    const set = new Set<Prompt['category']>()
    prompts.forEach((p) => set.add(p.category))
    return Array.from(set).sort()
  }, [prompts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prompts.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        p.useCase.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      )
    })
  }, [prompts, query, category])

  if (prompts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
        <p className="text-sm text-ink-2">
          No validated prompts yet. Prompts ship only after Shruti has run three real inputs and
          confirmed the output matches the schema.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <aside className="space-y-3">
        <div>
          <label htmlFor="prompt-search" className="sr-only">
            Search prompts
          </label>
          <input
            id="prompt-search"
            type="search"
            placeholder="Search prompts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <CategoryChip
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label="All"
          />
          {categories.map((c) => (
            <CategoryChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={CATEGORY_LABELS[c] ?? c}
            />
          ))}
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {filtered.map((p) => {
            const active = selected?.id === p.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  aria-pressed={active}
                  className={
                    active
                      ? 'block w-full px-4 py-3 text-left text-sm bg-navy-light text-navy-dark'
                      : 'block w-full px-4 py-3 text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset'
                  }
                >
                  <div className="font-medium text-ink">{p.title}</div>
                  <div className="mt-0.5 text-xs text-ink-2">{p.useCase}</div>
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-3">No prompts match.</li>
          )}
        </ul>
      </aside>
      <section>
        {selected ? (
          <PromptDetail prompt={selected} />
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-10 text-center text-sm text-ink-2">
            Pick a prompt from the list to see its body, schema, and paste-back validator.
          </div>
        )}
      </section>
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'inline-flex items-center rounded-full bg-navy px-3 py-1 text-xs font-medium text-white'
          : 'inline-flex items-center rounded-full border border-line-strong bg-card px-3 py-1 text-xs text-ink-2 hover:border-navy hover:text-navy'
      }
    >
      {label}
    </button>
  )
}

function PromptDetail({ prompt }: { prompt: Prompt }) {
  const [tab, setTab] = useState<'prompt' | 'validate'>('prompt')
  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-lg text-ink">{prompt.title}</h2>
        <p className="mt-1 text-sm text-ink-2">{prompt.useCase}</p>
      </div>
      <div className="border-b border-line px-5" role="tablist" aria-label="Prompt sections">
        <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')} label="Prompt" />
        <TabButton
          active={tab === 'validate'}
          onClick={() => setTab('validate')}
          label="Paste-back validator"
        />
      </div>
      {tab === 'prompt' ? <PromptBody prompt={prompt} /> : <PromptValidator prompt={prompt} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={
        active
          ? 'mr-6 inline-block border-b-2 border-teal py-3 text-sm font-medium text-ink'
          : 'mr-6 inline-block border-b-2 border-transparent py-3 text-sm text-ink-2 hover:text-ink'
      }
    >
      {label}
    </button>
  )
}

function PromptBody({ prompt }: { prompt: Prompt }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* no-op */
    }
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <div className="mb-1 text-xs font-medium text-ink-2">What to paste</div>
        <p className="text-xs text-ink-3">{prompt.inputHint}</p>
      </div>
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-ink-2">Prompt body</div>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-line-strong bg-card px-3 py-1 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
{prompt.body}
        </pre>
      </div>
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium text-ink-2">Expected JSON schema</div>
        <pre className="max-h-60 overflow-auto rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
{JSON.stringify(prompt.outputSchema, null, 2)}
        </pre>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Example output</div>
        <pre className="max-h-60 overflow-auto rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
{JSON.stringify(prompt.exampleOutputs[0] ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function PromptValidator({ prompt }: { prompt: Prompt }) {
  const [raw, setRaw] = useState('')
  const [result, setResult] = useState<ReturnType<typeof validateAgainstSchema> | null>(null)

  function check() {
    if (!raw.trim()) {
      setResult({ valid: false, errors: ['Paste JSON output here first.'] })
      return
    }
    setResult(validateAgainstSchema(raw, prompt))
  }

  return (
    <div className="p-5">
      <label htmlFor="pasteback" className="mb-2 block text-xs font-medium text-ink-2">
        Paste Claude's JSON output
      </label>
      <textarea
        id="pasteback"
        rows={10}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='{"name": "...", "email": "...", ...}'
        className="block w-full rounded border border-line-strong bg-card px-3 py-2 font-mono text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={check}
          className="inline-flex items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          Validate
        </button>
        {result && result.valid && (
          <span className="text-sm text-success">All required keys present and typed correctly.</span>
        )}
      </div>
      {result && !result.valid && (
        <div
          role="alert"
          className="mt-4 rounded border border-danger bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          <div className="font-medium">Not valid yet. Fix these:</div>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result && result.valid && result.parsed && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-ink-2">Parsed output</div>
          <pre className="max-h-60 overflow-auto rounded border border-line bg-surface p-3 font-mono text-xs text-ink">
{JSON.stringify(result.parsed, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
