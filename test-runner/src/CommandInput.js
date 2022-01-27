import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";

import Editor, { useEditor } from "./Editor";

function CommandInput({ setInnerHTML, availableCommands }) {
  // const readOnlyEditorProps = useEditor();
  // const editorProps = useEditor();
  // const { codeMirrorRef, codeHistory, appendToHistory, setText } = editorProps;
  const [commandHistory, setCommandHistory] = useState([]);
  const [editorValue, setEditorValue] = useState("");

  const submit = useCallback(() => {
    axios.post("/command", { command: editorValue }).then((response) => {
      setInnerHTML(response.data.html);
      setCommandHistory([
        ...commandHistory,
        {
          command: editorValue,
          error: response.data.error,
        },
      ]);
      setEditorValue("");
    });
  }, [commandHistory, setCommandHistory, setInnerHTML, editorValue]);

  return (
    <>
      <Editor
        content={commandHistory.map((history) => history.command).join("\n")}
        availableCommands={availableCommands}
      />
      <Editor
        content={editorValue}
        onContentChange={setEditorValue}
        availableCommands={availableCommands}
        submit={submit}
        commandHistory={commandHistory.map((history) => history.command)}
      />
      <button onClick={submit}>Submit</button>
    </>
  );
}

export default CommandInput;
