import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PDFJS, PDF_LOAD_OPTIONS, MAX_FILE_SIZE } from './lib/pdfEngine';
import type { TabState, ViewMode, SidebarTab, Annotation, SearchResult, PdfOutlineItem, PdfMetadata, RecentEntry, AppSettings } from './lib/types';
import { defaultSettings, loadSettings, saveSettings, loadRecents, saveRecents, clearHistory } from './lib/storage';
import { formatFileSize, isAllowedUrl, sanitizeFilename } from './lib/sanitize';

const uid = () => Math.random().toString(36).slice(2, 10);
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function makeTab(partial: Partial<TabState> & Pick<TabState, 'fileName'>): TabState {
  const base: TabState = {
    id: uid(),
    fileName: partial.fileName,
    fileSize: partial.fileSize,
    fileHandle: partial.fileHandle ?? null,
    arrayBuffer: partial.arrayBuffer ?? null,
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    zoom: 1,
    zoomMode: 'fit-width',
    rotation: 0 as TabState['rotation'],
    viewMode: 'continuous',
    outline: null,
    metadata: null,
    searchQuery: '',
    searchResults: [],
    searchIndex: 0,
    annotations: [],
    undoStack: [],
    redoStack: [],
    isModified: false,
    error: null,
  };
  // Apply overrides from partial without duplicating id/fileName diagnostics
  const overrides = Object.fromEntries(Object.entries(partial).filter(([k]) => k !== 'id' && k !== 'fileName')) as Partial<TabState>;
  return { ...base, ...overrides, fileName: partial.fileName };
}

async function fetchOutline(pdf: any): Promise<PdfOutlineItem[] | null> {
  try {
    const outline = await pdf.getOutline();
    if (!outline) return null;
    const map = async (items: any[]): Promise<PdfOutlineItem[]> => {
      return Promise.all(items.map(async (it: any) => {
        let pageNumber: number | undefined;
        try {
          if (it.dest) {
            const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
            if (dest) {
              const idx = await pdf.getPageIndex(dest[0]);
              pageNumber = idx + 1;
            }
          }
        } catch {}
        return {
          title: it.title,
          dest: it.dest,
          url: it.url ?? null,
          pageNumber,
          items: it.items ? await map(it.items) : [],
        } as PdfOutlineItem;
      }));
    };
    return await map(outline);
  } catch { return null; }
}

async function fetchMetadata(pdf: any, fileSize?: number): Promise<PdfMetadata> {
  let info: any = {};
  try { const meta = await pdf.getMetadata(); info = meta?.info || {}; } catch {}
  return {
    title: info.Title, author: info.Author, subject: info.Subject, keywords: info.Keywords,
    creator: info.Creator, producer: info.Producer, creationDate: info.CreationDate, modDate: info.ModDate,
    pageCount: pdf.numPages, fileSize, encrypted: false, version: (pdf as any)._pdfInfo?.version,
  };
}

function PdfPage({
  pdfDoc, pageNumber, scale, rotation, searchResults, searchIndex, searchQuery,
  annotations, onCreateAnnotation, textSelectable = true,
}: {
  pdfDoc: any; pageNumber: number; scale: number; rotation: number;
  searchResults: SearchResult[]; searchIndex: number; searchQuery: string;
  annotations: Annotation[]; onCreateAnnotation: (a: Annotation) => void; textSelectable?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    async function render() {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr, rotation });
        const displayViewport = page.getViewport({ scale, rotation });
        setDims({ w: displayViewport.width, h: displayViewport.height });
        const canvas = canvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${displayViewport.width}px`;
        canvas.style.height = `${displayViewport.height}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, displayViewport.width, displayViewport.height);
        renderTask = page.render({ canvasContext: ctx as any, viewport, canvas });
        await renderTask.promise;
        if (cancelled) return;
        if (textLayerRef.current && textSelectable) {
          const textContent = await page.getTextContent();
          const textLayerDiv = textLayerRef.current;
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${displayViewport.width}px`;
          textLayerDiv.style.height = `${displayViewport.height}px`;
          const frag = document.createDocumentFragment();
          for (const item of textContent.items as any[]) {
            if (!item.str) continue;
            const span = document.createElement('span');
            span.textContent = item.str;
            const tx = (PDFJS as any).Util.transform(displayViewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            const angle = Math.atan2(tx[1], tx[0]) * 180 / Math.PI;
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = item.fontName || 'sans-serif';
            if (angle !== 0) span.style.transform = `rotate(${angle}deg)`;
            if (searchQuery && item.str.toLowerCase().includes(searchQuery.toLowerCase())) {
              const isActivePage = searchResults.some(r => r.page === pageNumber);
              if (isActivePage) {
                const idx = searchResults.findIndex((r, i) => r.page === pageNumber && i === searchIndex);
                span.style.background = idx >= 0 ? 'rgba(255,152,0,0.45)' : 'rgba(255,235,59,0.55)';
              }
            }
            frag.appendChild(span);
          }
          textLayerDiv.appendChild(frag);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    render();
    return () => { cancelled = true; try { renderTask?.cancel(); } catch {} };
  }, [pdfDoc, pageNumber, scale, rotation, searchQuery, searchResults, searchIndex, textSelectable]);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.text-layer span')) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x0 = (e.clientX - rect.left) / rect.width;
    const y0 = (e.clientY - rect.top) / rect.height;
    const onMove = (ev: MouseEvent) => {
      const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
      const x1 = (ev.clientX - r.left) / r.width;
      const y1 = (ev.clientY - r.top) / r.height;
      setDrag({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
      const x1 = (ev.clientX - r.left) / r.width;
      const y1 = (ev.clientY - r.top) / r.height;
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      if (w > 0.02 && h > 0.01) {
        const ann: Annotation = {
          id: uid(), kind: 'highlight', page: pageNumber,
          color: '#ffeb3b', opacity: 0.5,
          rect: { x: Math.min(x0, x1), y: Math.min(y0, y1), w, h },
          createdAt: new Date().toISOString(),
        };
        onCreateAnnotation(ann);
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (error) return <div className="page-wrap" style={{ padding: 16, color: '#b00' }}>Failed to render page {pageNumber}: {error}</div>;
  return (
    <div ref={wrapRef} className="page-wrap" onMouseDown={onMouseDown} data-page={pageNumber} style={dims ? { width: dims.w, height: dims.h } : undefined}>
      <canvas ref={canvasRef} className="page-canvas" aria-label={`Page ${pageNumber}`} />
      <div ref={textLayerRef} className="text-layer" aria-hidden />
      <div className="annot-layer" aria-hidden>
        {annotations.filter(a => a.page === pageNumber).map(a => (
          <div key={a.id} className="annot" title={a.content || a.kind} style={{
            left: `${(a.rect?.x || 0) * 100}%`, top: `${(a.rect?.y || 0) * 100}%`,
            width: `${(a.rect?.w || 0) * 100}%`, height: `${(a.rect?.h || 0) * 100}%`,
            background: a.kind === 'highlight' ? 'rgba(255,235,59,0.55)' : a.kind === 'underline' ? 'transparent' : 'rgba(229,57,53,0.35)',
            borderBottom: a.kind === 'underline' ? `3px solid ${a.color}` : undefined,
            borderRadius: 2, pointerEvents: 'auto'
          }} />
        ))}
        {drag && <div className="annot" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.w * 100}%`, height: `${drag.h * 100}%`, background: 'rgba(255,235,59,0.5)', border: '1px dashed #d4a017' }} />}
      </div>
    </div>
  );
}

