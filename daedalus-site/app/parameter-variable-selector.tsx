"use client";

import { useMemo, useState } from "react";
import type { ParameterFileRecord } from "@/lib/parameter-file-cache";
import {
  parseParameterFile,
  validateParameterVariableDraft,
} from "@/lib/parameter-file-parser";

type ParameterVariableSelectorProps = {
  projectPath: string;
  parameterFilePath: string;
  parameterFile: ParameterFileRecord;
  onRequestSave: (request: {
    parameterFilePath: string;
    projectPath: string;
    value: string;
    variableName: string;
  }) => Promise<void>;
};

export default function ParameterVariableSelector({
  projectPath,
  parameterFilePath,
  parameterFile,
  onRequestSave,
}: ParameterVariableSelectorProps) {
  const initialVariables = parseParameterFile(parameterFile.toml).variables;
  const [selectedVariableName, setSelectedVariableName] = useState(
    initialVariables[0]?.name ?? "",
  );
  const [draftValue, setDraftValue] = useState(
    initialVariables[0]?.displayValue ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveTone, setSaveTone] = useState<"error" | "success">("success");

  const parsedFile = useMemo(
    () => parseParameterFile(parameterFile.toml),
    [parameterFile.toml],
  );
  const variables = parsedFile.variables;
  const selectedVariable =
    variables.find((variable) => variable.name === selectedVariableName) ??
    variables[0] ??
    null;
  const effectiveDraftValue =
    selectedVariable && selectedVariable.name !== selectedVariableName
      ? selectedVariable.displayValue
      : draftValue;
  const validation = selectedVariable
    ? validateParameterVariableDraft(selectedVariable, effectiveDraftValue)
    : null;

  async function handleSave() {
    if (!selectedVariable || !validation?.ok) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");
    setSaveTone("success");

    try {
      await onRequestSave({
        parameterFilePath,
        projectPath,
        value: effectiveDraftValue,
        variableName: selectedVariable.name,
      });
      setSaveTone("success");
      setSaveMessage("Save request sent to the daemon.");
    } catch (error) {
      setSaveTone("error");
      setSaveMessage(error instanceof Error ? error.message : "Unable to send the save request.");
    } finally {
      setIsSaving(false);
    }
  }

  if (variables.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
        This parameter file loaded successfully, but no flat TOML variables were found yet.
      </div>
    );
  }

  if (!selectedVariable) {
    return null;
  }

  return (
    <div className="grid gap-4 rounded-[1.25rem] border border-white/10 bg-slate-900/70 px-4 py-4">
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Variable
        </span>
        <select
          value={selectedVariable.name}
          onChange={(event) => {
            const nextVariable =
              variables.find((variable) => variable.name === event.target.value) ??
              null;
            setSelectedVariableName(event.target.value);
            setDraftValue(nextVariable?.displayValue ?? "");
            setSaveMessage("");
          }}
          className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
        >
          {variables.map((variable) => (
            <option key={variable.name} value={variable.name}>
              {variable.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 rounded-xl border border-white/8 bg-slate-950/70 px-3 py-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
          Description
        </p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
          {selectedVariable.description ||
            "No leading comments were found for this variable yet."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1">
          Type: {selectedVariable.kind}
        </span>
        {selectedVariable.section ? (
          <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1">
            Section: {selectedVariable.section}
          </span>
        ) : null}
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Value
        </span>
        {selectedVariable.kind === "boolean" ? (
          <select
            value={effectiveDraftValue}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setSaveMessage("");
            }}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : selectedVariable.kind === "array" ? (
          <textarea
            value={effectiveDraftValue}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setSaveMessage("");
            }}
            rows={4}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300"
          />
        ) : (
          <input
            type="text"
            value={effectiveDraftValue}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setSaveMessage("");
            }}
            disabled={!selectedVariable.isEditable}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
          />
        )}
      </label>

      {!selectedVariable.isEditable ? (
        <p className="text-sm text-amber-200">
          This TOML value shape is visible, but editing is not supported yet.
        </p>
      ) : null}

      {selectedVariable.isEditable && validation && !validation.ok ? (
        <p className="text-sm text-rose-300">{validation.error}</p>
      ) : null}

      {saveMessage ? (
        <p className={`text-sm ${saveTone === "error" ? "text-rose-300" : "text-cyan-200"}`}>
          {saveMessage}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!selectedVariable.isEditable || !validation?.ok || isSaving}
          className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {isSaving ? "Saving..." : "Save variable"}
        </button>
      </div>
    </div>
  );
}
