"use client";

/**
 * MDX Editor 래퍼 — SSR 방지를 위해 반드시 dynamic import로만 사용
 * import dynamic from 'next/dynamic'
 * const MarkdownEditor = dynamic(() => import('.../markdown-editor'), { ssr: false })
 */
import "@mdxeditor/editor/style.css";
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CodeToggle,
  Separator,
  InsertThematicBreak,
} from "@mdxeditor/editor";

type Props = {
  initialValue: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

export default function MarkdownEditor({
  initialValue,
  onChange,
  readOnly = false,
}: Props) {
  return (
    <MDXEditor
      markdown={initialValue}
      onChange={(md, isInitialNormalize) => {
        /* 초기 정규화 콜백은 dirty 상태 트리거 방지를 위해 무시 */
        if (!isInitialNormalize) onChange(md);
      }}
      readOnly={readOnly}
      contentEditableClassName="prose prose-sm max-w-none px-6 py-4 min-h-[400px] focus:outline-none"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: "tsx" }),
        codeMirrorPlugin({
          codeBlockLanguages: {
            tsx: "TypeScript (React)",
            ts: "TypeScript",
            js: "JavaScript",
            jsx: "JavaScript (React)",
            bash: "Bash",
            css: "CSS",
            json: "JSON",
            "": "Plain text",
          },
        }),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <Separator />
              <BoldItalicUnderlineToggles />
              <CodeToggle />
              <Separator />
              <ListsToggle />
              <Separator />
              <InsertThematicBreak />
            </>
          ),
        }),
      ]}
    />
  );
}
