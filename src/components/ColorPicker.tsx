import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Ban } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';

interface Props {
  value: string;
  onChange: (color: string) => void;
  allowNoFill?: boolean;
  onNoFill?: () => void;
  label?: string;
  automaticColor?: string; // color applied by "Automatic" — defaults to black
}

const THEME_COLORS = [
  '#FFFFFF',
  '#000000',
  '#E7E6E6',
  '#1F4E79',
  '#2E75B6',
  '#ED7D31',
  '#2E8B57',
  '#5FB3F0',
  '#B98CE0',
  '#6FCF97',
];

// tints/shades under each theme color above, lightest to darkest — 5 per column
const TINT_COLUMNS = [
  ['#F2F2F2', '#D9D9D9', '#BFBFBF', '#A6A6A6', '#808080'],
  ['#7F7F7F', '#595959', '#404040', '#262626', '#0D0D0D'],
  ['#D6DCE4', '#ADB9CA', '#8497B0', '#5B7296', '#333F50'],
  ['#DAE3F3', '#B4C7E7', '#8FAADC', '#2E5395', '#1F3864'],
  ['#DEEBF6', '#BDD7EE', '#9DC3E6', '#2E75B6', '#1F4E79'],
  ['#FBE0D0', '#F7CBAB', '#F4B183', '#C55A11', '#833C00'],
  ['#DCE8DC', '#B9D2B9', '#96BC96', '#548754', '#375A37'],
  ['#DDEBF9', '#BBDBF6', '#98C7F0', '#3E9BE0', '#2A6CA0'],
  ['#EDE1F5', '#DBC3EB', '#C9A5E1', '#9A5FC7', '#6B3F8A'],
  ['#E2F3E9', '#C5E7D3', '#A8DBBD', '#4FAE79', '#357854'],
];

const STANDARD_COLORS = [
  '#C00000',
  '#FF0000',
  '#FFC000',
  '#FFFF00',
  '#92D050',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#002060',
  '#7030A0',
];

const PANEL_WIDTH = 292;

export default function ColorPicker({
  value,
  onChange,
  allowNoFill,
  onNoFill,
  label,
  automaticColor = '#000000',
}: Props) {
  const [open, setOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const recentColors = useDocumentStore((s) => s.recentColors);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the panel using fixed viewport coordinates computed from the
  // trigger button, and render it via a portal straight into <body> — this
  // is what lets it float completely outside the ribbon strip's bounds
  // (which clips overflow both ways because of its horizontal scroll),
  // instead of getting cut off or forcing a scrollbar.
  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = 430;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow > estimatedHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - estimatedHeight - 4);
      const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8);
      setPanelPos({ top, left: Math.max(8, left) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // If the document (or anything else) scrolls while the panel is open,
    // close it rather than leaving it floating in a fixed spot disconnected
    // from the button that opened it — capture:true so this catches scroll
    // on any ancestor, including the PDF canvas's own scroll container.
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const pick = (c: string) => {
    onChange(c);
    setOpen(false);
  };

  const Swatch = ({ c }: { c: string }) => (
    <button
      onClick={() => pick(c)}
      title={c}
      className={`h-[22px] w-[22px] shrink-0 rounded-sm border transition-transform hover:z-10 hover:scale-110 ${
        value.toLowerCase() === c.toLowerCase() ? 'border-2 border-accent' : 'border-black/10'
      }`}
      style={{ background: c }}
    />
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-ink-600"
        title={label ?? 'Color'}
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-paper">A</span>
          <span className="h-1 w-4" style={{ background: value }} />
        </div>
        <ChevronDown size={10} className="text-muted" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
            className="z-[9999] rounded-md border border-ink-500 bg-ink-700 p-3 shadow-2xl"
          >
            <button
              onClick={() => pick(automaticColor)}
              className="mb-3 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-paper/90 hover:bg-ink-600"
            >
              <span
                className="h-[18px] w-[18px] shrink-0 rounded-sm border border-black/10"
                style={{ background: automaticColor }}
              />
              Automatic
            </button>

            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Theme Colors
            </div>
            <div className="mb-1 flex gap-[3px]">
              {THEME_COLORS.map((c) => (
                <Swatch key={c} c={c} />
              ))}
            </div>
            <div className="mb-3 flex flex-col gap-[3px]">
              {Array.from({ length: 5 }, (_, row) => (
                <div key={row} className="flex gap-[3px]">
                  {TINT_COLUMNS.map((col, colIdx) => (
                    <Swatch key={`${colIdx}-${row}`} c={col[row]} />
                  ))}
                </div>
              ))}
            </div>

            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Standard Colors
            </div>
            <div className="mb-3 flex gap-[3px]">
              {STANDARD_COLORS.map((c) => (
                <Swatch key={c} c={c} />
              ))}
            </div>

            {recentColors.length > 0 && (
              <>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Recent Colors
                </div>
                <div className="mb-3 flex gap-[3px]">
                  {recentColors.map((c) => (
                    <Swatch key={`recent-${c}`} c={c} />
                  ))}
                </div>
              </>
            )}

            <div className="space-y-0.5 border-t border-ink-600 pt-2">
              {allowNoFill && (
                <button
                  onClick={() => {
                    onNoFill?.();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-paper/90 hover:bg-ink-600"
                >
                  <Ban size={12} /> No Fill
                </button>
              )}
              <label className="flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-paper/90 hover:bg-ink-600">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    pick(e.target.value);
                  }}
                  className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                />
                More Colors…
              </label>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
