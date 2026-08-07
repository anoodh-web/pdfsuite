import { useEffect, useRef, useState, useCallback } from 'react';
import { FilePlus2, FileWarning, X } from 'lucide-react';
import { TextLayer } from 'pdfjs-dist';
import { useDocumentStore, type Annotation } from '../store/useDocumentStore';
import SignaturePad from './SignaturePad';
import { FONT_FAMILY_CSS } from './FontFamilyDropdown';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const {
    documents,
    activeId,
    currentPage,
    zoom,
    openFile,
    activeTool,
    annotationColor,
    textFontSize,
    textFontFamily,
    setTextBoxBackground,
    annotations,
    addAnnotation,
    updateNoteText,
    updateTextBoxText,
    updateTextBoxPosition,
    updateImagePosition,
    finalizeSignature,
    deleteAnnotation,
    ocrProgress,
    ocrText,
    applyRedactions,
    formFields,
    loadFormFields,
    setFormFieldValue,
    createFormField,
    pageLines,
    loadPageLines,
    lineEdits,
    setLineEdit,
    pendingCrop,
    setPendingCrop,
    undo,
    redo,
    setCurrentPage,
  } = useDocumentStore();

  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [dragNow, setDragNow] = useState<{ x: number; y: number } | null>(null);
  const [inkPoints, setInkPoints] = useState<{ x: number; y: number }[]>([]);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openTextId, setOpenTextId] = useState<string | null>(null);
  const [openSignatureId, setOpenSignatureId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  const doc = documents.find((d) => d.id === activeId);
  const pageAnnotations: Annotation[] = doc
    ? annotations[doc.id]?.[currentPage] ?? []
    : [];

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      if (!doc || !canvasRef.current) return;
      try {
        const page = await doc.proxy.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoom * 1.4 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageSize({ w: viewport.width, h: viewport.height });
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        // build a real, selectable text layer on top of the canvas
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          const textContent = await page.getTextContent();
          const layer = new TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport,
          });
          await layer.render();
        }
      } catch (e) {
        if (!cancelled) setError('Could not render this page.');
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, currentPage, zoom]);

  // Global keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
  // redo, Delete/Backspace removes the selected annotation, Up/Down arrows
  // change page. All of these back off when focus is inside a real text
  // input/textarea/select/contentEditable — otherwise this would hijack
  // normal typing (e.g. Backspace while filling in a form field, or Ctrl+Z
  // while editing a text box) instead of letting the browser handle it.
  useEffect(() => {
    const isTypingTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      const typing = isTypingTarget(document.activeElement);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        // "Select Text & Delete" (erase-text) owns Delete/Backspace itself
        // while it's active — it has its own effect below that turns the
        // current text selection into a real removal. Letting this generic
        // handler also fire on the same keypress was a real bug: both
        // handlers would run, occasionally deleting whatever unrelated
        // annotation was last clicked at the same time as the intended
        // text deletion.
        if (activeTool === 'erase-text') return;
        if (selectedAnnotationId && doc) {
          e.preventDefault();
          deleteAnnotation(doc.id, currentPage, selectedAnnotationId);
          setSelectedAnnotationId(null);
        }
        return;
      }

      if (!typing && doc) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          setCurrentPage(Math.min(doc.pageCount, currentPage + 1));
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          setCurrentPage(Math.max(1, currentPage - 1));
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doc, currentPage, selectedAnnotationId, activeTool, undo, redo, deleteAnnotation, setCurrentPage]);

  // Mouse-wheel page navigation: scrolling down/up steps to the next/previous
  // page (this viewer shows one page at a time rather than a continuously
  // scrolling multi-page canvas, so "scroll to the next page" is implemented
  // as threshold-based page stepping rather than true continuous scroll).
  // Mouse-wheel page navigation: this viewer shows one page at a time
  // rather than a continuously-scrolling multi-page canvas, so "scroll
  // past the end of this page and land on the next one" is implemented as
  // boundary-aware page stepping — native scroll handles everything else.
  // Critically, this only intercepts the wheel event once the container is
  // already scrolled to its top/bottom edge; otherwise the browser's own
  // scroll runs completely untouched. Getting this distinction right fixes
  // two real problems from a naive "accumulate delta and always
  // preventDefault" version: a single page (or any page shorter than the
  // viewport) couldn't scroll at all once a page-change had ever fired,
  // and multi-page docs snapped to the next page instantly instead of
  // letting you see the rest of the current page first.
  const pageChangeCooldown = useRef(false);
  const pendingScrollEdge = useRef<'top' | 'bottom' | null>(null);
  useEffect(() => {
    const container = overlayRef.current?.closest('.pdfsuite-canvas-scroll') as HTMLElement | null;
    if (!container || !doc) return;

    const handleWheel = (e: WheelEvent) => {
      if (pageChangeCooldown.current) return;

      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 2;
      const atTop = container.scrollTop <= 2;
      // if the page content fits entirely within the viewport (no scrollbar
      // needed at all), treat it as both "at top" and "at bottom" so wheel
      // navigation still works immediately, without requiring a scroll first
      const noScrollNeeded = container.scrollHeight <= container.clientHeight + 2;

      if (e.deltaY > 0 && (atBottom || noScrollNeeded) && currentPage < doc.pageCount) {
        e.preventDefault();
        pendingScrollEdge.current = 'top';
        setCurrentPage(currentPage + 1);
        pageChangeCooldown.current = true;
        setTimeout(() => (pageChangeCooldown.current = false), 400);
      } else if (e.deltaY < 0 && (atTop || noScrollNeeded) && currentPage > 1) {
        e.preventDefault();
        pendingScrollEdge.current = 'bottom';
        setCurrentPage(currentPage - 1);
        pageChangeCooldown.current = true;
        setTimeout(() => (pageChangeCooldown.current = false), 400);
      }
      // otherwise: don't preventDefault — let the browser scroll normally
      // within the current page
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [doc, currentPage, setCurrentPage]);

  // After a wheel-triggered page change, land at the matching edge of the
  // new page (top when moving forward, bottom when moving backward) —
  // mirrors how continuous-scroll PDF viewers behave at page boundaries.
  useEffect(() => {
    const container = overlayRef.current?.closest('.pdfsuite-canvas-scroll') as HTMLElement | null;
    if (!container || !pendingScrollEdge.current) return;
    const edge = pendingScrollEdge.current;
    pendingScrollEdge.current = null;
    // run after the new page has rendered and the container's scrollHeight
    // reflects it
    requestAnimationFrame(() => {
      container.scrollTop = edge === 'top' ? 0 : container.scrollHeight;
    });
  }, [currentPage]);

  useEffect(() => {
    if (doc && !formFields[doc.id]) {
      loadFormFields(doc.id);
    }
  }, [doc, formFields, loadFormFields]);

  useEffect(() => {
    if (doc) {
      loadPageLines(doc.id, currentPage);
    }
  }, [doc, currentPage, loadPageLines]);

  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);

  useEffect(() => {
    setEditingLineIndex(null);
  }, [doc, currentPage, activeTool]);

  // "Select text, press Delete" — real content removal for text runs.
  // We reuse the same physical flatten mechanism as manual redaction
  // (applyRedactions), just triggered by a text selection instead of a
  // dragged rectangle, and applied immediately for an "instant" feel.
  useEffect(() => {
    if (activeTool !== 'erase-text' || !doc) return;

    const handler = async (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !textLayerRef.current) return;
      const anchorNode = selection.anchorNode;
      if (!anchorNode || !textLayerRef.current.contains(anchorNode)) return;

      e.preventDefault();
      const overlayRect = textLayerRef.current.getBoundingClientRect();
      const range = selection.getRangeAt(0);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) return;

      for (const r of rects) {
        if (r.width <= 0 || r.height <= 0) continue;
        addAnnotation(doc.id, {
          id: uid(),
          type: 'redact',
          page: currentPage,
          color: '#FFFFFF',
          x: (r.left - overlayRect.left) / overlayRect.width,
          y: (r.top - overlayRect.top) / overlayRect.height,
          w: r.width / overlayRect.width,
          h: r.height / overlayRect.height,
          applied: false,
        });
      }
      selection.removeAllRanges();
      await applyRedactions(doc.id);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, doc, currentPage, addAnnotation, applyRedactions]);

  const relPos = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!doc) return;
    const pos = relPos(e);
    if (activeTool === 'highlight' || activeTool === 'fill' || activeTool === 'redact' || activeTool === 'erase' || activeTool === 'crop') {
      setDrag(pos);
      setDragNow(pos);
    } else if (activeTool === 'ink') {
      setInkPoints([pos]);
    } else if (activeTool === 'note') {
      const note: Annotation = {
        id: uid(),
        type: 'note',
        page: currentPage,
        color: annotationColor,
        x: pos.x,
        y: pos.y,
        text: '',
      };
      addAnnotation(doc.id, note);
      setOpenNoteId(note.id);
    } else if (activeTool === 'type-text') {
      const box: Annotation = {
        id: uid(),
        type: 'text',
        page: currentPage,
        color: annotationColor,
        x: pos.x,
        y: pos.y,
        text: '',
        fontSize: textFontSize,
        fontFamily: textFontFamily,
      };
      addAnnotation(doc.id, box);
      setOpenTextId(box.id);
    } else if (activeTool === 'signature') {
      // placeholder image annotation; filled in once the user types a name
      const sig: Annotation = {
        id: uid(),
        type: 'image',
        page: currentPage,
        color: '#000000',
        x: pos.x,
        y: pos.y,
        w: 0.001,
        h: 0.001,
        dataUrl: '',
      };
      addAnnotation(doc.id, sig);
      setOpenSignatureId(sig.id);
    } else if (
      activeTool === 'form-text' ||
      activeTool === 'form-checkbox' ||
      activeTool === 'form-radio' ||
      activeTool === 'form-dropdown'
    ) {
      const kind = activeTool.replace('form-', '') as
        | 'text'
        | 'checkbox'
        | 'radio'
        | 'dropdown';
      const defaultW = kind === 'checkbox' || kind === 'radio' ? 0.03 : 0.2;
      const defaultH = kind === 'checkbox' || kind === 'radio' ? 0.025 : 0.03;
      createFormField(doc.id, kind, currentPage, pos.x, pos.y, defaultW, defaultH);
    } else {
      setSelectedAnnotationId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if ((activeTool === 'highlight' || activeTool === 'fill' || activeTool === 'redact' || activeTool === 'erase' || activeTool === 'crop') && drag) {
      setDragNow(relPos(e));
    } else if (activeTool === 'ink' && inkPoints.length > 0) {
      setInkPoints((pts) => [...pts, relPos(e)]);
    }
  };

  const handleMouseUp = () => {
    if (!doc) return;
    if ((activeTool === 'highlight' || activeTool === 'fill' || activeTool === 'redact' || activeTool === 'erase' || activeTool === 'crop') && drag && dragNow) {
      const x = Math.min(drag.x, dragNow.x);
      const y = Math.min(drag.y, dragNow.y);
      const w = Math.abs(dragNow.x - drag.x);
      const h = Math.abs(dragNow.y - drag.y);
      if (w > 0.005 && h > 0.005) {
        if (activeTool === 'crop') {
          setPendingCrop({ docId: doc.id, page: currentPage, x, y, w, h });
        } else if (activeTool === 'redact' || activeTool === 'erase') {
          addAnnotation(doc.id, {
            id: uid(),
            type: 'redact',
            page: currentPage,
            color: activeTool === 'redact' ? '#000000' : '#FFFFFF',
            x,
            y,
            w,
            h,
            applied: false,
          });
        } else {
          addAnnotation(doc.id, {
            id: uid(),
            type: 'highlight',
            page: currentPage,
            color: annotationColor,
            x,
            y,
            w,
            h,
            opacity: activeTool === 'fill' ? 1 : 0.35,
          });
        }
      }
      setDrag(null);
      setDragNow(null);
    } else if (activeTool === 'ink' && inkPoints.length > 1) {
      addAnnotation(doc.id, {
        id: uid(),
        type: 'ink',
        page: currentPage,
        color: annotationColor,
        points: inkPoints,
      });
      setInkPoints([]);
    } else {
      setInkPoints([]);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') await openFile(file);
  };

  const userProfile = useDocumentStore((s) => s.userProfile);

  if (!doc) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-ink-900/40 text-center"
      >
        {userProfile ? (
          <>
            <h1
              className="text-3xl font-bold text-accent"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              Welcome back, {userProfile.name.split(' ')[0]}!
            </h1>
            <p className="text-sm text-muted">
              Start editing your documents by opening a file below or dragging one here.
            </p>
          </>
        ) : (
          <>
            <FilePlus2 size={40} strokeWidth={1.25} className="text-muted" />
            <p className="text-sm text-muted">Drop a PDF here, or use Open in the Home tab.</p>
          </>
        )}
      </div>
    );
  }

  const cursorClass =
    activeTool === 'highlight' || activeTool === 'fill' || activeTool === 'ink' || activeTool === 'redact' || activeTool === 'erase' || activeTool === 'crop'
      ? 'cursor-crosshair'
      : activeTool === 'edit-text'
      ? 'cursor-text'
      : activeTool === 'note' ||
        activeTool === 'type-text' ||
        activeTool === 'signature' ||
        activeTool === 'form-text' ||
        activeTool === 'form-checkbox' ||
        activeTool === 'form-radio' ||
        activeTool === 'form-dropdown'
      ? 'cursor-copy'
      : 'cursor-default';

  return (
    <div className="pdfsuite-canvas-scroll h-full flex-1 overflow-auto bg-ink-900/60 p-8">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-signal-danger">
          <FileWarning size={28} />
          <span className="text-sm">{error}</span>
        </div>
      ) : (
        <div className="relative mx-auto h-fit w-fit shadow-2xl">
          <canvas ref={canvasRef} className="block" />
          <div
            ref={textLayerRef}
            className="textLayer"
            style={{
              pointerEvents: activeTool === 'erase-text' ? 'auto' : 'none',
              width: pageSize.w,
              height: pageSize.h,
            }}
          />
          <div
            ref={overlayRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`absolute inset-0 ${cursorClass}`}
            style={{
              width: pageSize.w,
              height: pageSize.h,
              pointerEvents: activeTool === 'erase-text' ? 'none' : 'auto',
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {pageAnnotations
                .filter((a) => a.type === 'highlight')
                .map((a) => (
                  <rect
                    key={a.id}
                    x={`${a.x * 100}%`}
                    y={`${a.y * 100}%`}
                    width={`${a.w * 100}%`}
                    height={`${a.h * 100}%`}
                    fill={a.color}
                    opacity={a.opacity ?? 0.35}
                    style={{
                      pointerEvents: activeTool === 'select' ? 'auto' : 'none',
                      cursor: activeTool === 'select' ? 'pointer' : undefined,
                    }}
                    stroke={selectedAnnotationId === a.id ? '#0A4D68' : 'none'}
                    strokeWidth={selectedAnnotationId === a.id ? 2 : 0}
                    strokeDasharray={selectedAnnotationId === a.id ? '4 3' : undefined}
                    onClick={() => activeTool === 'select' && setSelectedAnnotationId(a.id)}
                  />
                ))}
              {pageAnnotations
                .filter((a) => a.type === 'redact')
                .map((a) => (
                  <rect
                    key={a.id}
                    x={`${a.x * 100}%`}
                    y={`${a.y * 100}%`}
                    width={`${a.w * 100}%`}
                    height={`${a.h * 100}%`}
                    fill={a.color}
                    opacity={1}
                    stroke={
                      selectedAnnotationId === a.id
                        ? '#0A4D68'
                        : a.color === '#FFFFFF'
                        ? '#E3524F'
                        : 'none'
                    }
                    strokeDasharray={
                      selectedAnnotationId === a.id || a.color === '#FFFFFF' ? '4 3' : undefined
                    }
                    strokeWidth={selectedAnnotationId === a.id ? 2 : a.color === '#FFFFFF' ? 1.5 : 0}
                    style={{
                      pointerEvents: activeTool === 'select' ? 'auto' : 'none',
                      cursor: activeTool === 'select' ? 'pointer' : undefined,
                    }}
                    onClick={() => activeTool === 'select' && setSelectedAnnotationId(a.id)}
                  />
                ))}
              {pageAnnotations
                .filter((a) => a.type === 'ink')
                .map((a) => (
                  <g key={a.id}>
                    {activeTool === 'select' && (
                      <polyline
                        points={a.points
                          .map((p) => `${p.x * pageSize.w},${p.y * pageSize.h}`)
                          .join(' ')}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        onClick={() => setSelectedAnnotationId(a.id)}
                      />
                    )}
                    <polyline
                      points={a.points
                        .map((p) => `${p.x * pageSize.w},${p.y * pageSize.h}`)
                        .join(' ')}
                      fill="none"
                      stroke={selectedAnnotationId === a.id ? '#0A4D68' : a.color}
                      strokeWidth={selectedAnnotationId === a.id ? 3.5 : 2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={selectedAnnotationId === a.id ? '5 3' : undefined}
                    />
                  </g>
                ))}
              {drag && dragNow && activeTool !== 'crop' && (
                <rect
                  x={`${Math.min(drag.x, dragNow.x) * 100}%`}
                  y={`${Math.min(drag.y, dragNow.y) * 100}%`}
                  width={`${Math.abs(dragNow.x - drag.x) * 100}%`}
                  height={`${Math.abs(dragNow.y - drag.y) * 100}%`}
                  fill={
                    activeTool === 'redact' ? '#000000' : activeTool === 'erase' ? '#FFFFFF' : annotationColor
                  }
                  opacity={
                    activeTool === 'redact' || activeTool === 'erase' || activeTool === 'fill' ? 1 : 0.35
                  }
                  stroke={activeTool === 'erase' ? '#E3524F' : 'none'}
                  strokeDasharray={activeTool === 'erase' ? '4 3' : undefined}
                />
              )}
              {inkPoints.length > 1 && (
                <polyline
                  points={inkPoints
                    .map((p) => `${p.x * pageSize.w},${p.y * pageSize.h}`)
                    .join(' ')}
                  fill="none"
                  stroke={annotationColor}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {/* Crop marquee: dims everything outside the selected rect so
                it's clear what will be kept, with a dashed accent border
                around the kept area — shown both while dragging and after
                release (until Apply/Cancel in the Page Layout tab). */}
            {activeTool === 'crop' && drag && dragNow && (
              <CropMarquee
                x={Math.min(drag.x, dragNow.x)}
                y={Math.min(drag.y, dragNow.y)}
                w={Math.abs(dragNow.x - drag.x)}
                h={Math.abs(dragNow.y - drag.y)}
              />
            )}
            {!drag && pendingCrop && pendingCrop.docId === doc.id && pendingCrop.page === currentPage && (
              <CropMarquee x={pendingCrop.x} y={pendingCrop.y} w={pendingCrop.w} h={pendingCrop.h} />
            )}

            {pageAnnotations
              .filter((a) => a.type === 'note')
              .map((a) => (
                <div
                  key={a.id}
                  className="absolute"
                  style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                >
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedAnnotationId(a.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenNoteId(openNoteId === a.id ? null : a.id);
                    }}
                    className="flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 text-[11px] font-bold text-black shadow"
                    style={{ background: a.color }}
                  >
                    !
                  </button>
                  {openNoteId === a.id && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute left-3 top-3 z-10 w-52 rounded-md border border-ink-500 bg-ink-700 p-2 shadow-xl"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] uppercase text-muted">Note</span>
                        <div className="flex items-center gap-2">
                          <X
                            size={12}
                            className="cursor-pointer text-muted hover:text-signal-danger"
                            onClick={() => deleteAnnotation(doc.id, currentPage, a.id)}
                          />
                        </div>
                      </div>
                      <textarea
                        autoFocus
                        defaultValue={a.text}
                        onChange={(e) =>
                          updateNoteText(doc.id, currentPage, a.id, e.target.value)
                        }
                        className="h-20 w-full resize-none rounded bg-ink-800 p-1.5 text-xs text-paper focus:outline-none"
                        placeholder="Type a note…"
                      />
                    </div>
                  )}
                </div>
              ))}

            {pageAnnotations
              .filter((a) => a.type === 'text')
              .map((a) => (
                <div
                  key={a.id}
                  draggable={openTextId !== a.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(a.id);
                  }}
                  onDragEnd={(e) => {
                    if (e.clientX === 0 && e.clientY === 0) return; // dropped outside the page
                    const rect = overlayRef.current!.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;
                    updateTextBoxPosition(
                      doc.id,
                      currentPage,
                      a.id,
                      Math.max(0, Math.min(0.95, x)),
                      Math.max(0, Math.min(0.95, y))
                    );
                  }}
                  className="group absolute cursor-move"
                  style={{
                    left: `${a.x * 100}%`,
                    top: `${a.y * 100}%`,
                    minWidth: 90,
                  }}
                  title="Drag to move"
                >
                  {openTextId === a.id ? (
                    <div className="flex items-start gap-1">
                      <textarea
                        autoFocus
                        defaultValue={a.text}
                        onMouseDown={(e) => e.stopPropagation()}
                        onBlur={() => setOpenTextId(null)}
                        onChange={(e) =>
                          updateTextBoxText(doc.id, currentPage, a.id, e.target.value)
                        }
                        style={{
                          color: a.color,
                          fontSize: `${a.fontSize * zoom * 1.4}px`,
                          fontFamily: FONT_FAMILY_CSS[a.fontFamily ?? 'Helvetica'],
                          background: a.bgColor ?? 'rgba(255,255,255,0.9)',
                        }}
                        className="min-h-[1.6em] w-40 cursor-text resize rounded border border-dashed border-accent p-1 leading-tight focus:outline-none"
                        placeholder="Type…"
                      />
                      <X
                        size={12}
                        className="mt-1 cursor-pointer text-signal-danger"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          deleteAnnotation(doc.id, currentPage, a.id);
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        if (activeTool === 'fill') {
                          setTextBoxBackground(doc.id, currentPage, a.id, annotationColor);
                        } else {
                          setOpenTextId(a.id);
                        }
                      }}
                      style={{
                        color: a.color,
                        fontSize: `${a.fontSize * zoom * 1.4}px`,
                        fontFamily: FONT_FAMILY_CSS[a.fontFamily ?? 'Helvetica'],
                        background: a.bgColor,
                      }}
                      className={`whitespace-pre-wrap rounded px-0.5 leading-tight ring-0 group-hover:outline group-hover:outline-1 group-hover:outline-dashed group-hover:outline-accent ${
                        activeTool === 'fill' ? 'cursor-copy' : 'cursor-text hover:bg-accent-soft'
                      }`}
                      title={activeTool === 'fill' ? 'Click to fill this text box\u2019s background' : undefined}
                    >
                      {a.text || '(empty text)'}
                    </span>
                  )}
                </div>
              ))}

            {pageAnnotations
              .filter(
                (a): a is Extract<Annotation, { type: 'image' }> =>
                  a.type === 'image' && !!a.dataUrl
              )
              .map((a) => (
                <img
                  key={a.id}
                  src={a.dataUrl}
                  draggable
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(a.id);
                  }}
                  onDragEnd={(e) => {
                    const rect = overlayRef.current!.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width - a.w / 2;
                    const y = (e.clientY - rect.top) / rect.height - a.h / 2;
                    updateImagePosition(
                      doc.id,
                      currentPage,
                      a.id,
                      Math.max(0, Math.min(1 - a.w, x)),
                      Math.max(0, Math.min(1 - a.h, y))
                    );
                  }}
                  className="group absolute cursor-move border border-transparent hover:border-accent"
                  style={{
                    left: `${a.x * 100}%`,
                    top: `${a.y * 100}%`,
                    width: `${a.w * 100}%`,
                    height: `${a.h * 100}%`,
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(doc.id, currentPage, a.id);
                  }}
                  title="Drag to move, double-click to remove"
                />
              ))}

            {(formFields[doc.id] ?? [])
              .filter((f) => f.page === currentPage)
              .map((f) => (
                <div
                  key={f.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                  }}
                >
                  {f.kind === 'text' && (
                    <input
                      value={f.value}
                      onChange={(e) => setFormFieldValue(doc.id, f.id, e.target.value)}
                      className="h-full w-full border border-accent/60 bg-accent-soft px-1 text-[11px] text-black focus:border-accent focus:outline-none"
                    />
                  )}
                  {f.kind === 'checkbox' && (
                    <input
                      type="checkbox"
                      checked={f.value === 'on'}
                      onChange={(e) =>
                        setFormFieldValue(doc.id, f.id, e.target.checked ? 'on' : '')
                      }
                      className="h-full w-full cursor-pointer accent-accent"
                    />
                  )}
                  {f.kind === 'radio' && (
                    <input
                      type="radio"
                      name={f.fieldName}
                      checked={!!f.optionValue && f.value === f.optionValue}
                      onChange={() =>
                        f.optionValue && setFormFieldValue(doc.id, f.id, f.optionValue)
                      }
                      className="h-full w-full cursor-pointer accent-accent"
                    />
                  )}
                  {f.kind === 'dropdown' && (
                    <select
                      value={f.value}
                      onChange={(e) => setFormFieldValue(doc.id, f.id, e.target.value)}
                      className="h-full w-full border border-accent/60 bg-accent-soft px-1 text-[11px] text-black focus:border-accent focus:outline-none"
                    >
                      <option value="">—</option>
                      {(f.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

            {(pageLines[doc.id]?.[currentPage] ?? []).map((line) => {
              const override = lineEdits[doc.id]?.[currentPage]?.[line.index];
              const hasOverride = override !== undefined && override !== line.text;
              const isEditing = editingLineIndex === line.index;
              const displayText = override ?? line.text;
              const fontPx = Math.max(8, (line.h * pageSize.h) / 1.3);

              // outside Edit mode: only show something if this line has a
              // saved override (so edits stay visible while browsing normally)
              if (activeTool !== 'edit-text' && !hasOverride && !isEditing) return null;

              return (
                <div
                  key={line.index}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute"
                  style={{
                    left: `${line.x * 100}%`,
                    top: `${line.yTop * 100}%`,
                    width: `${Math.max(line.w, 0.02) * 100}%`,
                    height: `${line.h * 100}%`,
                  }}
                >
                  {hasOverride && !isEditing && (
                    <div className="absolute inset-0 -m-0.5 bg-white" />
                  )}
                  {isEditing ? (
                    <input
                      autoFocus
                      defaultValue={displayText}
                      style={{ fontSize: `${fontPx}px`, lineHeight: 1 }}
                      className="absolute inset-0 -m-0.5 w-[calc(100%+4px)] border border-accent bg-white px-0.5 text-black focus:outline-none"
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        setLineEdit(doc.id, currentPage, line.index, e.target.value);
                        setEditingLineIndex(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === 'Escape') {
                          setEditingLineIndex(null);
                        }
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => activeTool === 'edit-text' && setEditingLineIndex(line.index)}
                      className={`absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-0.5 text-black ${
                        activeTool === 'edit-text'
                          ? 'cursor-text hover:outline hover:outline-1 hover:outline-dashed hover:outline-accent'
                          : ''
                      }`}
                      style={{ fontSize: `${fontPx}px`, lineHeight: 1 }}
                    >
                      {hasOverride ? displayText : activeTool === 'edit-text' ? '\u00A0' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {ocrText[doc.id]?.[currentPage] && (
            <div className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-signal-success/20 px-2 py-0.5 text-[10px] text-signal-success">
              Searchable (OCR applied)
            </div>
          )}

          {activeTool === 'erase-text' && (
            <div className="absolute -top-6 right-0 rounded bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
              Select text, then press Delete or Backspace to remove it
            </div>
          )}
        </div>
      )}

      {ocrProgress?.active && (
        <div className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-ink-500 bg-ink-700 px-4 py-2 shadow-xl">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-xs text-paper">
            {ocrProgress.label} — {ocrProgress.pct}%
          </span>
        </div>
      )}

      {openSignatureId && doc && (
        <SignaturePad
          onCancel={() => {
            deleteAnnotation(doc.id, currentPage, openSignatureId);
            setOpenSignatureId(null);
          }}
          onConfirm={(dataUrl, w, h) => {
            const normW = Math.min(0.35, w / (pageSize.w || w));
            const normH = normW * (h / w);
            finalizeSignature(doc.id, currentPage, openSignatureId, dataUrl, normW, normH);
            setOpenSignatureId(null);
          }}
        />
      )}
    </div>
  );
}

function CropMarquee({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const pct = (n: number) => `${n * 100}%`;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* dim everything outside the crop rect, in four bands */}
      <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: pct(y) }} />
      <div className="absolute bg-black/55" style={{ left: 0, bottom: 0, right: 0, top: pct(y + h) }} />
      <div className="absolute bg-black/55" style={{ left: 0, top: pct(y), width: pct(x), height: pct(h) }} />
      <div className="absolute bg-black/55" style={{ right: 0, top: pct(y), left: pct(x + w), height: pct(h) }} />
      <div
        className="absolute border-2 border-dashed border-accent"
        style={{ left: pct(x), top: pct(y), width: pct(w), height: pct(h) }}
      />
    </div>
  );
}
