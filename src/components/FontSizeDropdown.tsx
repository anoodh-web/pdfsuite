const PRESET_SIZES = [8, 10, 12, 14, 16, 18, 24, 36, 48, 72];

interface Props {
  value: number;
  onChange: (size: number) => void;
}

export default function FontSizeDropdown({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={6}
        max={144}
        list="pdfsuite-font-sizes"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="w-14 rounded border border-ink-500 bg-ink-800 px-1.5 py-1 text-xs text-paper focus:outline-none"
        title="Text size (pt) — pick a preset or type a custom value"
      />
      <datalist id="pdfsuite-font-sizes">
        {PRESET_SIZES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
