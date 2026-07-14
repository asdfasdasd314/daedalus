"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentOutputDetailProps = {
  label: string;
  value: string;
  markdown?: boolean;
};

export default function AgentOutputDetail({ label, value, markdown = false }: AgentOutputDetailProps) {
  const [formatted, setFormatted] = useState(markdown);
  const [copyLabel, setCopyLabel] = useState("Copy");

  useEffect(() => {
    setFormatted(markdown);
    setCopyLabel("Copy");
  }, [markdown, value]);

  function copyValue() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1500);
    });
  }

  return (
    <section className="min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</h3>
        <div className="flex items-center gap-2">
          {markdown ? (
            <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
              <button type="button" onClick={() => setFormatted(true)} className={`rounded-full px-3 py-1 text-xs font-semibold ${formatted ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}>Formatted</button>
              <button type="button" onClick={() => setFormatted(false)} className={`rounded-full px-3 py-1 text-xs font-semibold ${!formatted ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}>Raw</button>
            </div>
          ) : null}
          <button type="button" onClick={copyValue} className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10">{copyLabel}</button>
        </div>
      </div>
      {markdown && formatted ? (
        <div className="agent-output-markdown min-w-0 overflow-hidden break-words text-sm leading-6 text-slate-200">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener" className="break-words text-cyan-300 underline">{children}</a>,
              blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-cyan-300/60 pl-3 text-slate-300">{children}</blockquote>,
              code: ({ children, className, node, ...props }) => node?.position?.start.line !== node?.position?.end.line
                ? <code {...props} className={`${className ?? ""} block whitespace-pre-wrap break-words p-3 text-slate-100`}>{children}</code>
                : <code {...props} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-100">{children}</code>,
              h1: ({ children }) => <h1 className="mt-4 text-xl font-bold text-white first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold text-white">{children}</h2>,
              h3: ({ children }) => <h3 className="mt-3 font-semibold text-white">{children}</h3>,
              ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
              ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
              p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
              pre: ({ children }) => <pre className="my-3 max-w-full overflow-x-auto rounded-xl bg-black/45">{children}</pre>,
              table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
              td: ({ children }) => <td className="border border-white/10 px-2 py-1.5 align-top">{children}</td>,
              th: ({ children }) => <th className="border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-white">{children}</th>,
            }}
          >{value}</ReactMarkdown>
        </div>
      ) : (
        <pre className="max-h-[32rem] min-w-0 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{value}</pre>
      )}
    </section>
  );
}