function ThumbnailCanvas({ pdfDoc, pageNumber, active, onClick }: { pdfDoc: any; pageNumber: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = ref.current; if (!canvas || cancelled) return;
        canvas.width = viewport.width; canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        await page.render({ canvasContext: ctx as any, viewport, canvas }).promise;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNumber]);
  return (
    <div className={`thumbnail ${active ? 'active' : ''}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()} aria-label={`Thumbnail page ${pageNumber}`}>
      <div className="thumb-canvas"><canvas ref={ref} /></div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{pageNumber}</div>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents());
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{ tabId: string; message?: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [linkConfirm, setLinkConfirm] = useState<string | null>(null);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeId) || null, [tabs, activeId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme);
    saveSettings(settings);
  }, [settings]);
  useEffect(() => { saveRecents(recents); }, [recents]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (viewerRef.current) setContainerWidth(viewerRef.current.clientWidth - 36);
    });
    if (viewerRef.current) ro.observe(viewerRef.current);
    return () => ro.disconnect();
  }, [activeId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInputRef.current?.click(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchMode(true); setTimeout(()=>document.getElementById('search-input')?.focus(),50); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeId) closeTab(activeId); }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowMetadata(false); setLinkConfirm(null); setPasswordModal(null); }
      if (e.key === '?' && e.shiftKey) { setShowShortcuts(v => !v); }
      if (e.key === 'F11') { e.preventDefault(); document.documentElement.requestFullscreen?.(); }
      if (e.key === 'ArrowRight' && activeTab?.viewMode === 'single') goPage(activeTab.currentPage + 1);
      if (e.key === 'ArrowLeft' && activeTab?.viewMode === 'single') goPage(activeTab.currentPage - 1);
      if (e.key === '+' || (e.key === '=' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); zoomIn(); }
      if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomOut(); }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setZoomMode('fit-width'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activeId, activeTab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('file');
    if (demo) console.log('Requested file param:', demo);
    const onDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files) handleFiles(Array.from(e.dataTransfer.files)); };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);
    window.addEventListener('drop', onDrop as any);
    window.addEventListener('dragover', onDragOver as any);
    window.addEventListener('dragleave', onDragLeave as any);
    return () => { window.removeEventListener('drop', onDrop as any); window.removeEventListener('dragover', onDragOver as any); window.removeEventListener('dragleave', onDragLeave as any); };
  }, []);

  const updateTab = useCallback((id: string, patch: Partial<TabState> | ((t: TabState) => Partial<TabState>)) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...(typeof patch === 'function' ? (patch as any)(t) : patch) } : t));
  }, []);

  const closeTab = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (activeId === id) {
        if (next.length) setActiveId(next[Math.max(0, idx - 1)].id);
        else setActiveId(null);
      }
      const removed = prev.find(t => t.id === id);
      try { (removed?.pdfDoc as any)?.destroy?.(); } catch {}
      return next;
    });
  };

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue;
      if (file.size > MAX_FILE_SIZE) {
        alert(`File too large (${formatFileSize(file.size)}). Limit is ${formatFileSize(MAX_FILE_SIZE)} to prevent decompression bombs.`);
        continue;
      }
      const tab = makeTab({ fileName: file.name, fileSize: file.size, fileHandle: file });
      const buf = await file.arrayBuffer();
      tab.arrayBuffer = buf.slice(0);
      setTabs(prev => [...prev, tab]);
      setActiveId(tab.id);
      setTimeout(() => loadPdf(tab.id, buf), 80);
      setRecents(prev => {
        const entry: RecentEntry = { name: file.name, lastOpened: new Date().toISOString(), page: 1, fileSize: file.size };
        const filtered = prev.filter(r => r.name !== file.name);
        return [entry, ...filtered].slice(0, 12);
      });
    }
  };

  const loadPdf = async (tabId: string, buffer: ArrayBuffer, password?: string) => {
    try {
      const loadingTask = (PDFJS as any).getDocument({
        data: new Uint8Array(buffer),
        password: password || undefined,
        ...PDF_LOAD_OPTIONS,
        disableRange: false,
        stopAtErrors: false,
      });
      loadingTask.onPassword = (callback: (p: string) => void, reason: number) => {
        setPasswordModal({ tabId, message: reason === 2 ? 'Incorrect password. Try again.' : 'This document is password-protected.' });
        (window as any).__velocepwcb = callback;
      };
      const pdf = await loadingTask.promise;
      setPasswordModal(null);
      const outline = await fetchOutline(pdf);
      const metadata = await fetchMetadata(pdf, buffer.byteLength);
      updateTab(tabId, {
        pdfDoc: pdf, pageCount: pdf.numPages, currentPage: 1, outline, metadata,
        error: null, passwordRequired: false,
      });
      try {
        const meta2 = await pdf.getMetadata();
        const hasSig = JSON.stringify(meta2?.info || {}).toLowerCase().includes('sig');
        if (hasSig) console.warn('Document contains signatures — edits may invalidate them');
      } catch {}
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/password|encrypted/i.test(e?.name + ' ' + msg)) {
        updateTab(tabId, { error: 'Password required', passwordRequired: true });
        setPasswordModal({ tabId, message: 'This document is password-protected. Enter password to open.' });
        (window as any).__velocepwcb = (pw: string) => loadPdf(tabId, buffer, pw);
      } else {
        console.error(e);
        updateTab(tabId, { error: msg || 'Failed to open document. File may be corrupted or unsupported.' });
      }
    }
  };

  const goPage = (n: number) => {
    if (!activeTab) return;
    const clamped = Math.max(1, Math.min(activeTab.pageCount, n));
    updateTab(activeTab.id, { currentPage: clamped });
    const el = document.querySelector(`[data-page="${clamped}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (settings.rememberHistory) {
      setRecents(prev => prev.map(r => r.name === activeTab.fileName ? { ...r, page: clamped, lastOpened: new Date().toISOString() } : r));
    }
  };

  const zoomIn = () => {
    if (!activeTab) return;
    const idx = ZOOM_LEVELS.indexOf(Math.round(activeTab.zoom * 100) / 100);
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, idx + 1)] ?? activeTab.zoom * 1.2;
    updateTab(activeTab.id, { zoom: Math.min(3, next), zoomMode: 'custom' });
  };
  const zoomOut = () => {
    if (!activeTab) return;
    const idx = ZOOM_LEVELS.indexOf(Math.round(activeTab.zoom * 100) / 100);
    const next = ZOOM_LEVELS[Math.max(0, idx - 1)] ?? activeTab.zoom / 1.2;
    updateTab(activeTab.id, { zoom: Math.max(0.25, next), zoomMode: 'custom' });
  };
  const setZoomMode = (mode: TabState['zoomMode']) => {
    if (!activeTab) return;
    if (mode === 'fit-width' || mode === 'fit-page') {
      (async () => {
        try {
          if (activeTab.pdfDoc) {
            const page = await (activeTab.pdfDoc as any).getPage(activeTab.currentPage);
            const vp = page.getViewport({ scale: 1, rotation: activeTab.rotation });
            let z = 1;
            if (mode === 'fit-width') z = (containerWidth - 24) / vp.width;
            if (mode === 'fit-page') {
              const vh = (viewerRef.current?.clientHeight || 800) - 80;
              z = Math.min((containerWidth - 24) / vp.width, vh / vp.height);
            }
            updateTab(activeTab.id, { zoom: Math.max(0.25, Math.min(3, z)), zoomMode: mode });
          } else {
            updateTab(activeTab.id, { zoomMode: mode, zoom: mode === 'fit-width' ? 1.15 : 0.85 });
          }
        } catch { updateTab(activeTab.id, { zoomMode: mode }); }
      })();
    } else {
      updateTab(activeTab.id, { zoomMode: mode, zoom: 1 });
    }
  };
  const setViewMode = (vm: ViewMode) => activeTab && updateTab(activeTab.id, { viewMode: vm });
  const rotate = () => activeTab && updateTab(activeTab.id, { rotation: ((activeTab.rotation + 90) % 360) as TabState['rotation'] });

  const handleSearch = useCallback(async (query: string) => {
    if (!activeTab || !activeTab.pdfDoc) return;
    const q = query.trim();
    if (!q) { updateTab(activeTab.id, { searchQuery: '', searchResults: [], searchIndex: 0 }); return; }
    updateTab(activeTab.id, { searchQuery: q, searchResults: [], searchIndex: 0 });
    const pdf = activeTab.pdfDoc as any;
    const results: SearchResult[] = [];
    const tabId = activeTab.id;
    const controller = new AbortController();
    (window as any).__veloceSearchAbort = controller;
    for (let p = 1; p <= activeTab.pageCount; p++) {
      if (controller.signal.aborted) break;
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const text = (tc.items as any[]).map(i => i.str).join(' ');
        const lower = text.toLowerCase();
        const lq = q.toLowerCase();
        let idx = 0, occ = 0;
        while ((idx = lower.indexOf(lq, idx)) !== -1) {
          const snippet = text.slice(Math.max(0, idx - 40), idx + lq.length + 40).replace(/\s+/g, ' ');
          results.push({ page: p, index: occ++, snippet, matchIdx: results.length });
          idx += lq.length;
          if (results.length > 500) break;
        }
        updateTab(tabId, { searchResults: [...results] });
        await new Promise(r => setTimeout(r, 0));
      } catch {}
    }
    if (results.length) goPage(results[0].page);
  }, [activeTab]);

  const searchNext = () => {
    if (!activeTab || !activeTab.searchResults.length) return;
    const next = (activeTab.searchIndex + 1) % activeTab.searchResults.length;
    updateTab(activeTab.id, { searchIndex: next });
    goPage(activeTab.searchResults[next].page);
  };
  const searchPrev = () => {
    if (!activeTab || !activeTab.searchResults.length) return;
    const prev = (activeTab.searchIndex - 1 + activeTab.searchResults.length) % activeTab.searchResults.length;
    updateTab(activeTab.id, { searchIndex: prev });
    goPage(activeTab.searchResults[prev].page);
  };

  const addAnnotation = (ann: Annotation) => {
    if (!activeTab) return;
    updateTab(activeTab.id, t => ({
      annotations: [...t.annotations, ann],
      undoStack: [...t.undoStack, t.annotations],
      redoStack: [],
      isModified: true,
    }));
  };
  const undo = () => {
    if (!activeTab || !activeTab.undoStack.length) return;
    updateTab(activeTab.id, t => {
      const prev = t.undoStack[t.undoStack.length - 1];
      return { annotations: prev, undoStack: t.undoStack.slice(0, -1), redoStack: [...t.redoStack, t.annotations] };
    });
  };
  const redo = () => {
    if (!activeTab || !activeTab.redoStack.length) return;
    updateTab(activeTab.id, t => {
      const nxt = t.redoStack[t.redoStack.length - 1];
      return { annotations: nxt, redoStack: t.redoStack.slice(0, -1), undoStack: [...t.undoStack, t.annotations] };
    });
  };
  const deleteAnnotationsForPage = (page: number) => {
    if (!activeTab) return;
    updateTab(activeTab.id, t => ({
      annotations: t.annotations.filter(a => a.page !== page),
      undoStack: [...t.undoStack, t.annotations],
      redoStack: [],
      isModified: true,
    }));
  };

  const handleSave = async (asFile = false) => {
    if (!activeTab || !activeTab.arrayBuffer) return;
    const warnSig = JSON.stringify(activeTab.metadata || {}).toLowerCase().includes('sig');
    if (warnSig) {
      if (!confirm('This document may contain digital signatures. Saving will invalidate existing signatures. Continue?')) return;
    }
    try {
      let outBytes: Uint8Array | null = null;
      if (activeTab.annotations.length) {
        try {
          const { PDFDocument, PDFName, PDFString, PDFArray, PDFNumber } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.load(activeTab.arrayBuffer!);
          for (const ann of activeTab.annotations) {
            if (ann.kind !== 'highlight' || !ann.rect) continue;
            const page = pdfDoc.getPage(ann.page - 1);
            const { width, height } = page.getSize();
            const x = ann.rect.x * width;
            const y = (1 - ann.rect.y - ann.rect.h) * height;
            const w = ann.rect.w * width;
            const h = ann.rect.h * height;
            const colorArr = PDFArray.withContext(pdfDoc.context);
            colorArr.push(PDFNumber.of(1)); colorArr.push(PDFNumber.of(0.92)); colorArr.push(PDFNumber.of(0.23));
            const annot = (pdfDoc.context as any).obj({
              Type: PDFName.of('Annot'),
              Subtype: PDFName.of('Highlight'),
              Rect: pdfDoc.context.obj([PDFNumber.of(x), PDFNumber.of(y), PDFNumber.of(x + w), PDFNumber.of(y + h)]),
              QuadPoints: pdfDoc.context.obj([PDFNumber.of(x), PDFNumber.of(y + h), PDFNumber.of(x + w), PDFNumber.of(y + h), PDFNumber.of(x), PDFNumber.of(y), PDFNumber.of(x + w), PDFNumber.of(y)]),
              C: colorArr,
              Contents: PDFString.of(ann.content || 'Highlight'),
              F: PDFNumber.of(4),
              Border: PDFArray.withContext(pdfDoc.context),
            });
            const annots = page.node.get(PDFName.of('Annots'));
            if (annots instanceof PDFArray) annots.push(annot);
            else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annot]));
          }
          outBytes = await pdfDoc.save();
        } catch (e) { console.warn('pdf-lib save failed, fallback', e); }
      }
      const blob = new Blob([outBytes ? (outBytes as unknown as BlobPart) : activeTab.arrayBuffer!], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asFile ? `edited-${sanitizeFilename(activeTab.fileName)}` : sanitizeFilename(activeTab.fileName);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      updateTab(activeTab.id, { isModified: false });
    } catch (e: any) { alert('Save failed: ' + (e?.message || String(e))); }
  };

  const handleExportText = async () => {
    if (!activeTab?.pdfDoc) return;
    let full = '';
    for (let i = 1; i <= activeTab.pageCount; i++) {
      const page = await (activeTab.pdfDoc as any).getPage(i);
      const tc = await page.getTextContent();
      const txt = (tc.items as any[]).map(it => it.str).join(' ');
      full += `\n--- Page ${i} ---\n` + txt;
    }
    if (!full.trim()) {
      alert('No extractable text found. This may be an image-only (scanned) PDF. Search requires OCR — enable local OCR in Settings (language packs required).');
      return;
    }
    const blob = new Blob([full], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = activeTab.fileName.replace(/\.pdf$/i, '.txt'); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExportImage = async () => {
    if (!activeTab?.pdfDoc) return;
    const page = await (activeTab.pdfDoc as any).getPage(activeTab.currentPage);
    const viewport = page.getViewport({ scale: 2, rotation: activeTab.rotation });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx as any, viewport, canvas }).promise;
    canvas.toBlob(b => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a'); a.href = url; a.download = `${activeTab.fileName.replace(/\.pdf$/i,'')}-p${activeTab.currentPage}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };

  const toggleTheme = () => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : s.theme === 'dark' ? 'system' : 'light' }));

  const renderViewer = () => {
    if (!activeTab) {
      return (
        <div className="viewer" style={{ justifyContent: 'center' }}>
          <div className="welcome">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-fg)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>V</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}>VelocePDF</h1>
                <div className="small muted">Fast • Private • Open-source</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap:'wrap' }}>
                <span className="kbd">⌘O</span><span className="small muted">Open</span>
                <span className="kbd">⌘F</span><span className="small muted">Search</span>
                <span className="kbd">?</span><span className="small muted">Help</span>
              </div>
            </div>
            <p>Opening, reading, searching and annotating PDFs — instantly, even for large documents on modest hardware. No accounts, no cloud, no telemetry.</p>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>Open PDF</button>
              <button className="btn" onClick={() => setShowShortcuts(v => !v)}>Keyboard shortcuts</button>
              <button className="btn btn-ghost" onClick={() => window.open('https://github.com/TheronRadley/velocepdf','_blank')}>GitHub</button>
              <span className="small muted" style={{ marginLeft: 'auto' }}>Drop PDFs anywhere • Tabs • Print • Annotations</span>
            </div>
            <div className="feature-grid">
              <div className="feature"><h3>⚡ Instant reading</h3><p>Visible-page rendering with bounded prefetch, cancellable search, and worker-isolated parsing. No UI thread blocks.</p></div>
              <div className="feature"><h3>🔒 Private & safe</h3><p>Every file treated as untrusted. JS disabled, launch actions blocked, links confirmed, no network during reading.</p></div>
              <div className="feature"><h3>🎨 Clean & accessible</h3><p>Compact toolbar, collapsible sidebars, light/dark/system, high-DPI, keyboard-first, reduced-motion.</p></div>
            </div>
            {recents.length > 0 && settings.rememberHistory && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Recent ({recents.length}) <button className="btn btn-ghost" style={{ height: 22, padding: '0 8px', fontSize: 11, marginLeft: 8 }} onClick={() => { clearHistory(); setRecents([]); }}>Clear</button></div>
                <div className="col">
                  {recents.map(r => (
                    <div key={r.name} className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--bg)' }}>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div><div className="small muted">Page {r.page} • {r.fileSize ? formatFileSize(r.fileSize) : ''} • {new Date(r.lastOpened).toLocaleDateString()}</div></div>
                      <span className="small muted">Open file again to restore</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="small muted" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              PDF.js • pdf-lib • Tauri • MIT • No JS execution, no external requests, sanitized exports.
            </div>
          </div>
        </div>
      );
    }
    if (activeTab.error) {
      return (
        <div className="viewer">
          <div className="welcome" style={{ borderColor: '#e57373' }}>
            <h1 style={{ color: '#b71c1c' }}>Unable to open document</h1>
            <p style={{ whiteSpace: 'pre-wrap' }}>{activeTab.error}</p>
            <p className="small muted">Common causes: corrupted download, unsupported encryption, or a damaged file. Try re-downloading or opening with another reader to verify. Image-only PDFs open but search will be empty until OCR is used.</p>
            <div className="row"><button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>Open another file</button><button className="btn" onClick={() => closeTab(activeTab.id)}>Close</button></div>
          </div>
        </div>
      );
    }
    if (!activeTab.pdfDoc) {
      return <div className="viewer"><div className="welcome"><p>Loading PDF…</p><div className="small muted">{activeTab.fileName} • {activeTab.fileSize ? formatFileSize(activeTab.fileSize) : ''}</div></div></div>;
    }
    const pages = Array.from({ length: activeTab.pageCount }, (_, i) => i + 1);
    if (activeTab.viewMode === 'single') {
      return (
        <div className="viewer single">
          <PdfPage pdfDoc={activeTab.pdfDoc} pageNumber={activeTab.currentPage} scale={activeTab.zoom} rotation={activeTab.rotation}
            searchResults={activeTab.searchResults} searchIndex={activeTab.searchIndex} searchQuery={activeTab.searchQuery}
            annotations={activeTab.annotations} onCreateAnnotation={addAnnotation} />
          {activeTab.annotations.some(a => a.page === activeTab.currentPage) && (
            <div className="row small"><button className="btn" onClick={() => deleteAnnotationsForPage(activeTab.currentPage)}>Clear annotations on this page</button><span className="muted">Drag on page to highlight • Undo: ⌘Z</span></div>
          )}
        </div>
      );
    }
    if (activeTab.viewMode.startsWith('two-page')) {
      const isCover = activeTab.viewMode === 'two-page-cover';
      const rows: number[][] = [];
      if (isCover) {
        rows.push([1]);
        for (let i = 2; i <= activeTab.pageCount; i += 2) rows.push([i, i + 1].filter(n => n <= activeTab.pageCount));
      } else {
        for (let i = 1; i <= activeTab.pageCount; i += 2) rows.push([i, i + 1].filter(n => n <= activeTab.pageCount));
      }
      return (
        <div className="viewer">
          {rows.map((row, idx) => (
            <div key={idx} className="two-page-row">
              {row.map(pn => (
                <PdfPage key={pn} pdfDoc={activeTab.pdfDoc} pageNumber={pn} scale={activeTab.zoom * 0.9} rotation={activeTab.rotation}
                  searchResults={activeTab.searchResults} searchIndex={activeTab.searchIndex} searchQuery={activeTab.searchQuery}
                  annotations={activeTab.annotations} onCreateAnnotation={addAnnotation} />
              ))}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="viewer">
        {pages.map(pn => (
          <PdfPage key={pn} pdfDoc={activeTab.pdfDoc} pageNumber={pn} scale={activeTab.zoom} rotation={activeTab.rotation}
            searchResults={activeTab.searchResults} searchIndex={activeTab.searchIndex} searchQuery={activeTab.searchQuery}
            annotations={activeTab.annotations} onCreateAnnotation={addAnnotation} />
        ))}
      </div>
    );
  };

  return (
    <div className="app">
      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = ''; }} />

      <div className="toolbar" role="toolbar" aria-label="Document toolbar">
        <div className="toolbar-group">
          <button className="btn btn-ghost btn-icon" aria-label="Toggle sidebar" onClick={() => setSettings(s => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))} title="Toggle sidebar (⌘B)">
            <svg className="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2 3h12M2 8h12M2 13h12" /></svg>
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()} title="Open (⌘O)"><span>Open</span><span className="kbd" style={{ marginLeft: 4 }}>⌘O</span></button>
          <button className="btn" disabled={!activeTab} onClick={() => handleSave(false)} title="Save">Save</button>
          <button className="btn" disabled={!activeTab} onClick={() => handleSave(true)} title="Save a copy">Save As</button>
          <div className="toolbar-sep" />
          <button className="btn" disabled={!activeTab || !activeTab.undoStack.length} onClick={undo} title="Undo (⌘Z)">↩ Undo</button>
          <button className="btn" disabled={!activeTab || !activeTab.redoStack.length} onClick={redo} title="Redo (⇧⌘Z)">↪ Redo</button>
        </div>
        <div className="toolbar-group" style={{ marginLeft: 8 }}>
          <button className="btn btn-icon" disabled={!activeTab} onClick={() => goPage((activeTab?.currentPage || 1) - 1)} aria-label="Previous page">‹</button>
          <div className="row" style={{ gap: 4 }}>
            <input className="input" style={{ width: 54, textAlign: 'center' }} aria-label="Current page" type="number" min={1} max={activeTab?.pageCount || 1}
              value={activeTab?.currentPage || 1} onChange={e => goPage(parseInt(e.target.value) || 1)} />
            <span className="small muted">/ {activeTab?.pageCount || '—'}</span>
          </div>
          <button className="btn btn-icon" disabled={!activeTab} onClick={() => goPage((activeTab?.currentPage || 1) + 1)} aria-label="Next page">›</button>
          <div className="toolbar-sep" />
          <button className="btn btn-icon" disabled={!activeTab} onClick={zoomOut} aria-label="Zoom out">−</button>
          <select className="select" aria-label="Zoom level" value={activeTab ? `${Math.round(activeTab.zoom * 100)}%` : '100%'}
            onChange={e => {
              const v = e.target.value;
              if (v === 'fit-width') setZoomMode('fit-width');
              else if (v === 'fit-page') setZoomMode('fit-page');
              else if (v === 'actual') setZoomMode('fit-actual');
              else { const pct = parseInt(v); if (pct) { const z = pct / 100; updateTab(activeTab!.id, { zoom: z, zoomMode: 'custom' }); } }
            }}>
            <option value="50%">50%</option><option value="75%">75%</option><option value="100%">100%</option>
            <option value="125%">125%</option><option value="150%">150%</option><option value="200%">200%</option>
            <option value="fit-width">Fit width</option><option value="fit-page">Fit page</option><option value="actual">Actual size</option>
          </select>
          <button className="btn btn-icon" disabled={!activeTab} onClick={zoomIn} aria-label="Zoom in">+</button>
          <div className="toolbar-sep" />
          <button className="btn" disabled={!activeTab} onClick={rotate} title="Rotate 90°">⟲ Rotate</button>
          <select className="select" aria-label="View mode" value={activeTab?.viewMode || 'continuous'} onChange={e => setViewMode(e.target.value as ViewMode)} disabled={!activeTab}>
            <option value="continuous">Continuous</option><option value="single">Single page</option><option value="two-page">Two pages</option><option value="two-page-cover">Two pages (cover)</option>
          </select>
        </div>
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost" onClick={() => setSearchMode(v => !v)} aria-label="Search" title="Search (⌘F)"><svg className="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 13 13" /></svg> Search</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setExportMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={exportMenuOpen}>Export ▾</button>
            {exportMenuOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 34, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: 6, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10 }}>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setExportMenuOpen(false); handleExportText(); }} role="menuitem">Extract text (.txt)</button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setExportMenuOpen(false); handleExportImage(); }} role="menuitem">Export page as image (PNG)</button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setExportMenuOpen(false); window.print(); }} role="menuitem">Print…</button>
                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setExportMenuOpen(false); setShowMetadata(true); }} role="menuitem">Document info</button>
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {settings.theme === 'dark' ? '☾' : settings.theme === 'light' ? '☀' : '◑'} {settings.theme}
          </button>
          <button className="btn btn-ghost" onClick={() => setShowShortcuts(true)} aria-label="Help">?</button>
          <button className="btn btn-ghost" onClick={() => setShowMetadata(true)} aria-label="Document info" disabled={!activeTab}>Info</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Open documents">
        {tabs.length === 0 && <div className="small muted" style={{ padding: '8px 12px' }}>No documents open — press Open or drop PDF files here.</div>}
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={activeId === t.id} className={`tab ${activeId === t.id ? 'active' : ''}`} onClick={() => setActiveId(t.id)} title={t.fileName}>
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fileName}</span>
            {t.isModified && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} aria-label="Unsaved changes" />}
            <span className="close" role="button" aria-label={`Close ${t.fileName}`} onClick={e => { e.stopPropagation(); closeTab(t.id); }}>×</span>
          </button>
        ))}
        {tabs.length > 0 && <button className="btn btn-ghost" style={{ marginLeft: 8, height: 26 }} onClick={() => fileInputRef.current?.click()}>+ Open</button>}
      </div>

      <div className={`main ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="sidebar" aria-label="Sidebar" style={{ display: settings.sidebarCollapsed ? 'none' : 'flex' }}>
          <div className="sidebar-header">
            <div className="sidebar-tabs" role="tablist">
              {(['thumbnails', 'outline', 'search', 'annots'] as SidebarTab[]).map(tab => (
                <button key={tab} role="tab" aria-selected={settings.sidebarTab === tab} className={`sidebar-tab ${settings.sidebarTab === tab ? 'active' : ''}`}
                  onClick={() => setSettings(s => ({ ...s, sidebarTab: tab }))}>{tab === 'thumbnails' ? 'Pages' : tab === 'outline' ? 'Outline' : tab === 'search' ? 'Search' : 'Notes'}</button>
              ))}
            </div>
          </div>
          <div className="sidebar-body">
            {!activeTab && <div className="small muted">Open a PDF to see pages, outline, and search.</div>}
            {activeTab && settings.sidebarTab === 'thumbnails' && (
              <div className="col">
                {Array.from({ length: activeTab.pageCount }, (_, i) => i + 1).map(pn => (
                  <ThumbnailCanvas key={pn} pdfDoc={activeTab.pdfDoc} pageNumber={pn} active={pn === activeTab.currentPage} onClick={() => goPage(pn)} />
                ))}
              </div>
            )}
            {activeTab && settings.sidebarTab === 'outline' && (
              <div>
                {!activeTab.outline ? <div className="small muted">No outline available.</div> :
                  activeTab.outline.length === 0 ? <div className="small muted">Outline is empty.</div> :
                    <div className="col">
                      {(() => {
                        const render = (items: PdfOutlineItem[], level = 0): React.ReactNode => items.map((it, idx) => (
                          <React.Fragment key={idx}>
                            <div className={`outline-item level-${Math.min(level, 2)}`} role="button" tabIndex={0}
                              onClick={() => { if (it.pageNumber) goPage(it.pageNumber); else if (it.url && isAllowedUrl(it.url)) setLinkConfirm(it.url); }}
                              onKeyDown={e => e.key === 'Enter' && it.pageNumber && goPage(it.pageNumber)}>
                              {it.title} {it.pageNumber ? <span className="small muted">· p{it.pageNumber}</span> : null}
                            </div>
                            {it.items?.length ? render(it.items, level + 1) : null}
                          </React.Fragment>
                        ));
                        return render(activeTab.outline);
                      })()}
                    </div>
                }
                <div className="small muted" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  Outline built from document bookmarks. Some PDFs have none.
                </div>
              </div>
            )}
            {activeTab && settings.sidebarTab === 'search' && (
              <div className="col">
                <div className="row" style={{ gap: 6 }}>
                  <input id="search-input" className="input" placeholder="Search in document…" value={activeTab.searchQuery} style={{ flex: 1 }}
                    onChange={e => updateTab(activeTab.id, { searchQuery: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSearch(activeTab.searchQuery);
                      if (e.key === 'Escape') { (window as any).__veloceSearchAbort?.abort(); updateTab(activeTab.id, { searchResults: [], searchQuery: '' }); }
                    }} />
                  <button className="btn btn-primary" onClick={() => handleSearch(activeTab.searchQuery)}>Find</button>
                </div>
                <div className="row small muted">
                  <span>{activeTab.searchResults.length} {activeTab.searchResults.length === 1 ? 'match' : 'matches'}</span>
                  {activeTab.searchResults.length > 0 && <><button className="btn" style={{ height: 24, padding: '0 8px' }} onClick={searchPrev}>↑ Prev</button><button className="btn" style={{ height: 24, padding: '0 8px' }} onClick={searchNext}>Next ↓</button><span style={{ marginLeft: 'auto' }}>{activeTab.searchIndex + 1} / {activeTab.searchResults.length}</span></>}
                  <button className="btn btn-ghost" style={{ height: 24, marginLeft: 'auto' }} onClick={() => { (window as any).__veloceSearchAbort?.abort(); updateTab(activeTab.id, { searchResults: [], searchQuery: '' }); }}>Clear</button>
                </div>
                {activeTab.searchResults.length === 0 && activeTab.searchQuery && <div className="small muted">No results — try different term. Image-only PDFs need OCR.</div>}
                <div className="col" style={{ gap: 6 }}>
                  {activeTab.searchResults.slice(0, 200).map((r, i) => (
                    <div key={i} className={`search-result ${i === activeTab.searchIndex ? 'active' : ''}`} onClick={() => { updateTab(activeTab.id, { searchIndex: i }); goPage(r.page); }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>Page {r.page}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.snippet}</div>
                    </div>
                  ))}
                  {activeTab.searchResults.length > 200 && <div className="small muted">Showing first 200 of {activeTab.searchResults.length} (bounded).</div>}
                </div>
              </div>
            )}
            {activeTab && settings.sidebarTab === 'annots' && (
              <div className="col">
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <span className="small" style={{ fontWeight: 600 }}>{activeTab.annotations.length} annotations</span>
                  <button className="btn" style={{ height: 24 }} onClick={undo} disabled={!activeTab.undoStack.length}>Undo</button>
                  <button className="btn" style={{ height: 24 }} onClick={redo} disabled={!activeTab.redoStack.length}>Redo</button>
                  <button className="btn btn-ghost" style={{ height: 24, marginLeft: 'auto' }} onClick={() => { if (confirm('Delete all annotations?')) updateTab(activeTab.id, { annotations: [], undoStack: [...activeTab.undoStack, activeTab.annotations], isModified: true }); }}>Clear all</button>
                </div>
                <div className="small muted">Drag on page background to create highlight. Highlights save as standard PDF annotations.</div>
                <div className="col" style={{ gap: 6 }}>
                  {activeTab.annotations.length === 0 && <div className="small muted">No annotations yet.</div>}
                  {activeTab.annotations.map(a => (
                    <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, background: 'var(--bg)' }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{a.kind} · p{a.page}</span>
                        <button className="btn btn-ghost" style={{ height: 22, padding: '0 6px', fontSize: 11 }} onClick={() => updateTab(activeTab.id, t => ({ annotations: t.annotations.filter(x => x.id !== a.id), undoStack: [...t.undoStack, t.annotations], isModified: true }))}>Delete</button>
                      </div>
                      <div className="small muted">{new Date(a.createdAt).toLocaleString()}</div>
                      <div className="row" style={{ marginTop: 6 }}><button className="btn" style={{ height: 22, fontSize: 11 }} onClick={() => goPage(a.page)}>Go to page</button></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="sidebar-footer small muted">
            <div>VelocePDF 0.1.0 • MIT • <a href="https://github.com/TheronRadley/velocepdf" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>GitHub</a></div>
            <label className="row small" style={{ marginTop: 6 }}><input type="checkbox" checked={settings.rememberHistory} onChange={e => setSettings(s => ({ ...s, rememberHistory: e.target.checked }))} /> Remember reading history</label>
          </div>
        </aside>

        <main ref={viewerRef} className="viewer-shell" tabIndex={0} aria-label="Document viewer" onScroll={e => {
          if (!activeTab || activeTab.viewMode !== 'continuous') return;
          const shell = e.currentTarget;
          const pagesEls = shell.querySelectorAll('[data-page]');
          let best = 1; let bestTop = Infinity;
          pagesEls.forEach(el => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const shellR = shell.getBoundingClientRect();
            const top = Math.abs(r.top - shellR.top);
            if (r.top >= shellR.top - 200 && top < bestTop) { bestTop = top; best = parseInt((el as HTMLElement).dataset.page || '1'); }
          });
          if (best !== activeTab.currentPage) updateTab(activeTab.id, { currentPage: best });
        }}>
          {renderViewer()}
          {dragOver && (
            <div className="drop-overlay" aria-hidden>
              <div className="drop-card"><div style={{ fontSize: 28 }}>📄</div><div style={{ fontWeight: 700, marginTop: 8 }}>Drop PDFs to open</div><div className="small muted">Files are opened locally — no upload.</div></div>
            </div>
          )}
          {searchMode && activeTab && (
            <div style={{ position: 'sticky', bottom: 12, left: 12, right: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ pointerEvents: 'auto', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                <input className="input" style={{ borderRadius: 999, minWidth: 220 }} placeholder="Find…" value={activeTab.searchQuery} autoFocus
                  onChange={e => updateTab(activeTab.id, { searchQuery: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(activeTab.searchQuery); if (e.key === 'Escape') setSearchMode(false); }} />
                <button className="btn" onClick={() => handleSearch(activeTab.searchQuery)}>Find</button>
                {activeTab.searchResults.length > 0 && <><span className="small">{activeTab.searchIndex + 1}/{activeTab.searchResults.length}</span><button className="btn" onClick={searchPrev}>↑</button><button className="btn" onClick={searchNext}>↓</button></>}
                <button className="btn btn-ghost btn-icon" onClick={() => setSearchMode(false)} aria-label="Close search">×</button>
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="statusbar" role="status" aria-live="polite">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {activeTab ? (
            <>
              <span><strong>{activeTab.fileName}</strong> {activeTab.fileSize ? `· ${formatFileSize(activeTab.fileSize)}` : ''} {activeTab.isModified ? '• Modified' : ''}</span>
              <span className="small muted">Page {activeTab.currentPage} of {activeTab.pageCount} • {Math.round(activeTab.zoom * 100)}% • {activeTab.viewMode}</span>
              {activeTab.annotations.length > 0 && <span className="small">{activeTab.annotations.length} annots</span>}
            </>
          ) : <span>VelocePDF — No document open</span>}
        </div>
        <div className="row small muted" style={{ gap: 8 }}>
          <span>{settings.theme} theme</span><span>•</span><span>No network requests during reading</span><span>•</span>
          <button className="btn btn-ghost" style={{ height: 22, fontSize: 11 }} onClick={() => alert('VelocePDF never sends document contents or passwords over the network. See docs/THREAT_MODEL.md.')}>Privacy</button>
        </div>
      </div>

      {passwordModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Password required">
          <div className="modal">
            <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Password required</h2>
            <p className="small muted" style={{ marginTop: 0 }}>{passwordModal.message || 'This file is encrypted.'} Passwords are never stored — used only to open this document and discarded when the tab closes.</p>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const pw = String(fd.get('password') || '');
              const cb = (window as any).__velocepwcb;
              if (cb) cb(pw);
              (e.currentTarget as HTMLFormElement).reset();
            }}>
              <input name="password" type="password" className="input" placeholder="Enter password" autoFocus style={{ width: '100%', marginTop: 8 }} />
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => { setPasswordModal(null); const t = tabs.find(x => x.id === passwordModal.tabId); if (t) closeTab(t.id); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Open</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {linkConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm external link">
          <div className="modal">
            <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Open external link?</h2>
            <p className="small" style={{ wordBreak: 'break-all', background: 'var(--bg-muted)', padding: 10, borderRadius: 10 }}>{linkConfirm}</p>
            <p className="small muted">VelocePDF blocks automatic external requests and only allows http, https, and mailto links after your confirmation.</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setLinkConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { if (isAllowedUrl(linkConfirm)) window.open(linkConfirm, '_blank', 'noopener'); setLinkConfirm(null); }}>Open link</button>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h2 style={{ margin: 0 }}>Keyboard shortcuts</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, fontSize: 13 }}>
              <div><strong>Open</strong> <span className="kbd">⌘/Ctrl O</span><br /><strong>Close tab</strong> <span className="kbd">⌘/Ctrl W</span><br /><strong>Search</strong> <span className="kbd">⌘/Ctrl F</span><br /><strong>Next/Prev result</strong> <span className="kbd">Enter</span> / <span className="kbd">⇧ Enter</span></div>
              <div><strong>Zoom in/out</strong> <span className="kbd">⌘ +</span> <span className="kbd">⌘ -</span><br /><strong>Fit width</strong> <span className="kbd">⌘ 0</span><br /><strong>Fullscreen</strong> <span className="kbd">F11</span><br /><strong>Help</strong> <span className="kbd">?</span></div>
              <div><strong>Next page</strong> <span className="kbd">→</span> (single view)<br /><strong>Prev page</strong> <span className="kbd">←</span><br /><strong>Rotate</strong> <span className="kbd">R</span><br /><strong>Undo/Redo</strong> <span className="kbd">⌘Z</span> <span className="kbd">⇧⌘Z</span></div>
              <div><strong>Text selection</strong> Drag on page<br /><strong>Create highlight</strong> Drag on page background<br /><strong>Sidebar</strong> <span className="kbd">⌘ B</span> (toggle)<br /><strong>Print</strong> <span className="kbd">⌘ P</span></div>
            </div>
            <div className="small muted" style={{ marginTop: 12 }}>All shortcuts work without interfering with text editing. Focus is visible for keyboard navigation.</div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary" onClick={() => setShowShortcuts(false)}>Close</button></div>
          </div>
        </div>
      )}

      {showMetadata && (
        <div className="modal-backdrop" onClick={() => setShowMetadata(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h2 style={{ margin: 0 }}>Document information</h2>
            {!activeTab?.metadata ? <p className="small muted">No document open, or metadata unavailable.</p> : (
              <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
                <div><strong>File:</strong> {activeTab.fileName} {activeTab.fileSize ? `(${formatFileSize(activeTab.fileSize)})` : ''}</div>
                <div><strong>Pages:</strong> {activeTab.metadata.pageCount} {activeTab.metadata.pageSize ? `• ${Math.round(activeTab.metadata.pageSize.width)}×${Math.round(activeTab.metadata.pageSize.height)} pts` : ''}</div>
                {activeTab.metadata.title && <div><strong>Title:</strong> {activeTab.metadata.title}</div>}
                {activeTab.metadata.author && <div><strong>Author:</strong> {activeTab.metadata.author}</div>}
                {activeTab.metadata.subject && <div><strong>Subject:</strong> {activeTab.metadata.subject}</div>}
                {activeTab.metadata.keywords && <div><strong>Keywords:</strong> {activeTab.metadata.keywords}</div>}
                {activeTab.metadata.creator && <div><strong>Creator:</strong> {activeTab.metadata.creator}</div>}
                {activeTab.metadata.producer && <div><strong>Producer:</strong> {activeTab.metadata.producer}</div>}
                {activeTab.metadata.creationDate && <div><strong>Created:</strong> {activeTab.metadata.creationDate}</div>}
                <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-muted)', borderRadius: 10 }}>
                  <div style={{ fontWeight: 600 }}>Privacy & security notes</div>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    <li>JavaScript, launch actions, and automatic external fetches are disabled.</li>
                    <li>Attachments never opened automatically; exports sanitized for path traversal.</li>
                    <li>Passwords held only in memory for current tab.</li>
                    <li>No network requests while reading (verify in DevTools).</li>
                  </ul>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>Scanned PDFs contain no extractable text. Search shows 0 results — use Extract Text to confirm, or run local OCR (optional, not loaded by default).</div>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary" onClick={() => setShowMetadata(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
