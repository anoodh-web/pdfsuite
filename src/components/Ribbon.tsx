import { useRef, useState } from 'react';
import {
  Hand,
  MousePointer2,
  Type,
  Edit3,
  FileSignature,
  FilePlus2,
  Layers,
  FileText,
  Send,
  Share2,
  RotateCw,
  Trash2,
  FileOutput,
  Search,
  Wrench,
  Star,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Highlighter,
  StickyNote,
  PenLine,
  FilePlus,
  Download,
  ScanText,
  FileCheck2,
  ImagePlus,
  Eraser,
  PaintBucket,
  ShieldCheck,
  Lock,
  Unlock,
  PenTool,
  TextCursorInput,
  CheckSquare,
  CircleDot,
  ChevronDown,
  Image as ImageIcon,
  Minimize2,
  Crop as CropIcon,
  Check,
  X as XIcon,
  LayoutGrid,
  FileUp,
  GitCompare,
  FolderOpen,
  Printer,
  Mail,
  Smartphone,
} from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import DigitalSignatureModal from './DigitalSignatureModal';
import BatchProcessor from './BatchProcessor';
import OrganizePagesModal from './OrganizePagesModal';
import ComparePdfModal from './ComparePdfModal';
import PropertiesModal from './PropertiesModal';
import SaveAsModal from './SaveAsModal';
import ColorPicker from './ColorPicker';
import FontSizeDropdown from './FontSizeDropdown';
import FontFamilyDropdown from './FontFamilyDropdown';
import BackstageView from './BackstageView';
import UserMenu from './UserMenu';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const TABS = ['File', 'Home', 'Convert', 'Compressor', 'Edit', 'Page Layout', 'OCR', 'Forms', 'Share', 'Protect', 'Batch'];



