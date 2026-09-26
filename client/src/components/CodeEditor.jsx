import { useEffect, useRef } from 'react';
import monaco from '../monacoSetup.js';

const MARKER_SEVERITY = {
  critical: monaco.MarkerSeverity.Error,
  high: monaco.MarkerSeverity.Error,
  medium: monaco.MarkerSeverity.Warning,
  low: monaco.MarkerSeverity.Info,
};

export default function CodeEditor({ value, language, onChange, markers, focus, changed }) {
  const hostRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const decoRef = useRef(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language,
      theme: 'codepulse',
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 13.5,
      lineHeight: 21,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: 'all',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      tabSize: 2,
      glyphMargin: true,
      fixedOverflowWidgets: true,
    });
    editorRef.current = editor;
    decoRef.current = editor.createDecorationsCollection();
    const sub = editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()));

    // Monaco measures glyph widths once. If JetBrains Mono arrives after the editor
    // was created, the caret drifts from the text, so re-measure when fonts load.
    let alive = true;
    const remeasure = () => alive && monaco.editor.remeasureFonts();
    const fonts = document.fonts;
    fonts?.load("13.5px 'JetBrains Mono'").then(remeasure, () => {});
    fonts?.ready.then(remeasure);
    fonts?.addEventListener?.('loadingdone', remeasure);

    return () => {
      alive = false;
      fonts?.removeEventListener?.('loadingdone', remeasure);
      sub.dispose();
      editor.getModel()?.dispose();
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External updates (AI fix, reset). pushEditOperations keeps Ctrl+Z working.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model || model.getValue() === value) return;
    model.pushStackElement();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
    model.pushStackElement();
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    if (model.getLanguageId() === language) return;
    monaco.editor.setModelLanguage(model, language);
    // A language switch loads a different file, so start at the top.
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
  }, [language]);

  // AI findings become inline squiggles with hover messages.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    monaco.editor.setModelMarkers(
      model,
      'codepulse',
      markers
        .filter((m) => m.line && m.line <= lineCount)
        .map((m) => ({
          severity: MARKER_SEVERITY[m.severity] ?? monaco.MarkerSeverity.Info,
          message: `[${m.severity.toUpperCase()}] ${m.title}\n${m.description}${m.suggestion ? `\nFix: ${m.suggestion}` : ''}`,
          source: `CodePulse ${m.category}`,
          startLineNumber: m.line,
          endLineNumber: m.line,
          startColumn: model.getLineFirstNonWhitespaceColumn(m.line) || 1,
          endColumn: model.getLineMaxColumn(m.line),
        }))
    );
    decoRef.current?.set(
      markers
        .filter((m) => m.line && m.line <= lineCount)
        .map((m) => ({
          range: new monaco.Range(m.line, 1, m.line, 1),
          options: { glyphMarginClassName: `glyph glyph-${m.severity}`, glyphMarginHoverMessage: { value: `**${m.title}**` } },
        }))
    );
  }, [markers]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !focus?.line) return;
    editor.revealLineInCenter(focus.line, monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber: focus.line, column: editor.getModel().getLineFirstNonWhitespaceColumn(focus.line) || 1 });
    const flash = editor.createDecorationsCollection([
      { range: new monaco.Range(focus.line, 1, focus.line, 1), options: { isWholeLine: true, className: 'line-focus' } },
    ]);
    editor.focus();
    const t = setTimeout(() => flash.clear(), 1600);
    return () => {
      clearTimeout(t);
      flash.clear();
    };
  }, [focus]);

  // Briefly highlight lines the AI fix rewrote.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !changed?.lines?.length) return;
    const flash = editor.createDecorationsCollection(
      changed.lines.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'line-fixed', linesDecorationsClassName: 'line-fixed-bar' },
      }))
    );
    editor.revealLineInCenterIfOutsideViewport(changed.lines[0], monaco.editor.ScrollType.Smooth);
    const t = setTimeout(() => flash.clear(), 4000);
    return () => {
      clearTimeout(t);
      flash.clear();
    };
  }, [changed]);

  return <div className="editor-host" ref={hostRef} />;
}
