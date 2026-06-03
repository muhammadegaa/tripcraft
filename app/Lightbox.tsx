"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// A full-screen photo gallery any component can open via useGallery().open(urls).
// One instance lives at the app root, so there's no per-component overlay state.

type GalleryState = { photos: string[]; title: string; index: number };
type Ctx = { open: (photos: string[], title?: string, start?: number) => void };

const GalleryCtx = createContext<Ctx>({ open: () => {} });

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GalleryState | null>(null);
  const open = useCallback((photos: string[], title = "", start = 0) => {
    const clean = photos.filter(Boolean);
    if (clean.length) setState({ photos: clean, title, index: Math.min(start, clean.length - 1) });
  }, []);
  return (
    <GalleryCtx.Provider value={{ open }}>
      {children}
      {state && <Lightbox state={state} setState={setState} onClose={() => setState(null)} />}
    </GalleryCtx.Provider>
  );
}

export function useGallery() {
  return useContext(GalleryCtx);
}

function Lightbox({ state, setState, onClose }: {
  state: GalleryState;
  setState: React.Dispatch<React.SetStateAction<GalleryState | null>>;
  onClose: () => void;
}) {
  const { photos, title, index } = state;
  const go = useCallback((d: number) => setState((s) => (s ? { ...s, index: (s.index + d + s.photos.length) % s.photos.length } : s)), [setState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [go, onClose]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const arrow = "grid h-10 w-10 place-items-center rounded-full bg-white/15 text-2xl text-white transition hover:bg-white/30";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm animate-fade" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-4 text-white" onClick={stop}>
        <div className="min-w-0 truncate text-sm font-medium">{title}</div>
        <div className="flex items-center gap-3 text-xs text-white/70">
          <span>{index + 1} / {photos.length}</span>
          <button onClick={onClose} className="rounded-full bg-white/15 px-3 py-1.5 font-medium transition hover:bg-white/30">Close ✕</button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-2 sm:px-16" onClick={stop}>
        {photos.length > 1 && <button aria-label="Previous" onClick={() => go(-1)} className={`absolute left-3 ${arrow}`}>‹</button>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[index]} alt={title} className="max-h-full max-w-full rounded-xl object-contain" />
        {photos.length > 1 && <button aria-label="Next" onClick={() => go(1)} className={`absolute right-3 ${arrow}`}>›</button>}
      </div>

      {photos.length > 1 && (
        <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-5 py-4" onClick={stop}>
          {photos.map((p, i) => (
            <button key={i} onClick={() => setState((s) => (s ? { ...s, index: i } : s))} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${i === index ? "ring-white" : "opacity-50 ring-transparent hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
