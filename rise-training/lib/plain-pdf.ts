const widths = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const extraWidths: Record<string, number> = { '\u2013': 556, '\u2014': 1000, '\u2026': 1000 };

const winAnsi: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87,
  '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91,
  '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02DC': 0x98,
  '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F,
};

export const pdfPage = { width: 595.28, height: 841.89 };

export function textWidth(value: string, size: number, bold = false) {
  let units = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 32;
    const base = extraWidths[character] ?? (code >= 32 && code <= 126 ? widths[code - 32] : 800);
    units += bold ? base * 1.07 : base;
  }
  return units * size / 1000;
}

export function wrapText(value: string, size: number, maxWidth: number, bold = false) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (textWidth(word, size, bold) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const character of word) {
      const trial = chunk + character;
      if (chunk && textWidth(trial, size, bold) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else chunk = trial;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

export type Rgb = readonly [number, number, number];

function num(value: number) {
  return String(Math.round(value * 100) / 100);
}

function pdfString(value: string) {
  let out = '(';
  for (const character of value) {
    let code = winAnsi[character];
    if (code == null) {
      if (character === '\n' || character === '\r' || character === '\t') code = 0x20;
      else {
        const point = character.codePointAt(0) ?? 0x3f;
        code = point >= 32 && point <= 126 || point >= 160 && point <= 255 ? point : 0x3f;
      }
    }
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

export class PdfWriter {
  private readonly pages: string[][] = [];

  addPage() {
    this.pages.push([]);
    return this.pages.length - 1;
  }

  text(page: number, value: string, x: number, y: number, size: number, color: Rgb, bold = false) {
    if (!value) return;
    const font = bold ? 'F2' : 'F1';
    this.pages[page].push(`${color.map(num).join(' ')} rg BT /${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm ${pdfString(value)} Tj ET`);
  }

  line(page: number, x1: number, x2: number, y: number, color: Rgb, width: number) {
    this.pages[page].push(`${color.map(num).join(' ')} RG ${num(width)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`);
  }

  footer(label: string, color: Rgb) {
    const total = this.pages.length;
    this.pages.forEach((_, index) => {
      this.text(index, label, 56, 32, 8, color);
      if (total < 2) return;
      const page = String(index + 1);
      this.text(index, page, pdfPage.width - 56 - textWidth(page, 8), 32, 8, color);
    });
  }

  toBytes() {
    const streams = this.pages.map((commands) => `${commands.join('\n')}\n`);
    return encodePdf(streams.length ? streams : ['\n']);
  }
}

function encodePdf(streams: string[]) {
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    font('Helvetica'),
    font('Helvetica-Bold'),
  ];
  const kids: number[] = [];
  for (const stream of streams) {
    if ([...stream].some((character) => character.charCodeAt(0) > 126)) throw new Error('PDF text must stay in WinAnsi');
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    kids.push(objects.length + 1);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfPage.width} ${pdfPage.height}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) out += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let index = 0; index < out.length; index += 1) bytes[index] = out.charCodeAt(index);
  return bytes;
}
