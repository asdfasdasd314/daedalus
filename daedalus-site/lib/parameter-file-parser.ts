export type ParameterVariableKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "array"
  | "unsupported";

export type ParameterVariable = {
  name: string;
  key: string;
  section: string;
  description: string;
  kind: ParameterVariableKind;
  rawValue: string;
  displayValue: string;
  lineIndex: number;
  linePrefix: string;
  inlineComment: string;
  isEditable: boolean;
};

export type ParsedParameterFile = {
  variables: ParameterVariable[];
};

export type ExecutionCommandMetadata =
  | { runnable: true; command: string[]; preview: string }
  | { runnable: false; reason: string };

export function getExecutionCommandMetadata(toml: string): ExecutionCommandMetadata {
  const executionCommand = parseParameterFile(toml).variables.find(
    (variable) => variable.name === "execution.command",
  );

  if (!executionCommand) {
    return { runnable: false, reason: "No [execution] command declaration." };
  }

  const command = parseStringArray(executionCommand.rawValue);
  if (!command || command.length === 0 || command.some((item) => !item.trim())) {
    return {
      runnable: false,
      reason: "execution.command must be a non-empty TOML array of strings.",
    };
  }

  return { runnable: true, command, preview: command.join(" ") };
}

type ParsedTomlValue = {
  kind: ParameterVariableKind;
  displayValue: string;
  isEditable: boolean;
};

export function parseParameterFile(toml: string): ParsedParameterFile {
  const variables: ParameterVariable[] = [];
  const lines = toml.split("\n");
  let currentSection = "";
  let pendingComments: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      pendingComments = [];
      continue;
    }

    if (trimmedLine.startsWith("#")) {
      pendingComments.push(trimmedLine.replace(/^#\s?/, "").trim());
      continue;
    }

    const sectionMatch = trimmedLine.match(/^\[(.+)\]$/);

    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      pendingComments = [];
      continue;
    }

    const assignmentMatch = line.match(/^(\s*([A-Za-z0-9_.-]+)\s*=\s*)(.+)$/);

    if (!assignmentMatch) {
      pendingComments = [];
      continue;
    }

    const key = assignmentMatch[2].trim();
    const { inlineComment, valueText } = splitValueAndInlineComment(
      assignmentMatch[3].trim(),
    );
    const parsedValue = parseTomlValue(valueText);

    variables.push({
      name: currentSection ? `${currentSection}.${key}` : key,
      key,
      section: currentSection,
      description: pendingComments.join("\n").trim(),
      kind: parsedValue.kind,
      rawValue: valueText,
      displayValue: parsedValue.displayValue,
      lineIndex: index,
      linePrefix: assignmentMatch[1],
      inlineComment,
      isEditable: parsedValue.isEditable,
    });

    pendingComments = [];
  }

  return { variables };
}

export function validateParameterVariableDraft(
  variable: ParameterVariable,
  draftValue: string,
) {
  const trimmedDraft = draftValue.trim();

  if (variable.kind === "unsupported") {
    return {
      ok: false as const,
      error: "This variable uses a TOML value shape that the editor does not support yet.",
    };
  }

  if (variable.kind === "string") {
    return {
      ok: true as const,
      serializedValue: JSON.stringify(draftValue),
    };
  }

  if (variable.kind === "boolean") {
    if (trimmedDraft !== "true" && trimmedDraft !== "false") {
      return {
        ok: false as const,
        error: "Booleans must be either true or false.",
      };
    }

    return {
      ok: true as const,
      serializedValue: trimmedDraft,
    };
  }

  if (variable.kind === "integer") {
    if (!/^[+-]?\d+$/.test(trimmedDraft)) {
      return {
        ok: false as const,
        error: "Integers must be whole numbers like 2 or -4.",
      };
    }

    return {
      ok: true as const,
      serializedValue: trimmedDraft,
    };
  }

  if (variable.kind === "float") {
    if (!isValidFloat(trimmedDraft)) {
      return {
        ok: false as const,
        error: "Floats must be valid numbers like 2.5, -0.1, or 3e-4.",
      };
    }

    return {
      ok: true as const,
      serializedValue: normalizeFloatLiteral(trimmedDraft),
    };
  }

  if (variable.kind === "array") {
    if (!isSupportedArrayLiteral(trimmedDraft)) {
      return {
        ok: false as const,
        error:
          "Arrays must stay in TOML array form like [1, 2, 3] or [\"alpha\", \"beta\"].",
      };
    }

    return {
      ok: true as const,
      serializedValue: trimmedDraft,
    };
  }

  return {
    ok: false as const,
    error: "This variable type is not editable yet.",
  };
}

export function updateParameterVariableInToml(
  toml: string,
  variableName: string,
  draftValue: string,
) {
  const parsedFile = parseParameterFile(toml);
  const variable = parsedFile.variables.find(
    (currentVariable) => currentVariable.name === variableName,
  );

  if (!variable) {
    return {
      ok: false as const,
      error: `Variable "${variableName}" was not found in this parameter file.`,
    };
  }

  const validation = validateParameterVariableDraft(variable, draftValue);

  if (!validation.ok) {
    return validation;
  }

  const lines = toml.split("\n");
  const nextLine =
    variable.linePrefix +
    validation.serializedValue +
    (variable.inlineComment ? ` ${variable.inlineComment}` : "");

  lines[variable.lineIndex] = nextLine;

  return {
    ok: true as const,
    toml: lines.join("\n"),
  };
}

