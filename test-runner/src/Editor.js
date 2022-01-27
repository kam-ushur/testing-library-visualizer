import { useEffect, useCallback, useRef, useMemo } from "react";

import {
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
} from "@codemirror/view";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, historyKeymap } from "@codemirror/history";
import { foldGutter, foldKeymap } from "@codemirror/fold";
import { indentOnInput } from "@codemirror/language";
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/gutter";
import { defaultKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/matchbrackets";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/closebrackets";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { commentKeymap } from "@codemirror/comment";
import { rectangularSelection } from "@codemirror/rectangular-selection";
import { defaultHighlightStyle } from "@codemirror/highlight";
import { lintKeymap } from "@codemirror/lint";

import { javascript } from "@codemirror/lang-javascript";
import { syntaxTree } from "@codemirror/language";
import {
  oneDarkTheme,
  oneDarkHighlightStyle,
} from "@codemirror/theme-one-dark";

const completePropertyAfter = ["PropertyName", ".", "?."];

const fixedHeightEditor = EditorView.theme({
  "&": { height: "300px" },
  ".cm-scroller": { overflow: "auto" },
});

export function useEditor() {
  const codeMirrorRef = useRef();
  const codeHistory = useRef({ index: 0, history: [] });

  const appendToHistory = useCallback(
    (value) => {
      codeHistory.current.history = [value, ...codeHistory.current.history];
      codeHistory.current.index = 0;
    },
    [codeHistory]
  );
  const setText = useCallback(
    (text) => {
      if (codeMirrorRef.current) {
        const transaction = codeMirrorRef.current.state.update({
          changes: {
            from: 0,
            to: codeMirrorRef.current.state.doc.length,
            insert: text,
          },
        });
        codeMirrorRef.current.dispatch(transaction);
      }
    },
    [codeMirrorRef]
  );

  return { codeMirrorRef, codeHistory, appendToHistory, setText };
}

const submitFunctionEffect = StateEffect.define({});
const submitFunctionState = StateField.define({
  create() {
    return { submitFunction: () => {} };
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(submitFunctionEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

const updateCommandHistoryEffect = StateEffect.define({});
const updateHistoryIndexEffect = StateEffect.define({});
const commandHistoryState = StateField.define({
  create() {
    return { index: 0, commandHistory: [] };
  },
  update(value, transaction) {
    console.log(value, transaction);
    for (const effect of transaction.effects) {
      if (effect.is(updateCommandHistoryEffect)) {
        return { ...value, commandHistory: effect.value.commandHistory };
      }
      if (effect.is(updateHistoryIndexEffect)) {
        return { ...value, index: effect.value.index };
      }
    }
    return value;
  },
});

export default function Editor({
  onContentChange,
  availableCommands,
  submit,
  content,
  commandHistory,
}) {
  const codeEditorRef = useRef();
  const { codeMirrorRef, codeHistory } = useEditor();

  useEffect(() => {
    if (!codeMirrorRef.current) return;
    codeMirrorRef.current.dispatch({
      effects: submitFunctionEffect.of({ submit }),
    });
  }, [submit, codeMirrorRef]);

  useEffect(() => {
    if (!codeMirrorRef.current) return;
    codeMirrorRef.current.dispatch({
      effects: updateCommandHistoryEffect.of({ commandHistory }),
    });
  }, [commandHistory, codeMirrorRef]);

  const myCompletions = useCallback(
    (context) => {
      let nodeBefore = syntaxTree(context.state).resolveInner(context.pos, -1);
      if (
        completePropertyAfter.includes(nodeBefore.name) &&
        nodeBefore.parent?.name === "MemberExpression"
      ) {
        let object = nodeBefore.parent.getChild("Expression");
        if (object?.name === "VariableName") {
          let from = /\./.test(nodeBefore.name)
            ? nodeBefore.to
            : nodeBefore.from;
          let variableName = context.state.sliceDoc(object.from, object.to);
          console.log(variableName, from);
          return {
            from,
            options: (availableCommands[variableName] || []).map(
              (property) => ({
                label: property,
                type: "function",
              })
            ),
            span: /^[\w$]*$/,
          };
        }
      } else if (nodeBefore.name === "VariableName") {
        return {
          from: nodeBefore.from,
          options: (Object.keys(availableCommands) || []).map((keyword) => ({
            label: keyword,
            type: "function",
          })),
          span: /^[\w$]*$/,
        };
      }
      return null;
    },
    [availableCommands]
  );

  useEffect(() => {
    if (!codeMirrorRef.current) return;

    const doc = codeMirrorRef.current.state.doc;

    // Don't update the document if it's equal to the `content` prop.
    // Otherwise it would reset the cursor position.
    const currentDocument = doc.toString();
    if (content === currentDocument) return;

    codeMirrorRef.current.dispatch({
      changes: { from: 0, to: doc.length, insert: content },
    });
  }, [content, codeMirrorRef]);

  const updateListener = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (
        !update.docChanged ||
        !onContentChange ||
        typeof onContentChange !== "function"
      )
        return;
      console.log(update);
      onContentChange(update.state.doc.toString());
    });
  }, [onContentChange]);

  useEffect(() => {
    if (codeEditorRef.current) {
      const ctrlCursorArrowUp = (props) => {
        const { state, dispatch } = props;
        const commandHistory = state.field(commandHistoryState);

        const newIndex = Math.min(
          commandHistory.index + 1,
          commandHistory.commandHistory.length
        );
        console.log(commandHistory.commandHistory[newIndex - 1], newIndex);
        dispatch({
          effects: updateHistoryIndexEffect.of({ index: newIndex }),
          changes: {
            from: 0,
            to: state.doc.length,
            insert: commandHistory.commandHistory[newIndex - 1],
          },
        });
      };

      const ctrlCursorArrowDown = (props) => {
        const { state, dispatch } = props;
        const commandHistory = state.field(commandHistoryState);

        const newIndex = Math.max(commandHistory.index - 1, 0);
        console.log(commandHistory, newIndex);
        dispatch({
          effects: updateHistoryIndexEffect.of({ index: newIndex }),
          changes: {
            from: 0,
            to: state.doc.length,
            insert:
              newIndex === 0 ? "" : commandHistory.commandHistory[newIndex - 1],
          },
        });
      };

      const previousCommandsKeyMap = [
        {
          key: "Ctrl-ArrowUp",
          mac: "Cmd-ArrowUp",
          run: ctrlCursorArrowUp,
          preventDefault: true,
        },
        {
          key: "Ctrl-ArrowDown",
          mac: "Cmd-ArrowDown",
          run: ctrlCursorArrowDown,
          preventDefault: true,
        },
      ];

      const sendCommandKeyMap = [
        {
          key: "Ctrl-Enter",
          mac: "Cmd-Enter",
          run: ({ state }) => {
            state.field(submitFunctionState).submit();
          },
          preventDefault: true,
        },
      ];
      let state = EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          defaultHighlightStyle.fallback,
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...sendCommandKeyMap,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...commentKeymap,
            ...completionKeymap,
            ...lintKeymap,
            ...previousCommandsKeyMap,
          ]),
          javascript(),
          autocompletion({ override: [myCompletions] }),
          oneDarkHighlightStyle,
          oneDarkTheme,
          fixedHeightEditor,
          updateListener,
          submitFunctionState,
          commandHistoryState,
        ],
      });
      if (codeMirrorRef.current) {
        codeMirrorRef.current.destroy();
      }
      codeMirrorRef.current = new EditorView({
        state,
        parent: codeEditorRef.current,
      });
      codeMirrorRef.current.focus();
    }
  }, [
    codeEditorRef,
    codeMirrorRef,
    myCompletions,
    codeHistory,
    updateListener,
  ]);

  useEffect(() => {
    return () => {
      if (codeMirrorRef.current) codeMirrorRef.current.destory();
    };
  }, []);
  return (
    <>
      <div className="code-editor" ref={codeEditorRef} />
    </>
  );
}
