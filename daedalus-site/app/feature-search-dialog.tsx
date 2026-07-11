"use client";

import Fuse from "fuse.js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import type { FeatureGraphSelection } from "./feature-file-graph";
import {
  buildFeatureSearchRecords,
  getProjectLabel,
  type FeatureSearchRecord,
} from "./feature-workspace-utils";

const ALL_PROJECTS_SCOPE = "all";
const MAX_SEARCH_RESULTS = 20;

type FeatureSearchDialogProps = {
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: FeatureGraphSelection) => void;
  projects: FeatureFileProjects;
};

export default function FeatureSearchDialog({
  isMobile,
  isOpen,
  onClose,
  onSelect,
  projects,
}: FeatureSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState(ALL_PROJECTS_SCOPE);
  const [activeIndex, setActiveIndex] = useState(0);

  const searchRecords = useMemo(
    () => buildFeatureSearchRecords(projects),
    [projects],
  );

  const projectDirectories = useMemo(
    () => Object.keys(projects).sort(),
    [projects],
  );

  const fuse = useMemo(
    () =>
      new Fuse(searchRecords, {
        keys: [
          { name: "featureName", weight: 0.4 },
          { name: "filePath", weight: 0.3 },
          { name: "projectLabel", weight: 0.15 },
          { name: "markdown", weight: 0.15 },
        ],
        ignoreLocation: true,
        threshold: 0.4,
      }),
    [searchRecords],
  );

  const results = useMemo(() => {
    const trimmedQuery = query.trim();
    const matchedRecords = trimmedQuery
      ? fuse.search(trimmedQuery).map((match) => match.item)
      : searchRecords;
    const scopedMatches =
      scope === ALL_PROJECTS_SCOPE
        ? matchedRecords
        : matchedRecords.filter((record) => record.projectPath === scope);

    return scopedMatches.slice(0, MAX_SEARCH_RESULTS);
  }, [fuse, query, scope, searchRecords]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setScope(ALL_PROJECTS_SCOPE);
    setActiveIndex(0);

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, scope]);

  useEffect(() => {
    if (activeIndex < results.length) {
      return;
    }

    setActiveIndex(results.length > 0 ? results.length - 1 : 0);
  }, [activeIndex, results.length]);

  if (!isOpen) {
    return null;
  }

  function selectResult(record: FeatureSearchRecord) {
    onClose();
    onSelect({
      featureName: record.featureName,
      filePath: record.filePath,
      projectPath: record.projectPath,
    });
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (results.length === 0) {
        return;
      }

      setActiveIndex((currentIndex) => (currentIndex + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (results.length === 0) {
        return;
      }

      setActiveIndex(
        (currentIndex) =>
          (currentIndex - 1 + results.length) % results.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = results[activeIndex];

      if (!activeResult) {
        return;
      }

      selectResult(activeResult);
    }
  }

  const panelClassName = isMobile
    ? "flex max-h-[min(92vh,40rem)] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-slate-950/96 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur"
    : "flex max-h-[min(80vh,36rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/96 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur";

  const shellClassName = isMobile
    ? "pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-0 sm:p-4"
    : "pointer-events-auto fixed inset-0 z-40 flex items-start justify-center bg-black/55 px-4 pb-4 pt-[12vh]";

  const hasProjects = searchRecords.length > 0;
  const trimmedQuery = query.trim();
  const showEmptyIndex = !hasProjects;
  const showNoResults =
    hasProjects && trimmedQuery.length > 0 && results.length === 0;
  const showBrowseHint = hasProjects && trimmedQuery.length === 0;

  return (
    <div
      className={shellClassName}
      onClick={onClose}
      onKeyDown={handleDialogKeyDown}
      role="presentation"
    >
      <div
        aria-labelledby="feature-search-title"
        aria-modal="true"
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Feature search
            </p>
            <h2
              id="feature-search-title"
              className="mt-2 text-xl font-semibold text-white"
            >
              Find a feature
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            X
          </button>
        </div>

        <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <label className="grid gap-2">
            <span className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Query
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, paths, or feature content..."
              className="w-full rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Scope
            </span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="w-full rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
            >
              <option value={ALL_PROJECTS_SCOPE}>All projects</option>
              {projectDirectories.map((projectPath) => (
                <option key={projectPath} value={projectPath}>
                  {getProjectLabel(projectPath, projectDirectories)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {showEmptyIndex ? (
            <p className="px-3 py-6 text-sm text-slate-400">
              Feature files have not loaded yet.
            </p>
          ) : null}

          {showNoResults ? (
            <p className="px-3 py-6 text-sm text-slate-400">
              No features matched that search.
            </p>
          ) : null}

          {showBrowseHint ? (
            <p className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Browse features
            </p>
          ) : null}

          {results.map((record, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={`${record.projectPath}:${record.filePath}`}
                type="button"
                onClick={() => selectResult(record)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full flex-col gap-1 rounded-[1.25rem] px-3 py-3 text-left transition ${
                  isActive
                    ? "bg-cyan-300/15 text-white"
                    : "text-slate-200 hover:bg-white/6"
                }`}
              >
                <span className="text-sm font-semibold">{record.featureName}</span>
                <span className="text-xs text-slate-400">
                  {record.projectLabel}
                </span>
                <span className="truncate text-xs text-slate-500">
                  {record.filePath}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:px-5">
          ↑↓ Navigate · Enter Open · Esc Close
        </div>
      </div>
    </div>
  );
}
