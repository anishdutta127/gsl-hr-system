'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  ariaLabel?: string
  placeholder?: string
}

/** Rich text editor used for role JDs. Output is HTML; sanitise on render with
 * DOMPurify before injecting into the public careers page. */
export function RichTextEditor({ value, onChange, ariaLabel = 'Rich text editor' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class:
          'prose prose-sm max-w-none min-h-[200px] focus:outline-none px-3 py-2 text-base text-ink',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Keep editor in sync if parent resets value (e.g. form reset).
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== value && (value || '<p></p>') !== editor.getHTML()) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) {
    return (
      <div
        className="block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink-3"
        aria-busy="true"
      >
        Loading editor…
      </div>
    )
  }

  function promptLink() {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    // No `overflow-hidden`: it would clip the sticky toolbar inside the
    // editor's bounding box. Sticky needs a non-overflow-hidden chain up to
    // the scroll container (the modal in RoleDescriptionEdit, or the page
    // in NewRoleForm). Rounded corners still look fine because the toolbar
    // and EditorContent paint flush to the border.
    <div className="rounded border border-line-strong bg-card focus-within:border-teal focus-within:ring-2 focus-within:ring-teal">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t border-b border-line bg-surface px-2 py-1.5"
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          label="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          label="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          label="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive('highlight')}
          label="Highlight"
        >
          <span className="bg-yellow-200 px-1">H</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          label="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          label="Heading 3"
        >
          H3
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          label="Bulleted list"
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          label="Numbered list"
        >
          1. List
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={promptLink} isActive={editor.isActive('link')} label="Link">
          Link
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          isActive={false}
          label="Clear formatting"
        >
          Clear
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  onClick,
  isActive,
  label,
  children,
}: {
  onClick: () => void
  isActive: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      className={
        isActive
          ? 'inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded bg-navy px-2 py-1 text-sm font-medium text-white'
          : 'inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded border border-line-strong bg-card px-2 py-1 text-sm text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'
      }
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
}