function RibbonButton({
  icon: Icon,
  label,
  onClick,
  active,
  large,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  large?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] leading-tight text-muted transition-colors hover:bg-ink-600 hover:text-paper disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted ${
        active ? 'bg-accent-soft text-accent' : ''
      } ${large ? 'h-16 w-16' : 'h-9 w-9'}`}
      title={label}
    >
      <Icon size={large ? 20 : 16} strokeWidth={1.75} />
      {large && <span className="text-center">{label}</span>}
    </button>
  );
}

function RibbonGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center px-3" aria-label={title}>
      <div className="flex items-center gap-1">{children}</div>
      <div className="pointer-events-none absolute right-0 top-1/2 h-8 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-ink-500 to-transparent" />
    </div>
  );
}

export default function Ribbon() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const convertImageInputRef = useRef<HTMLInputElement>(null);
  const {
    activeRibbonTab,
    setActiveRibbonTab,
    openFile,
    activeTool,
    setActiveTool,
    documents,
    activeId,
    currentPage,
    setCurrentPage,
    rotatePage,
    deletePage,
    insertBlankPage,
    extractPages,
    mergeAllOpenDocuments,
    exportDocument,
    exportToWord,
    exportToPng,
    compressDocument,
    formFields,
    lineEdits,
    flattenForm,
    createBlankDocument,
    getPrintUrl,
    getShareFile,
    closeDocument,
    setActiveDocument,
    addImageAnnotation,
    runOcrOnPage,
    runOcrOnDocument,
    ocrProgress,
    applyRedactions,
    exportEncrypted,
    removePassword,
    annotations,
    undo,
    redo,
    undoStack,
    redoStack,
    theme,
    toggleTheme,
    annotationColor,
    setAnnotationColor,
    textFontSize,
    setTextFontSize,
    textFontFamily,
    setTextFontFamily,
    findTextInDocument,
    pendingCrop,
    setPendingCrop,
    applyCrop,
    convertWordToPdf,
    createPdfFromImages,
  } = useDocumentStore();

  const doc = documents.find((d) => d.id === activeId);
  const pendingRedactionCount = doc
    ? Object.values(annotations[doc.id] ?? {}).flat().filter((a) => a.type === 'redact' && !a.applied)
        .length
    : 0;
  const pendingLineEditCount = doc
    ? Object.values(lineEdits[doc.id] ?? {}).reduce((sum, page) => sum + Object.keys(page).length, 0)
    : 0;
  const pendingRedactions = pendingRedactionCount + pendingLineEditCount;
  const formFieldCount = doc ? (formFields[doc.id] ?? []).length : 0;

  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotating, setAllowAnnotating] = useState(true);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [showBackstage, setShowBackstage] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const handlePrint = async () => {
    if (!doc) return;
    const url = await getPrintUrl(doc.id);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.print();
      });
    }
  };

  const handleShare = async () => {
    if (!doc) return;
    setShareStatus(null);
    try {
      const file = await getShareFile(doc.id);
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: doc.name });
        setShareStatus('Shared.');
      } else {
        setShareStatus(
          'Your browser doesn\'t support direct sharing here — use "Save As" then attach the file manually, or try this in Edge/Chrome on a phone or a recent desktop build.'
        );
      }
    } catch (e) {
      // user cancelling the native share sheet also lands here — not a real error
      if (e instanceof Error && e.name !== 'AbortError') {
        setShareStatus(`Couldn't share: ${e.message}`);
      }
    }
  };

  const handleEmail = async () => {
    if (!doc) return;
    const subject = encodeURIComponent(doc.name);
    const body = encodeURIComponent(
      `Hi,\n\nPlease find "${doc.name}" attached.\n\n(Note: your email app should open now — you'll need to manually attach the file after using Save As, since browsers can't attach files to emails automatically.)`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [compressResult, setCompressResult] = useState<{
    originalSize: number;
    compressedSize: number;
    savedPct: number;
  } | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState<string | null>(null);

  const handleFind = async () => {
    if (!doc || !findQuery.trim()) return;
    setFindStatus('Searching…');
    const result = await findTextInDocument(doc.id, findQuery, currentPage);
    if (result === null) {
      setFindStatus(`No matches for "${findQuery}".`);
    } else if (result === currentPage) {
      setFindStatus(`Only match is on this page.`);
    } else {
      setCurrentPage(result);
      setFindStatus(`Found on page ${result}.`);
    }
  };

  const handleConvertWord = async () => {
    if (!doc) return;
    setConverting(true);
    setConvertError(null);
    try {
      await exportToWord(doc.id);
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    }
    setConverting(false);
  };

  const handleConvertPng = async () => {
    if (!doc) return;
    setConverting(true);
    setConvertError(null);
    try {
      await exportToPng(doc.id);
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    }
    setConverting(false);
  };

  const handleCompress = async (level: 'easy' | 'medium' | 'hard') => {
    if (!doc) return;
    setConvertError(null);
    setCompressResult(null);
    const result = await compressDocument(doc.id, level);
    if (result) setCompressResult(result);
    else setConvertError('Compression failed — see the browser console for details.');
  };

  const handleWordToPdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setConverting(true);
    setConvertError(null);
    const result = await convertWordToPdf(file);
    if (!result.ok) setConvertError(result.error);
    setConverting(false);
  };

  const handleConvertImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setConverting(true);
    setConvertError(null);
    try {
      await createPdfFromImages(files);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : String(err));
    }
    setConverting(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await openFile(file);
    e.target.value = '';
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && doc) await addImageAnnotation(doc.id, file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col shadow-ribbon">
      <div className="flex h-14 items-center justify-between bg-accent px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/95 p-1 shadow-sm">
            <img src="/logo-64.png" alt="PDF Suite" className="h-8 w-8" />
          </div>
          <span className="text-xl font-bold text-white">PDF Suite</span>
          {doc && <span className="ml-1 text-xs text-white/70">— {doc.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="text-white/80 hover:text-white disabled:opacity-30"
            title="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="text-white/80 hover:text-white disabled:opacity-30"
            title="Redo"
          >
            <Redo2 size={15} />
          </button>
          <button
            onClick={toggleTheme}
            className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <UserMenu />
        </div>
      </div>

      <div className="flex h-9 items-center gap-1 bg-accent-dim px-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => (tab === 'File' ? setShowBackstage(true) : setActiveRibbonTab(tab))}
            className={`relative rounded-t-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeRibbonTab === tab && tab !== 'File'
                ? 'bg-accent text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab}
            {activeRibbonTab === tab && tab !== 'File' && (
              <span className="absolute inset-x-1 -bottom-px h-[3px] rounded-t-sm bg-white" />
            )}
          </button>
        ))}
      </div>

      <div className="flex h-24 items-stretch overflow-x-auto bg-ink-700 px-2 py-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleImageChange}
        />
        <input
          ref={wordInputRef}
          type="file"
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleWordToPdfChange}
        />
        <input
          ref={convertImageInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={handleConvertImagesChange}
        />

        {activeRibbonTab === 'Home' && (
          <>
            <RibbonGroup title="Undo / Redo">
              <RibbonButton
                icon={Undo2}
                label="Undo"
                large
                disabled={undoStack.length === 0}
                onClick={undo}
              />
              <RibbonButton
                icon={Redo2}
                label="Redo"
                large
                disabled={redoStack.length === 0}
                onClick={redo}
              />
            </RibbonGroup>
            <RibbonGroup title="View">
              <RibbonButton icon={Hand} label="Hand" active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} />
              <RibbonButton icon={MousePointer2} label="Select" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
            </RibbonGroup>
            <RibbonGroup title="Document">
              <RibbonButton icon={FilePlus2} label="Open" large onClick={() => fileInputRef.current?.click()} />
              <RibbonButton icon={Layers} label="Combine" large disabled={documents.length < 2} onClick={mergeAllOpenDocuments} />
              <RibbonButton icon={Download} label="Save As" large disabled={!doc} onClick={() => doc && exportDocument(doc.id)} />
            </RibbonGroup>
            <RibbonGroup title="Export">
              <RibbonButton icon={FileText} label="To Word" large disabled={!doc} onClick={() => doc && exportToWord(doc.id)} />
              <RibbonButton icon={ImageIcon} label="To PNG" large disabled={!doc} onClick={() => doc && exportToPng(doc.id)} />
            </RibbonGroup>
            <RibbonGroup title="Collaborate">
              <RibbonButton icon={Send} label="Request eSign" large />
              <RibbonButton icon={Share2} label="Share" large />
            </RibbonGroup>
            <RibbonGroup title="Insert">
              <RibbonButton icon={RotateCw} label="Rotate" disabled={!doc} onClick={() => doc && rotatePage(doc.id, currentPage - 1)} />
              <RibbonButton icon={FileOutput} label="Extract" disabled={!doc} onClick={() => doc && extractPages(doc.id, [currentPage])} />
            </RibbonGroup>
            <RibbonGroup title="Tools">
              <RibbonButton icon={Wrench} label="Add Tools" large />
              <RibbonButton icon={Star} label="Favorites" large />
            </RibbonGroup>
          </>
        )}

        {activeRibbonTab === 'Page Layout' && (
          <>
            <RibbonGroup title="Page">
              <RibbonButton icon={RotateCw} label="Rotate" large disabled={!doc} onClick={() => doc && rotatePage(doc.id, currentPage - 1)} />
              <RibbonButton icon={FilePlus} label="Insert Blank" large disabled={!doc} onClick={() => doc && insertBlankPage(doc.id, currentPage - 1)} />
              <RibbonButton icon={Trash2} label="Delete" large disabled={!doc} onClick={() => doc && deletePage(doc.id, currentPage - 1)} />
            </RibbonGroup>
            <RibbonGroup title="Assemble">
              <RibbonButton icon={FileOutput} label="Extract Page" large disabled={!doc} onClick={() => doc && extractPages(doc.id, [currentPage])} />
              <RibbonButton icon={Layers} label="Combine Open Files" large disabled={documents.length < 2} onClick={mergeAllOpenDocuments} />
            </RibbonGroup>
            <RibbonGroup title="Stamp">
              <RibbonButton icon={ImagePlus} label="Insert Image" large disabled={!doc} onClick={() => imageInputRef.current?.click()} />
            </RibbonGroup>
            <RibbonGroup title="Crop">
              <RibbonButton icon={CropIcon} label="Crop" large active={activeTool === 'crop'} disabled={!doc} onClick={() => setActiveTool('crop')} />
              <RibbonButton
                icon={Check}
                label="Apply Crop"
                large
                disabled={!pendingCrop}
                onClick={() => pendingCrop && applyCrop(pendingCrop.docId, pendingCrop.page, pendingCrop.x, pendingCrop.y, pendingCrop.w, pendingCrop.h)}
              />
              <RibbonButton icon={XIcon} label="Cancel Crop" large disabled={!pendingCrop} onClick={() => setPendingCrop(null)} />
            </RibbonGroup>
            <RibbonGroup title="Organize">
              <RibbonButton icon={LayoutGrid} label="Organize Pages" large disabled={!doc} onClick={() => setShowOrganizeModal(true)} />
            </RibbonGroup>
          </>
        )}

        {activeRibbonTab === 'Edit' && (
          <>
            <RibbonGroup title="Undo / Redo">
              <RibbonButton icon={Undo2} label="Undo" large disabled={undoStack.length === 0} onClick={undo} />
              <RibbonButton icon={Redo2} label="Redo" large disabled={redoStack.length === 0} onClick={redo} />
            </RibbonGroup>
            <RibbonGroup title="Text">
              <RibbonButton icon={Edit3} label="Edit" large active={activeTool === 'edit-text'} onClick={() => setActiveTool('edit-text')} />
              <RibbonButton icon={Type} label="Type Text" large active={activeTool === 'type-text'} onClick={() => setActiveTool('type-text')} />
              <RibbonButton icon={FileSignature} label="Signature" large active={activeTool === 'signature'} onClick={() => setActiveTool('signature')} />
            </RibbonGroup>
            <RibbonGroup title="Markup">
              <RibbonButton icon={Highlighter} label="Highlight" large active={activeTool === 'highlight'} onClick={() => setActiveTool('highlight')} />
              <RibbonButton icon={StickyNote} label="Sticky Note" large active={activeTool === 'note'} onClick={() => setActiveTool('note')} />
              <RibbonButton icon={PenLine} label="Ink" large active={activeTool === 'ink'} onClick={() => setActiveTool('ink')} />
              <RibbonButton icon={MousePointer2} label="Select" large active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
            </RibbonGroup>
            <RibbonGroup title="Edit & Erase">
              <RibbonButton icon={TextCursorInput} label="Select Text & Delete" large active={activeTool === 'erase-text'} onClick={() => setActiveTool('erase-text')} />
              <RibbonButton icon={Eraser} label="Erase Area" large active={activeTool === 'erase'} onClick={() => setActiveTool('erase')} />
              <RibbonButton
                icon={ShieldCheck}
                label={pendingRedactions > 0 ? `Apply (${pendingRedactions})` : 'Apply'}
                large
                disabled={!doc || pendingRedactions === 0}
                onClick={() => doc && applyRedactions(doc.id)}
              />
              <RibbonButton icon={Trash2} label="Delete Page" large disabled={!doc} onClick={() => doc && deletePage(doc.id, currentPage - 1)} />
            </RibbonGroup>
            <RibbonGroup title="Format">
              <ColorPicker value={annotationColor} onChange={setAnnotationColor} label="Annotation color" />
              <RibbonButton icon={PaintBucket} label="Fill" active={activeTool === 'fill'} onClick={() => setActiveTool('fill')} />
              <FontFamilyDropdown value={textFontFamily} onChange={setTextFontFamily} />
              <FontSizeDropdown value={textFontSize} onChange={setTextFontSize} />
            </RibbonGroup>
            <RibbonGroup title="Find">
              <div className="flex items-center gap-1">
                <input
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFind()}
                  placeholder="Find in document…"
                  className="w-36 rounded border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-paper placeholder:text-muted focus:outline-none"
                />
                <RibbonButton icon={Search} label="Find" disabled={!doc || !findQuery.trim()} onClick={handleFind} />
              </div>
              {findStatus && (
                <span className="mt-1 text-[10px] text-muted">{findStatus}</span>
              )}
            </RibbonGroup>
          </>
        )}

        {activeRibbonTab === 'Compressor' && (
          <>
            <RibbonGroup title="Compress">
              <RibbonButton
                icon={Minimize2}
                label="Easy"
                large
                disabled={!doc || !!ocrProgress?.active}
                onClick={() => doc && handleCompress('easy')}
              />
              <RibbonButton
                icon={Minimize2}
                label="Medium"
                large
                disabled={!doc || !!ocrProgress?.active}
                onClick={() => doc && handleCompress('medium')}
              />
              <RibbonButton
                icon={Minimize2}
                label="Hard"
                large
                disabled={!doc || !!ocrProgress?.active}
                onClick={() => doc && handleCompress('hard')}
              />
            </RibbonGroup>
            {compressResult && (
              <div className="flex items-center px-4 text-[11px] text-signal-success">
                {formatBytes(compressResult.originalSize)} → {formatBytes(compressResult.compressedSize)}
                {' '}({compressResult.savedPct}% smaller)
              </div>
            )}
            {convertError && (
              <div className="flex items-center px-4 text-[11px] text-signal-danger">
                {convertError}
              </div>
            )}
          </>
        )}

        {activeRibbonTab === 'Convert' && (
          <>
            <RibbonGroup title="Import">
              <RibbonButton
                icon={FileUp}
                label="Word to PDF"
                large
                disabled={converting}
                onClick={() => wordInputRef.current?.click()}
              />
              <RibbonButton
                icon={ImagePlus}
                label="Image to PDF"
                large
                onClick={() => convertImageInputRef.current?.click()}
              />
            </RibbonGroup>
            <RibbonGroup title="Export">
              <RibbonButton
                icon={FileText}
                label="To Word"
                large
                disabled={!doc || converting}
                onClick={() => doc && handleConvertWord()}
              />
              <RibbonButton
                icon={ImageIcon}
                label="To PNG"
                large
                disabled={!doc || converting}
                onClick={() => doc && handleConvertPng()}
              />
            </RibbonGroup>
            <RibbonGroup title="Analyze">
              <RibbonButton
                icon={GitCompare}
                label="Compare"
                large
                disabled={!doc}
                onClick={() => setShowCompareModal(true)}
              />
            </RibbonGroup>
            {converting && (
              <div className="flex items-center gap-2 px-4 text-[11px] text-accent">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Converting…
              </div>
            )}
            {convertError && (
              <div className="flex items-center px-4 text-[11px] text-signal-danger">
                {convertError}
              </div>
            )}
          </>
        )}

        {activeRibbonTab === 'OCR' && (
          <>
            <RibbonGroup title="Recognize Text">
              <RibbonButton
                icon={ScanText}
                label="Page Searchable"
                large
                disabled={!doc || !!ocrProgress?.active}
                onClick={() => doc && runOcrOnPage(doc.id, currentPage)}
              />
              <RibbonButton
                icon={FileCheck2}
                label="Document Searchable"
                large
                disabled={!doc || !!ocrProgress?.active}
                onClick={() => doc && runOcrOnDocument(doc.id)}
              />
            </RibbonGroup>
          </>
        )}

        {activeRibbonTab === 'Protect' && (
          <>
            <RibbonGroup title="Redact">
              <RibbonButton icon={Eraser} label="Mark Redaction" large active={activeTool === 'redact'} onClick={() => setActiveTool('redact')} />
              <RibbonButton
                icon={ShieldCheck}
                label={pendingRedactions > 0 ? `Apply (${pendingRedactions})` : 'Apply'}
                large
                disabled={!doc || pendingRedactions === 0}
                onClick={() => doc && applyRedactions(doc.id)}
              />
            </RibbonGroup>

            <RibbonGroup title="Cryptographic Sign">
              <RibbonButton
                icon={FileCheck2}
                label="Certificate Sign"
                large
                disabled={!doc}
                onClick={() => setShowSignModal(true)}
              />
            </RibbonGroup>

            <div className="flex flex-col justify-center gap-1 border-l border-ink-500 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-paper/90">
                  <Lock size={12} /> Password Protect
                </div>
                {doc?.wasEncrypted && (
                  <button
                    onClick={() => removePassword(doc.id)}
                    className="flex items-center gap-1 rounded bg-signal-success/20 px-2 py-0.5 text-[10px] font-medium text-signal-success hover:bg-signal-success/30"
                    title="This document was opened with a password — save an unlocked copy"
                  >
                    <Unlock size={11} /> Remove Password & Save Unlocked Copy
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Open password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  className="w-28 rounded bg-ink-800 px-2 py-1 text-[11px] text-paper focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Owner password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="w-28 rounded bg-ink-800 px-2 py-1 text-[11px] text-paper focus:outline-none"
                />
                <label className="flex items-center gap-1 text-[10px] text-muted">
                  <input type="checkbox" checked={allowPrinting} onChange={(e) => setAllowPrinting(e.target.checked)} />
                  Print
                </label>
                <label className="flex items-center gap-1 text-[10px] text-muted">
                  <input type="checkbox" checked={allowCopying} onChange={(e) => setAllowCopying(e.target.checked)} />
                  Copy
                </label>
                <label className="flex items-center gap-1 text-[10px] text-muted">
                  <input type="checkbox" checked={allowModifying} onChange={(e) => setAllowModifying(e.target.checked)} />
                  Edit
                </label>
                <label className="flex items-center gap-1 text-[10px] text-muted">
                  <input type="checkbox" checked={allowAnnotating} onChange={(e) => setAllowAnnotating(e.target.checked)} />
                  Annotate
                </label>
                <button
                  disabled={!doc || (!userPassword && !ownerPassword)}
                  onClick={() =>
                    doc &&
                    exportEncrypted(doc.id, {
                      userPassword,
                      ownerPassword,
                      allowPrinting,
                      allowModifying,
                      allowCopying,
                      allowAnnotating,
                    })
                  }
                  className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-dim disabled:opacity-30"
                >
                  Encrypt & Save
                </button>
              </div>
            </div>
          </>
        )}

        {activeRibbonTab === 'Forms' && (
          <>
            <RibbonGroup title="Fill">
              <RibbonButton icon={MousePointer2} label="Select" large active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
              <RibbonButton icon={PenTool} label="Signature" large active={activeTool === 'signature'} onClick={() => setActiveTool('signature')} />
              <RibbonButton
                icon={FileCheck2}
                label={formFieldCount > 0 ? `${formFieldCount} field(s) found` : 'No fields found'}
                large
                disabled
              />
            </RibbonGroup>
            <RibbonGroup title="Add Field">
              <RibbonButton icon={TextCursorInput} label="Text Field" large active={activeTool === 'form-text'} onClick={() => setActiveTool('form-text')} />
              <RibbonButton icon={CheckSquare} label="Checkbox" large active={activeTool === 'form-checkbox'} onClick={() => setActiveTool('form-checkbox')} />
              <RibbonButton icon={CircleDot} label="Radio" large active={activeTool === 'form-radio'} onClick={() => setActiveTool('form-radio')} />
              <RibbonButton icon={ChevronDown} label="Dropdown" large active={activeTool === 'form-dropdown'} onClick={() => setActiveTool('form-dropdown')} />
            </RibbonGroup>
            <RibbonGroup title="Finish">
              <RibbonButton icon={Download} label="Save As" large disabled={!doc} onClick={() => doc && exportDocument(doc.id)} />
              <RibbonButton
                icon={ShieldCheck}
                label="Flatten & Save"
                large
                disabled={!doc}
                onClick={() => doc && flattenForm(doc.id)}
              />
            </RibbonGroup>
          </>
        )}

        {activeRibbonTab === 'Share' && (
          <>
            <RibbonGroup title="Share">
              <RibbonButton icon={Smartphone} label="Share…" large disabled={!doc} onClick={handleShare} />
              <RibbonButton icon={Mail} label="Email" large disabled={!doc} onClick={handleEmail} />
              <RibbonButton icon={Printer} label="Print" large disabled={!doc} onClick={handlePrint} />
            </RibbonGroup>
            {shareStatus && (
              <div className="flex max-w-sm items-center px-4 text-[11px] text-accent">
                {shareStatus}
              </div>
            )}
          </>
        )}

        {activeRibbonTab === 'Batch' && (
          <>
            <RibbonGroup title="Multi-file">
              <RibbonButton
                icon={Layers}
                label="Open Batch Tool"
                large
                onClick={() => setShowBatchModal(true)}
              />
            </RibbonGroup>
          </>
        )}

        {!['Home', 'Page Layout', 'Edit', 'Convert', 'Compressor', 'OCR', 'Protect', 'Batch', 'Forms', 'File', 'Share'].includes(activeRibbonTab) && (
          <div className="flex items-center px-4 text-sm text-muted">
            <FolderOpen size={16} className="mr-2" />
            "{activeRibbonTab}" tools land in a later phase.
          </div>
        )}
      </div>

      {showSignModal && doc && (
        <DigitalSignatureModal
          docId={doc.id}
          docName={doc.name}
          onClose={() => setShowSignModal(false)}
        />
      )}

      {showBatchModal && <BatchProcessor onClose={() => setShowBatchModal(false)} />}

      {showOrganizeModal && doc && (
        <OrganizePagesModal docId={doc.id} onClose={() => setShowOrganizeModal(false)} />
      )}

      {showCompareModal && doc && (
        <ComparePdfModal docA={doc} onClose={() => setShowCompareModal(false)} />
      )}

      {showPropertiesModal && doc && (
        <PropertiesModal docId={doc.id} onClose={() => setShowPropertiesModal(false)} />
      )}

      {showSaveAsModal && doc && (
        <SaveAsModal
          docId={doc.id}
          currentName={doc.name}
          onClose={() => setShowSaveAsModal(false)}
        />
      )}

      {showBackstage && (
        <BackstageView
          documents={documents}
          activeDoc={doc ?? null}
          onClose={() => setShowBackstage(false)}
          onNew={() => {
            createBlankDocument();
            setShowBackstage(false);
          }}
          onOpenFile={() => {
            fileInputRef.current?.click();
            setShowBackstage(false);
          }}
          onSave={() => doc && exportDocument(doc.id)}
          onSaveAs={() => {
            setShowBackstage(false);
            setShowSaveAsModal(true);
          }}
          onPrint={handlePrint}
          onProperties={() => {
            setShowBackstage(false);
            setShowPropertiesModal(true);
          }}
          onShare={handleShare}
          onEmail={handleEmail}
          onCloseDocument={() => {
            if (doc) closeDocument(doc.id);
            setShowBackstage(false);
          }}
          onSwitchDocument={(id) => setActiveDocument(id)}
        />
      )}
    </div>
  );
}
