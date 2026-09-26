import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// CodePulse owns the diagnostics: turn off Monaco's built-in JS/TS squiggles.
const ts = monaco.typescript || monaco.languages.typescript;
for (const defaults of [ts?.javascriptDefaults, ts?.typescriptDefaults]) {
  defaults?.setDiagnosticsOptions?.({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true });
}

monaco.editor.defineTheme('codepulse', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5b6b86', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: 'a5e0a0' },
    { token: 'number', foreground: 'f5a97f' },
  ],
  colors: {
    'editor.background': '#0a0f1c',
    'editor.lineHighlightBackground': '#121a2e',
    'editorLineNumber.foreground': '#334060',
    'editorLineNumber.activeForeground': '#8ea2c8',
    'editorGutter.background': '#0a0f1c',
    'editor.selectionBackground': '#2a3b66',
    'editorIndentGuide.background1': '#161f36',
    'scrollbarSlider.background': '#1c2742aa',
  },
});

export default monaco;
