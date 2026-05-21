'use client';

import dynamic from 'next/dynamic';
import { Loader2, Sparkles } from 'lucide-react';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const LANG_MAP: Record<string, string> = {
  python: 'python', c: 'c', cpp: 'cpp', javascript: 'javascript',
  php: 'php', java: 'java', assembly: 'asm',
};

const MONACO_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '7C9AE8' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type', foreground: '5BC0BE' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'operator', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#08080C88',
    'editor.foreground': '#d4d4d4',
    'editor.lineHighlightBackground': '#ffffff08',
    'editor.selectionBackground': '#264f7855',
    'editor.inactiveSelectionBackground': '#3a3d4155',
    'editorCursor.foreground': '#a5b4fc',
    'editorLineNumber.foreground': '#ffffff22',
    'editorLineNumber.activeForeground': '#ffffff55',
    'editor.selectionHighlightBackground': '#add6ff16',
    'editorBracketMatch.background': '#0d111700',
    'editorBracketMatch.border': '#ffffff22',
    'editorWidget.background': '#0d1117CC',
    'editorWidget.border': '#ffffff11',
    'editorGutter.background': 'transparent',
    'editorOverviewRuler.background': 'transparent',
  },
};

export default function Editor({
  language,
  code,
  onChange,
  editorRef,
}: {
  language: string;
  code: string;
  onChange: (val: string) => void;
  editorRef?: React.MutableRefObject<any>;
}) {
  return (
    <MonacoEditor
      height="100%"
      language={LANG_MAP[language] || 'plaintext'}
      value={code}
      onChange={(val) => onChange(val || '')}
      loading={
        <div className="h-full flex items-center justify-center bg-transparent">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            <span className="text-xs text-white/20">Loading editor...</span>
          </div>
        </div>
      }
      theme="codeforge-glass"
      beforeMount={(monaco) => {
        monaco.editor.defineTheme('codeforge-glass', MONACO_THEME);
      }}
      onMount={(editor) => {
        if (editorRef) editorRef.current = editor;
      }}
      options={{
        fontSize: 13.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 16 },
        bracketPairColorization: { enabled: true },
        wordWrap: 'on',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4, alwaysConsumeMouseWheel: false },
        lineHeight: 22,
        letterSpacing: 0.1,
        fontLigatures: true,
        suggest: { showWords: false },
        folding: true,
        foldingHighlight: true,
        guides: { indentation: true },
      }}
    />
  );
}
