import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RxDetail } from "@/lib/data";
import { ageFrom, explainFrequency, formatDate } from "@/lib/format";
import type { Clinic, Profile } from "@/lib/types";

const NAVY = rgb(0.043, 0.122, 0.227);
const MUTED = rgb(0.39, 0.45, 0.55);
const TEAL = rgb(0.05, 0.58, 0.53);
const LINE = rgb(0.88, 0.9, 0.93);

// Standard PDF fonts only encode WinAnsi; strip anything else to stay safe.
function clean(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderPrescriptionPdf({
  rx,
  clinic,
  patient,
}: {
  rx: RxDetail;
  clinic: Clinic | null;
  patient: Profile | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("MediSync prescription");
  doc.setProducer("MediSync");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M + 40) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (t: string, x: number, size = 10, f = font, color = NAVY) => {
    page.drawText(clean(t), { x, y, size, font: f, color });
  };

  // Header
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
  page.drawText(clean(clinic?.name ?? rx.clinic?.name ?? "Clinic"), { x: M, y: H - 46, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(clean([clinic?.address, clinic?.city].filter(Boolean).join(", ")), { x: M, y: H - 64, size: 9, font, color: rgb(0.8, 0.85, 0.92) });
  page.drawText(clean([clinic?.phone, clinic?.opening_hours].filter(Boolean).join("  |  ")), { x: M, y: H - 78, size: 9, font, color: rgb(0.8, 0.85, 0.92) });
  page.drawText("Rx", { x: W - M - 34, y: H - 58, size: 28, font: bold, color: rgb(0.08, 0.72, 0.65) });
  y = H - 126;

  // Doctor / patient blocks
  const age = ageFrom(patient?.date_of_birth);
  text("DOCTOR", M, 8, bold, MUTED);
  text("PATIENT", W / 2, 8, bold, MUTED);
  y -= 14;
  text(rx.doctor?.display_name ?? "", M, 11, bold);
  text(patient?.full_name ?? rx.patient?.full_name ?? "", W / 2, 11, bold);
  y -= 14;
  text([rx.doctor?.qualification, rx.doctor?.specialty].filter(Boolean).join("  |  "), M, 9, font, MUTED);
  text([age != null ? `${age} years` : null, patient?.gender, patient?.phone].filter(Boolean).join("  |  "), W / 2, 9, font, MUTED);
  y -= 14;
  text(`Date: ${formatDate(rx.consultation?.started_at ?? rx.created_at)}`, M, 9, font, MUTED);
  if (patient?.allergies) text(`Allergies: ${patient.allergies}`, W / 2, 9, bold, rgb(0.75, 0.15, 0.15));
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 22;

  if (rx.consultation?.diagnosis) {
    text("DIAGNOSIS", M, 8, bold, MUTED);
    y -= 14;
    for (const l of wrap(rx.consultation.diagnosis, bold, 11, W - 2 * M)) {
      text(l, M, 11, bold);
      y -= 14;
    }
    y -= 10;
  }

  // Medicines table
  text("MEDICINES", M, 8, bold, MUTED);
  y -= 16;
  const cols = [M, M + 190, M + 290, M + 390, M + 455];
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.96, 0.97, 0.98) });
  ["Medicine", "Dosage", "Frequency", "Duration", "Qty"].forEach((h, i) => text(h, cols[i] + 6, 9, bold, MUTED));
  y -= 24;

  rx.items.forEach((item, idx) => {
    const nameLines = wrap(`${idx + 1}. ${item.medicine_name}`, bold, 10, 180);
    const freq = explainFrequency(item.frequency);
    const instr = item.instructions ? wrap(item.instructions, font, 9, W - 2 * M - 20) : [];
    ensure(16 * nameLines.length + 14 * instr.length + 24);
    nameLines.forEach((l, i) => {
      text(l, cols[0] + 6, 10, bold);
      if (i === 0) {
        text(item.dosage, cols[1] + 6, 10);
        text(item.frequency, cols[2] + 6, 10);
        text(item.duration, cols[3] + 6, 10);
        text(String(item.quantity), cols[4] + 6, 10);
      }
      y -= 14;
    });
    if (freq) {
      page.drawText(clean(freq), { x: cols[2] + 6, y, size: 8, font, color: MUTED });
      y -= 12;
    }
    instr.forEach((l) => {
      page.drawText(l, { x: cols[0] + 18, y, size: 9, font, color: MUTED });
      y -= 12;
    });
    if (item.status === "unavailable") {
      page.drawText("Not available at clinic - buy from a pharmacy exactly as prescribed", { x: cols[0] + 18, y, size: 8, font: bold, color: rgb(0.75, 0.15, 0.15) });
      y -= 12;
    } else if (item.status === "dispensed") {
      page.drawText("Dispensed at clinic", { x: cols[0] + 18, y, size: 8, font: bold, color: TEAL });
      y -= 12;
    }
    y -= 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: LINE });
    y -= 10;
  });

  if (rx.advice || rx.follow_up_date) {
    ensure(60);
    y -= 8;
    if (rx.advice) {
      text("ADVICE", M, 8, bold, MUTED);
      y -= 14;
      for (const l of wrap(rx.advice, font, 10, W - 2 * M)) {
        ensure(14);
        text(l, M, 10);
        y -= 14;
      }
      y -= 6;
    }
    if (rx.follow_up_date) {
      text(`Follow-up: ${formatDate(rx.follow_up_date)}`, M, 10, bold);
      y -= 16;
    }
  }

  // Footer on every page
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: W - M, y: M + 18 }, thickness: 0.5, color: LINE });
    p.drawText(clean(`Digitally issued via MediSync - prescription ${rx.id.slice(0, 8)} - generated ${formatDate(new Date().toISOString())}`), {
      x: M,
      y: M + 4,
      size: 8,
      font,
      color: MUTED,
    });
  }

  return doc.save();
}
