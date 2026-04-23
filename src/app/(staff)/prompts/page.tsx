import { loadPrompts } from '@/lib/prompts'
import { PromptLibrary } from '@/components/prompts/PromptLibrary'

export default function PromptsPage() {
  const prompts = loadPrompts()
  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Prompt library</h1>
        <p className="mt-1 text-sm text-ink-2">
          Copy a prompt into your own Claude chat. Paste the structured output back here; the
          validator checks the JSON matches the schema before you paste into the form.
        </p>
      </div>
      <PromptLibrary prompts={prompts} />
    </div>
  )
}
