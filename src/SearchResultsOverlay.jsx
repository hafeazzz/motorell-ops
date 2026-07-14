import React from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

function SearchResultsOverlay({ open, onClose, results, query, textIndex, indexing, indexPct, goPage }) {
  if (!open || query.trim().length < 2) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex justify-center p-3" onClick={onClose}>
      <div className="s-surface s-border border rounded-xl shadow-xl z-50 overflow-hidden w-full max-w-md mt-16" onClick={(e) => e.stopPropagation()}>
        {textIndex == null && <p className="text-xs s-muted px-3 py-3 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Menyiapkan pencarian… {indexPct}%</p>}
        {textIndex != null && results.length === 0 && <p className="text-xs s-muted px-3 py-3">Tidak ada hasil untuk “{query.trim()}”.</p>}
        {results.map((r, i) => {
          const before = r.snippet.slice(0, r.at); const hit = r.snippet.slice(r.at, r.at + r.qlen); const after = r.snippet.slice(r.at + r.qlen);
          return (
            <button key={i} onClick={() => { goPage(r.page); onClose(); }} className="w-full text-left px-3 py-2 border-b s-border last:border-0 active:s-soft hover:s-soft transition">
              <div className="flex items-center gap-2 mb-0.5"><span className="text-[10px] font-bold ac-text">Halaman {r.page}</span></div>
              <p className="text-xs s-muted leading-snug break-words">{before}<span className="font-bold ac-text">{hit}</span>{after}</p>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default SearchResultsOverlay;