function parseTomlValue(valueText: string): ParsedTomlValue {
  if (isDoubleQuotedString(valueText)) {
    return {
      kind: "string",
      displayValue: parseDoubleQuotedString(valueText),
      isEditable: true,
    };
  }

  if (isSingleQuotedString(valueText)) {
    return {
      kind: "string",
      displayValue: valueText.slice(1, -1),
      isEditable: true,
    };
  }

  if (valueText === "true" || valueText === "false") {
    return {
      kind: "boolean",
      displayValue: valueText,
      isEditable: true,
    };
  }

  if (/^[+-]?\d+$/.test(valueText)) {
    return {
      kind: "integer",
      displayValue: valueText,
      isEditable: true,
    };
  }

  if (isValidFloat(valueText)) {
    return {
      kind: "float",
      displayValue: valueText,
      isEditable: true,
    };
  }

  if (valueText.startsWith("[") && valueText.endsWith("]")) {
    return {
      kind: "array",
      displayValue: valueText,
      isEditable: isSupportedArrayLiteral(valueText),
    };
  }

  return {
    kind: "unsupported",
    displayValue: valueText,
    isEditable: false,
  };
}

function splitValueAndInlineComment(valueText: string) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let bracketDepth = 0;

  for (let index = 0; index < valueText.length; index += 1) {
    const character = valueText[index];
    const previousCharacter = index === 0 ? "" : valueText[index - 1];

    if (character === '"' && !inSingleQuote && previousCharacter !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (character === "[") {
        bracketDepth += 1;
      }

      if (character === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }

      if (character === "#" && bracketDepth === 0) {
        return {
          valueText: valueText.slice(0, index).trim(),
          inlineComment: valueText.slice(index).trim(),
        };
      }
    }
  }

  return {
    valueText: valueText.trim(),
    inlineComment: "",
  };
}

function isDoubleQuotedString(valueText: string) {
  return /^"(?:[^"\\]|\\.)*"$/.test(valueText);
}

function isSingleQuotedString(valueText: string) {
  return /^'[^']*'$/.test(valueText);
}

function parseStringArray(valueText: string): string[] | null {
  const trimmed = valueText.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const items = trimmed.slice(1, -1).match(/(?:"(?:[^"\\]|\\.)*"|'[^']*')/g);
  if (!items || items.join(",").replace(/\s/g, "") !== trimmed.slice(1, -1).replace(/\s/g, "")) {
    return null;
  }
  return items.map((item) => item.startsWith("\"") ? parseDoubleQuotedString(item) : item.slice(1, -1));
}

function parseDoubleQuotedString(valueText: string) {
  try {
    return JSON.parse(valueText) as string;
  } catch {
    return valueText.slice(1, -1);
  }
}

function isValidFloat(valueText: string) {
  if (!/^[+-]?(?:\d+\.\d*|\d*\.\d+|\d+(?:[eE][+-]?\d+)|\d+\.\d*(?:[eE][+-]?\d+)|\d*\.\d+(?:[eE][+-]?\d+))$/.test(valueText)) {
    return false;
  }

  return Number.isFinite(Number(valueText));
}

function normalizeFloatLiteral(valueText: string) {
  if (/[.eE]/.test(valueText)) {
    return valueText;
  }

  return `${valueText}.0`;
}

function isSupportedArrayLiteral(valueText: string) {
  if (!valueText.startsWith("[") || !valueText.endsWith("]")) {
    return false;
  }

  const innerValue = valueText.slice(1, -1).trim();

  if (!innerValue) {
    return true;
  }

  const parts = splitArrayItems(innerValue);

  if (!parts) {
    return false;
  }

  return parts.every((part) => {
    const parsedValue = parseTomlValue(part.trim());
    return parsedValue.kind !== "unsupported";
  });
}

function splitArrayItems(innerValue: string) {
  const items: string[] = [];
  let currentItem = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let bracketDepth = 0;

  for (let index = 0; index < innerValue.length; index += 1) {
    const character = innerValue[index];
    const previousCharacter = index === 0 ? "" : innerValue[index - 1];

    if (character === '"' && !inSingleQuote && previousCharacter !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      currentItem += character;
      continue;
    }

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentItem += character;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (character === "[") {
        bracketDepth += 1;
      }

      if (character === "]") {
        bracketDepth -= 1;
      }

      if (character === "," && bracketDepth === 0) {
        items.push(currentItem.trim());
        currentItem = "";
        continue;
      }
    }

    currentItem += character;
  }

  if (inSingleQuote || inDoubleQuote || bracketDepth !== 0) {
    return null;
  }

  if (currentItem.trim()) {
    items.push(currentItem.trim());
  }

  return items;
}
