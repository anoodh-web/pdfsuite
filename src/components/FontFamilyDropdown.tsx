import type { TextFontFamily } from '../store/useDocumentStore';

const FAMILIES: { value: TextFontFamily; label: string; css: string; group: string }[] = [
  { value: 'Helvetica', label: 'Helvetica', css: '"Helvetica Neue", Arial, sans-serif', group: 'Standard' },
  { value: 'TimesRoman', label: 'Times New Roman', css: '"Times New Roman", Times, serif', group: 'Standard' },
  { value: 'Courier', label: 'Courier New', css: '"Courier New", Courier, monospace', group: 'Standard' },
  { value: 'Display', label: 'Playfair Display', css: '"PDFSuite Display", Georgia, serif', group: 'New' },
  { value: 'Handwriting', label: 'Gochi Hand', css: '"PDFSuite Handwriting", cursive', group: 'New' },
  { value: 'Condensed', label: 'Oswald Condensed', css: '"PDFSuite Condensed", "Arial Narrow", sans-serif', group: 'New' },
  { value: 'Poppins', label: 'Poppins', css: '"PDFSuite Poppins", Arial, sans-serif', group: 'New' },
  { value: 'Montserrat', label: 'Montserrat', css: '"PDFSuite Montserrat", Arial, sans-serif', group: 'New' },
  { value: 'Roboto', label: 'Roboto', css: '"PDFSuite Roboto", Arial, sans-serif', group: 'New' },
  { value: 'OpenSans', label: 'Open Sans', css: '"PDFSuite OpenSans", Arial, sans-serif', group: 'New' },
  { value: 'Merriweather', label: 'Merriweather', css: '"PDFSuite Merriweather", Georgia, serif', group: 'New' },
];

export const FONT_FAMILY_CSS: Record<TextFontFamily, string> = Object.fromEntries(
  FAMILIES.map((f) => [f.value, f.css])
) as Record<TextFontFamily, string>;

interface Props {
  value: TextFontFamily;
  onChange: (family: TextFontFamily) => void;
}

export default function FontFamilyDropdown({ value, onChange }: Props) {
  const current = FAMILIES.find((f) => f.value === value) ?? FAMILIES[0];
  const standard = FAMILIES.filter((f) => f.group === 'Standard');
  const newOnes = FAMILIES.filter((f) => f.group === 'New');

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TextFontFamily)}
      style={{ fontFamily: current.css }}
      className="w-36 rounded border border-ink-500 bg-ink-800 px-1.5 py-1 text-xs text-paper focus:outline-none"
      title="Font family"
    >
      <optgroup label="Standard">
        {standard.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.css }}>
            {f.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="New">
        {newOnes.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.css }}>
            {f.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
