import { Extension } from '@tiptap/core'
import { TextStyle } from '@tiptap/extension-text-style'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphProps: {
      setSpaceBefore: (value: string | null) => ReturnType
      setSpaceAfter: (value: string | null) => ReturnType
      setFirstLineIndent: (value: string | null) => ReturnType
    }
    letterSpacing: {
      setLetterSpacing: (value: string) => ReturnType
      unsetLetterSpacing: () => ReturnType
    }
  }
}

/** 段落の「前の間隔」「後の間隔」「字下げ」を paragraph / heading に持たせる拡張 */
export const ParagraphProps = Extension.create({
  name: 'paragraphProps',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          spaceBefore: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.marginTop || null,
            renderHTML: (attributes: { spaceBefore?: string | null }) =>
              attributes.spaceBefore ? { style: `margin-top: ${attributes.spaceBefore}` } : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.marginBottom || null,
            renderHTML: (attributes: { spaceAfter?: string | null }) =>
              attributes.spaceAfter ? { style: `margin-bottom: ${attributes.spaceAfter}` } : {},
          },
          firstLineIndent: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.textIndent || null,
            renderHTML: (attributes: { firstLineIndent?: string | null }) =>
              attributes.firstLineIndent ? { style: `text-indent: ${attributes.firstLineIndent}` } : {},
          },
        },
      },
    ]
  },
  addCommands() {
    const setForBoth = (attr: string, value: string | null) =>
      ({ commands }: { commands: { updateAttributes: (type: string, attrs: Record<string, unknown>) => boolean } }) =>
        commands.updateAttributes('paragraph', { [attr]: value }) ||
        commands.updateAttributes('heading', { [attr]: value })
    return {
      setSpaceBefore: (value) => ({ commands }) => setForBoth('spaceBefore', value)({ commands }),
      setSpaceAfter: (value) => ({ commands }) => setForBoth('spaceAfter', value)({ commands }),
      setFirstLineIndent: (value) => ({ commands }) => setForBoth('firstLineIndent', value)({ commands }),
    }
  },
})

/** textStyle マークに文字間隔（letter-spacing）を追加したもの */
export const TextStyleWithSpacing = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      letterSpacing: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.letterSpacing || null,
        renderHTML: (attributes: { letterSpacing?: string | null }) =>
          attributes.letterSpacing ? { style: `letter-spacing: ${attributes.letterSpacing}` } : {},
      },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setLetterSpacing:
        (value: string) =>
        ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
          chain().setMark('textStyle', { letterSpacing: value }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
          chain().setMark('textStyle', { letterSpacing: null }).run(),
    }
  },
})
