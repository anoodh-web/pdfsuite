import { useRef, useState, useEffect } from 'react';
import {
  Hand,
  MousePointer2,
  Type,
  Edit3,
  FileSignature,
  FilePlus2,
  Layers,
  Scissors,
  FileStack,
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
  PlayCircle,
  ArrowRight,
  Bold,
  Italic,
  Underline,
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
import SplitPdfModal from './SplitPdfModal';
import MergePdfModal from './MergePdfModal';
import ImageReorderModal from './ImageReorderModal';
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
    showToast,
    saveAsToLocation,
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
    textBold,
    setTextBold,
    textItalic,
    setTextItalic,
    textUnderline,
    setTextUnderline,
    activeTextBox,
    pageLines,
    lineStyleOverrides,
    setLineStyleOverride,
    activeEditLine,
    setTextBoxFontFamily,
    setTextBoxFontSize,
    toggleTextBoxStyle,
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
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
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

  // Convert tab: explicit "select, then Convert" workflow rather than
  // converting the instant a format/file is picked.
  const [exportFormat, setExportFormat] = useState<'word' | 'png'>('word');
  const [stagedWordFile, setStagedWordFile] = useState<File | null>(null);
  const [stagedImageFiles, setStagedImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // Build real thumbnail previews for staged images (and clean up the
  // object URLs afterward) — this is the actual fix for "I can't see what
  // I selected before converting": there was previously no visual preview
  // at all, just the filename as text.
  useEffect(() => {
    if (stagedImageFiles.length === 0) {
      setImagePreviewUrls([]);
      return;
    }
    const urls = stagedImageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [stagedImageFiles]);

  // When a text box is currently open for editing, the Format controls
  // below act on it directly (and reflect its real current values)
  // instead of only setting the default for the next new box — this is
  // the fix for "changing the font/bold/italic does nothing," which
  // previously had no way to reach whichever box was actually open.
  const activeBoxAnnotation =
    activeTextBox &&
    (annotations[activeTextBox.docId]?.[activeTextBox.page] ?? []).find(
      (a): a is Extract<typeof a, { type: 'text' }> => a.id === activeTextBox.id && a.type === 'text'
    );

  // Same idea, for the Edit tool: when a line of existing PDF text is
  // open for editing, Format controls act on it directly too — using its
  // effective style (a manual override if one exists, otherwise whatever
  // was actually detected in the original PDF), the same resolution
  // export baking uses, so what you see here matches what gets saved.
  const activeLine =
    activeEditLine &&
    (pageLines[activeEditLine.docId]?.[activeEditLine.page] ?? [])[activeEditLine.lineIndex];
  const activeLineOverride =
    activeEditLine &&
    lineStyleOverrides[activeEditLine.docId]?.[activeEditLine.page]?.[activeEditLine.lineIndex];
  const activeLineStyle = activeLine
    ? {
        fontFamily: activeLineOverride?.fontFamily ?? activeLine.fontFamily,
        fontSize: activeLineOverride?.fontSize ?? Math.round(activeLine.fontSizePt),
        bold: activeLineOverride?.bold ?? activeLine.bold,
        italic: activeLineOverride?.italic ?? activeLine.italic,
        underline: activeLineOverride?.underline ?? false,
      }
    : null;

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

  // Export: pick Word or PNG with the toggle buttons, then click Convert
  const handleRunExport = async () => {
    if (!doc) return;
    setConverting(true);
    setConvertError(null);
    try {
      if (exportFormat === 'word') {
        await exportToWord(doc.id);
        showToast('The file has been successfully converted to Word and saved.');
      } else {
        await exportToPng(doc.id);
        showToast('The file has been successfully converted to PNG and saved.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setConvertError(message);
      showToast(`Conversion failed: ${message}`, 'error');
    }
    setConverting(false);
  };

  const handleCompress = async (level: 'easy' | 'medium' | 'hard') => {
    if (!doc) return;
    setConvertError(null);
    setCompressResult(null);
    const result = await compressDocument(doc.id, level);
    if (result) {
      setCompressResult(result);
      showToast(
        `Compressed successfully — ${formatBytes(result.originalSize)} \u2192 ${formatBytes(result.compressedSize)} (${result.savedPct}% smaller).`
      );
    } else {
      setConvertError('Compression failed — see the browser console for details.');
      showToast('Compression failed.', 'error');
    }
  };

  // Import: pick a Word file or image(s) — this only stages the selection
  // (shown next to the Convert button); nothing happens until Convert is
  // actually clicked.
  const handleWordToPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStagedImageFiles([]);
    setStagedWordFile(file);
    setConvertError(null);
  };

  const handleConvertImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setStagedWordFile(null);
    setStagedImageFiles(files);
    setConvertError(null);
  };

  const handleRunImport = async () => {
    if (!stagedWordFile && stagedImageFiles.length === 0) return;
    setConverting(true);
    setConvertError(null);
    try {
      if (stagedWordFile) {
        const result = await convertWordToPdf(stagedWordFile);
        if (!result.ok) {
          setConvertError(result.error);
          showToast(`Conversion failed: ${result.error}`, 'error');
        } else {
          showToast('The file has been successfully converted and saved.');
        }
      } else {
        await createPdfFromImages(stagedImageFiles);
        showToast('The file has been successfully converted and saved.');
      }
      setStagedWordFile(null);
      setStagedImageFiles([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConvertError(message);
      showToast(`Conversion failed: ${message}`, 'error');
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
            <img src="/logo-64.png" alt="PDF Suite Pro" className="h-8 w-8" />
          </div>
          <span className="text-xl font-bold text-white">PDF Suite Pro</span>
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
              <RibbonButton icon={Scissors} label="Split" large disabled={!doc} onClick={() => setShowSplitModal(true)} />
              <RibbonButton icon={FileStack} label="Merge PDFs" large onClick={() => setShowMergeModal(true)} />
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
              <FontFamilyDropdown
                value={
                  activeLineStyle
                    ? activeLineStyle.fontFamily
                    : activeBoxAnnotation
                    ? activeBoxAnnotation.fontFamily ?? 'Helvetica'
                    : textFontFamily
                }
                onChange={(family) => {
                  setTextFontFamily(family);
                  if (activeEditLine) {
                    setLineStyleOverride(activeEditLine.docId, activeEditLine.page, activeEditLine.lineIndex, {
                      fontFamily: family,
                    });
                  } else if (activeTextBox) {
                    setTextBoxFontFamily(activeTextBox.docId, activeTextBox.page, activeTextBox.id, family);
                  }
                }}
              />
              <FontSizeDropdown
                value={
                  activeLineStyle
                    ? activeLineStyle.fontSize
                    : activeBoxAnnotation
                    ? activeBoxAnnotation.fontSize
                    : textFontSize
                }
                onChange={(size) => {
                  setTextFontSize(size);
                  if (activeEditLine) {
                    setLineStyleOverride(activeEditLine.docId, activeEditLine.page, activeEditLine.lineIndex, {
                      fontSize: size,
                    });
                  } else if (activeTextBox) {
                    setTextBoxFontSize(activeTextBox.docId, activeTextBox.page, activeTextBox.id, size);
                  }
                }}
              />
              <RibbonButton
                icon={Bold}
                label="Bold"
                active={activeLineStyle ? activeLineStyle.bold : activeBoxAnnotation ? !!activeBoxAnnotation.bold : textBold}
                onClick={() => {
                  if (activeEditLine && activeLineStyle) {
                    setLineStyleOverride(activeEditLine.docId, activeEditLine.page, activeEditLine.lineIndex, {
                      bold: !activeLineStyle.bold,
                    });
                  } else if (activeTextBox) {
                    toggleTextBoxStyle(activeTextBox.docId, activeTextBox.page, activeTextBox.id, 'bold');
                  } else {
                    setTextBold(!textBold);
                  }
                }}
              />
              <RibbonButton
                icon={Italic}
                label="Italic"
                active={activeLineStyle ? activeLineStyle.italic : activeBoxAnnotation ? !!activeBoxAnnotation.italic : textItalic}
                onClick={() => {
                  if (activeEditLine && activeLineStyle) {
                    setLineStyleOverride(activeEditLine.docId, activeEditLine.page, activeEditLine.lineIndex, {
                      italic: !activeLineStyle.italic,
                    });
                  } else if (activeTextBox) {
                    toggleTextBoxStyle(activeTextBox.docId, activeTextBox.page, activeTextBox.id, 'italic');
                  } else {
                    setTextItalic(!textItalic);
                  }
                }}
              />
              <RibbonButton
                icon={Underline}
                label="Underline"
                active={
                  activeLineStyle
                    ? activeLineStyle.underline
                    : activeBoxAnnotation
                    ? !!activeBoxAnnotation.underline
                    : textUnderline
                }
                onClick={() => {
                  if (activeEditLine && activeLineStyle) {
                    setLineStyleOverride(activeEditLine.docId, activeEditLine.page, activeEditLine.lineIndex, {
                      underline: !activeLineStyle.underline,
                    });
                  } else if (activeTextBox) {
                    toggleTextBoxStyle(activeTextBox.docId, activeTextBox.page, activeTextBox.id, 'underline');
                  } else {
                    setTextUnderline(!textUnderline);
                  }
                }}
              />
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
            <div className="relative flex flex-col items-center justify-center px-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                PDF <ArrowRight size={11} /> Word / PNG
              </div>
              <div className="flex items-center gap-1">
                <RibbonButton
                  icon={FileText}
                  label="Word"
                  large
                  active={exportFormat === 'word'}
                  onClick={() => setExportFormat('word')}
                />
                <RibbonButton
                  icon={ImageIcon}
                  label="PNG"
                  large
                  active={exportFormat === 'png'}
                  onClick={() => setExportFormat('png')}
                />
                <button
                  disabled={!doc || converting}
                  onClick={handleRunExport}
                  className="ml-1 flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-md bg-accent text-[11px] font-medium text-white hover:bg-accent-dim disabled:opacity-40"
                >
                  <PlayCircle size={18} />
                  Convert
                </button>
              </div>
              <div className="pointer-events-none absolute right-0 top-1/2 h-8 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-ink-500 to-transparent" />
            </div>

            <div className="relative flex flex-col items-center justify-center px-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Word / PNG <ArrowRight size={11} /> PDF
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <RibbonButton
                    icon={FileUp}
                    label="Choose Word File"
                    large
                    active={!!stagedWordFile}
                    onClick={() => wordInputRef.current?.click()}
                  />
                  <RibbonButton
                    icon={ImagePlus}
                    label="Choose Images"
                    large
                    active={stagedImageFiles.length > 0}
                    onClick={() => convertImageInputRef.current?.click()}
                  />
                  <button
                    disabled={(!stagedWordFile && stagedImageFiles.length === 0) || converting}
                    onClick={handleRunImport}
                    className="ml-1 flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-md bg-accent text-[11px] font-medium text-white hover:bg-accent-dim disabled:opacity-40"
                  >
                    <PlayCircle size={18} />
                    Convert
                  </button>
                </div>
                {(stagedWordFile || stagedImageFiles.length > 0) && (
                  <div className="flex items-start gap-2 rounded-md border border-ink-500 bg-ink-800 p-1.5">
                    {stagedWordFile ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent-soft text-accent">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="max-w-[140px] truncate text-[11px] text-paper/90">
                            {stagedWordFile.name}
                          </div>
                          <div className="text-[10px] text-muted">
                            {formatBytes(stagedWordFile.size)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {imagePreviewUrls.slice(0, 3).map((url, i) => (
                          <div key={url} className="relative">
                            <img
                              src={url}
                              alt={stagedImageFiles[i]?.name ?? 'preview'}
                              className="h-9 w-9 rounded border border-ink-500 object-cover"
                            />
                            <div className="absolute -left-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white">
                              {i + 1}
                            </div>
                          </div>
                        ))}
                        {stagedImageFiles.length > 3 && (
                          <div className="flex h-9 w-9 items-center justify-center rounded border border-ink-500 bg-ink-700 text-[10px] text-muted">
                            +{stagedImageFiles.length - 3}
                          </div>
                        )}
                        <span className="ml-1 text-[10px] text-muted">
                          {stagedImageFiles.length} image{stagedImageFiles.length > 1 ? 's' : ''}
                        </span>
                        {stagedImageFiles.length > 1 && (
                          <button
                            onClick={() => setShowReorderModal(true)}
                            className="ml-1 rounded border border-accent/50 px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent-soft"
                          >
                            Reorder
                          </button>
                        )}
                      </div>
                    )}
                    <XIcon
                      size={12}
                      className="ml-auto shrink-0 cursor-pointer text-muted hover:text-signal-danger"
                      onClick={() => {
                        setStagedWordFile(null);
                        setStagedImageFiles([]);
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="pointer-events-none absolute right-0 top-1/2 h-8 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-ink-500 to-transparent" />
            </div>

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

      {showSplitModal && doc && (
        <SplitPdfModal docId={doc.id} pageCount={doc.pageCount} onClose={() => setShowSplitModal(false)} />
      )}

      {showMergeModal && <MergePdfModal onClose={() => setShowMergeModal(false)} />}

      {showReorderModal && stagedImageFiles.length > 1 && (
        <ImageReorderModal
          files={stagedImageFiles}
          onConfirm={(reordered) => {
            setStagedImageFiles(reordered);
            setShowReorderModal(false);
          }}
          onClose={() => setShowReorderModal(false)}
        />
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
            if (!doc) return;
            saveAsToLocation(doc.id).then((result) => {
              if (result === 'unsupported') {
                // this browser doesn't support the real folder picker —
                // fall back to the existing filename-only flow, which
                // still saves to the browser's normal Downloads location
                setShowSaveAsModal(true);
              } else if (result === 'saved') {
                showToast('The file has been successfully saved to the chosen location.');
              }
              // 'cancelled' — user closed the dialog, do nothing further
            });
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
