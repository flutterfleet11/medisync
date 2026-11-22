import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ExportFormat = "csv" | "xlsx" | "json" | "pdf";
export const EXPORT_FORMATS: ExportFormat[] = ["csv", "xlsx", "json", "pdf"];

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null;
  width?: number; // relative width for PDF / Excel
}

export interface Table<T> {
  title: string;
  subtitle: string;
  columns: Column<T>[];
  rows: T[];
}

const MIME: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
  pdf: "application/pdf",
};

export function mimeFor(format: ExportFormat) {
  return MIME[format];
}

function cells<T>(t: Table<T>) {
  return t.rows.map((r) => t.columns.map((c) => c.value(r)));
}

export function toCsv<T>(t: Table<T>): Uint8Array {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection (=, +, -, @ at the start of text cells).
    const safe = typeof v === "string" && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [t.columns.map((c) => esc(c.header)).join(","), ...cells(t).map((row) => row.map(esc).join(","))];
  return new TextEncoder().encode("﻿" + lines.join("\r\n") + "\r\n"); // BOM so Excel reads UTF-8
}

export function toJson<T>(t: Table<T>): Uint8Array {
  const data = t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.header, c.value(r)])));
  return new TextEncoder().encode(JSON.stringify({ title: t.title, generated: t.subtitle, count: data.length, data }, null, 2));
}

export async function toXlsx<T>(t: Table<T>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MediSync";
  wb.created = new Date();
  const ws = wb.addWorksheet(t.title.slice(0, 31));
  ws.columns = t.columns.map((c) => ({ header: c.header, key: c.header, width: Math.max(10, (c.width ?? 1) * 14) }));
  for (const row of cells(t)) ws.addRow(row);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function clean(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—·]/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

export async function toPdf<T>(t: Table<T>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`MediSync - ${t.title}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89; // A4 landscape
  const H = 595.28;
  const M = 32;
  const size = 8;
  const rowH = 16;
  const totalW = t.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const colW = t.columns.map((c) => ((c.width ?? 1) / totalW) * (W - 2 * M));

  const fit = (text: string, width: number, f = font) => {
    let s = clean(text);
    if (f.widthOfTextAtSize(s, size) <= width - 6) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > width - 6) s = s.slice(0, -1);
    return s + "...";
  };

  let page = doc.addPage([W, H]);
  let y = H - M;
  const drawHeader = (first: boolean) => {
    if (first) {
      page.drawText(clean(`MediSync - ${t.title}`), { x: M, y: y - 14, size: 15, font: bold, color: rgb(0.04, 0.12, 0.23) });
      page.drawText(clean(t.subtitle), { x: M, y: y - 30, size: 9, font, color: rgb(0.4, 0.45, 0.55) });
      y -= 46;
    }
    page.drawRectangle({ x: M, y: y - rowH + 4, width: W - 2 * M, height: rowH, color: rgb(0.04, 0.12, 0.23) });
    let x = M;
    t.columns.forEach((c, i) => {
      page.drawText(fit(c.header, colW[i], bold), { x: x + 3, y: y - 8, size, font: bold, color: rgb(1, 1, 1) });
      x += colW[i];
    });
    y -= rowH;
  };
  drawHeader(true);

  cells(t).forEach((row, ri) => {
    if (y - rowH < M + 16) {
      page = doc.addPage([W, H]);
      y = H - M;
      drawHeader(false);
    }
    if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 4, width: W - 2 * M, height: rowH, color: rgb(0.96, 0.97, 0.98) });
    let x = M;
    row.forEach((v, i) => {
      page.drawText(fit(v == null ? "" : String(v), colW[i]), { x: x + 3, y: y - 8, size, font, color: rgb(0.1, 0.12, 0.16) });
      x += colW[i];
    });
    y -= rowH;
  });

  if (t.rows.length === 0) page.drawText("No records.", { x: M, y: y - 12, size: 10, font, color: rgb(0.4, 0.45, 0.55) });
  doc.getPages().forEach((p, i, all) =>
    p.drawText(`Page ${i + 1} of ${all.length}`, { x: W - M - 60, y: M - 14, size: 8, font, color: rgb(0.4, 0.45, 0.55) }),
  );
  return doc.save();
}

export async function render<T>(t: Table<T>, format: ExportFormat): Promise<Uint8Array> {
  switch (format) {
    case "csv":
      return toCsv(t);
    case "json":
      return toJson(t);
    case "xlsx":
      return toXlsx(t);
    case "pdf":
      return toPdf(t);
  }
}
