import { useRef, useState } from 'react';
import {
  Search,
  FilePlus2,
  Layers,
  Edit3,
  PenTool,
  FileOutput,
  ListOrdered,
  MessageSquarePlus,
  ScanText,
  Eraser,
  Lock,
  FileUp,
  GitCompare,
  Crop,
  X,
} from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Tool {
  icon: typeof FilePlus2;
  title: string;
  desc: string;
  run: (ctx: ReturnType<typeof useDocumentStore.getState>, activeDocId: string | null) => void;
}

const TOOLS: Tool[] = [
  {
    icon: FilePlus2,
    title: 'Create PDF from Image',
    desc: 'Pick one or more PNGs/JPEGs — each becomes a page in a new PDF.',
    run: () => {}, // handled specially — opens a file picker, see below
  },
  {
    icon: Layers,
    title: 'Combine Files',
    desc: 'Merge every currently open PDF into one document.',
    run: (ctx) => ctx.mergeAllOpenDocuments(),
  },
  {
    icon: FileUp,
    title: 'Word to PDF',
    desc: 'Convert a .docx file into a new PDF.',
    run: (ctx) => ctx.setActiveRibbonTab('Convert'),
  },
  {
    icon: Crop,
    title: 'Crop Page',
    desc: 'Trim margins or extract a section of the page.',
    run: (ctx) => {
      ctx.setActiveRibbonTab('Page Layout');
      ctx.setActiveTool('crop');
    },
  },
  {
    icon: GitCompare,
    title: 'Compare PDF',
    desc: 'Highlight visual differences against another version.',
    run: (ctx) => ctx.setActiveRibbonTab('Convert'),
  },
  {
    icon: Edit3,
    title: 'Type Text',
    desc: 'Add a new text box anywhere on the page.',
    run: (ctx) => {
      ctx.setActiveRibbonTab('Home');
      ctx.setActiveTool('type-text');
    },
  },
  {
    icon: PenTool,
    title: 'Sign Document',
    desc: 'Draw, type, or upload a signature to place on the page.',
    run: (ctx) => {
      ctx.setActiveRibbonTab('Protect');
      ctx.setActiveTool('signature');
    },
  },
  {
    icon: Lock,
    title: 'Fill & Sign a Form',
    desc: 'Fill detected form fields or add a signature.',
    run: (ctx, activeDocId) => {
      ctx.setActiveRibbonTab('Forms');
      ctx.setActiveTool('select');
      if (activeDocId) ctx.loadFormFields(activeDocId);
    },
  },
  {
    icon: FileOutput,
    title: 'Export PDF',
    desc: 'Convert this document to Word or PNG.',
    run: (ctx) => ctx.setActiveRibbonTab('Convert'),
  },
  {
    icon: ListOrdered,
    title: 'Organize Pages',
    desc: 'Rotate, insert, delete, extract, or reorder pages.',
    run: (ctx) => ctx.setActiveRibbonTab('Page Layout'),
  },
  {
    icon: MessageSquarePlus,
    title: 'Add Comment',
    desc: 'Place a sticky note on the page.',
    run: (ctx) => {
      ctx.setActiveRibbonTab('Edit');
      ctx.setActiveTool('note');
    },
  },
  {
    icon: ScanText,
    title: 'Make Searchable (OCR)',
    desc: 'Recognize text on a scanned page and make it searchable.',
    run: (ctx) => ctx.setActiveRibbonTab('OCR'),
  },
  {
    icon: Eraser,
    title: 'Redact / Erase Content',
    desc: 'Permanently black out or remove sensitive content.',
    run: (ctx) => {
      ctx.setActiveRibbonTab('Edit');
      ctx.setActiveTool('redact');
    },
  },
  {
    icon: Lock,
    title: 'Protect with Password',
    desc: 'Add an open/owner password and set permissions.',
    run: (ctx) => ctx.setActiveRibbonTab('Protect'),
  },
];

export default function RightPanel() {
  const { isRightPanelOpen, toggleRightPanel, activeId, createPdfFromImages } = useDocumentStore();
  const [query, setQuery] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!isRightPanelOpen) return null;

  const filtered = TOOLS.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.desc.toLowerCase().includes(query.toLowerCase())
  );

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) await createPdfFromImages(files);
    e.target.value = '';
  };

  const runTool = (tool: Tool) => {
    if (tool.title === 'Create PDF from Image') {
      imageInputRef.current?.click();
      return;
    }
    tool.run(useDocumentStore.getState(), activeId);
  };

  return (
    <div className="flex w-72 flex-col border-l border-ink-600 bg-ink-800">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={handleImageChange}
      />
      <div className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
        <span className="text-sm font-medium text-paper/90">Tools</span>
        <X
          size={14}
          className="cursor-pointer text-muted hover:text-paper"
          onClick={toggleRightPanel}
        />
      </div>
      <div className="border-b border-ink-600 p-2">
        <div className="flex items-center gap-2 rounded-md bg-ink-700 px-2 py-1.5">
          <Search size={14} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools"
            className="w-full bg-transparent text-xs text-paper placeholder:text-muted focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted">No tools match "{query}".</p>
        )}
        {filtered.map((tool) => (
          <button
            key={tool.title}
            onClick={() => runTool(tool)}
            className="flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-ink-600"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <tool.icon size={16} strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-[13px] font-medium text-paper/90">{tool.title}</div>
              <div className="text-[11px] leading-snug text-muted">{tool.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
