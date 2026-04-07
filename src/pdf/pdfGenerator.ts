import PDFDocument from "pdfkit";

import type { EstimateResult } from "../estimator/index.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

export type PdfDocKind = "inspection_report" | "estimate_summary" | "duct_cleaning";

export type InspectionReportInput = {
  title?: string;
  customerName?: string;
  address?: string;
  jobOrEstimateId?: string;
  dateIso?: string;
  findings: string[];
  recommendations: string[];
  photosNote?: string;
};

export type DuctCleaningReportInput = {
  title?: string;
  customerName?: string;
  address?: string;
  supplyVents?: number;
  returnVents?: number;
  mainTrunksCleaned?: boolean;
  sanitizeApplied?: boolean;
  beforeAfterNote?: string;
  technicianNotes?: string;
};

function renderHeader(
  doc: PdfDoc,
  title: string,
  meta: { customerName?: string; address?: string; jobOrEstimateId?: string; dateIso?: string },
) {
  doc.fontSize(18).text(title, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10);
  if (meta.dateIso) doc.text(`Date: ${meta.dateIso}`);
  if (meta.customerName) doc.text(`Customer: ${meta.customerName}`);
  if (meta.address) doc.text(`Address: ${meta.address}`);
  if (meta.jobOrEstimateId) doc.text(`Reference: ${meta.jobOrEstimateId}`);
  doc.moveDown();
}

function section(doc: PdfDoc, heading: string, lines: string[]) {
  doc.fontSize(12).text(heading, { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(10);
  for (const line of lines) {
    doc.text(`• ${line}`, { indent: 12 });
  }
  doc.moveDown();
}

export function buildInspectionReportPdf(input: InspectionReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderHeader(doc, input.title ?? "HVAC Inspection Report", {
      customerName: input.customerName,
      address: input.address,
      jobOrEstimateId: input.jobOrEstimateId,
      dateIso: input.dateIso ?? new Date().toISOString().slice(0, 10),
    });

    section(doc, "Findings", input.findings.length > 0 ? input.findings : ["No findings recorded."]);
    section(doc, "Recommendations", input.recommendations.length > 0 ? input.recommendations : ["None at this time."]);
    if (input.photosNote) {
      doc.fontSize(10).text(`Photos / attachments: ${input.photosNote}`);
    }
    doc.moveDown();
    doc.fontSize(9).fillColor("#666666").text(
      "This document was generated from the in-repo template. Replace with your branded PDF layout by setting PDF_TEMPLATE_DIR.",
      { align: "center" },
    );
    doc.end();
  });
}

export function buildEstimateSummaryPdf(estimate: EstimateResult, meta?: {
  customerName?: string;
  address?: string;
  jobOrEstimateId?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderHeader(doc, "Estimate Summary", {
      customerName: meta?.customerName,
      address: meta?.address,
      jobOrEstimateId: meta?.jobOrEstimateId,
      dateIso: new Date().toISOString().slice(0, 10),
    });

    doc.fontSize(11).text("Line items", { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(10);
    for (const line of estimate.lines) {
      doc.text(
        `${line.description}  ×${line.quantity} @ ${estimate.currency} ${line.unitPrice.toFixed(2)} = ${estimate.currency} ${line.lineTotal.toFixed(2)}`,
      );
    }
    doc.moveDown();
    doc.text(`Subtotal: ${estimate.currency} ${estimate.subtotal.toFixed(2)}`);
    doc.text(`Tax (${(estimate.taxRate * 100).toFixed(2)}%): ${estimate.currency} ${estimate.taxAmount.toFixed(2)}`);
    doc.fontSize(12).text(`Total: ${estimate.currency} ${estimate.total.toFixed(2)}`);
    if (estimate.notes.length > 0) {
      doc.moveDown();
      section(doc, "Estimator notes", estimate.notes);
    }
    doc.moveDown();
    doc.fontSize(9).fillColor("#666666").text(
      "Sync this estimate to Housecall Pro before customer delivery when using official proposals.",
      { align: "center" },
    );
    doc.end();
  });
}

export function buildDuctCleaningPdf(input: DuctCleaningReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderHeader(doc, input.title ?? "Duct Cleaning Completion Report", {
      customerName: input.customerName,
      address: input.address,
      dateIso: new Date().toISOString().slice(0, 10),
    });

    const details: string[] = [];
    if (input.supplyVents !== undefined) details.push(`Supply vents serviced: ${input.supplyVents}`);
    if (input.returnVents !== undefined) details.push(`Return vents serviced: ${input.returnVents}`);
    details.push(`Main trunks addressed: ${input.mainTrunksCleaned ? "Yes" : "Not specified"}`);
    details.push(`Sanitize / deodorize: ${input.sanitizeApplied ? "Yes" : "No"}`);
    section(doc, "Service summary", details);
    if (input.beforeAfterNote) {
      section(doc, "Before / after", [input.beforeAfterNote]);
    }
    if (input.technicianNotes) {
      section(doc, "Technician notes", [input.technicianNotes]);
    }
    doc.fontSize(9).fillColor("#666666").text(
      "Template output — swap for your customer-facing duct cleaning report PDF.",
      { align: "center" },
    );
    doc.end();
  });
}

export async function buildPdf(kind: PdfDocKind, payload: unknown): Promise<Buffer> {
  switch (kind) {
    case "inspection_report":
      return buildInspectionReportPdf(payload as InspectionReportInput);
    case "estimate_summary":
      return buildEstimateSummaryPdf(
        (payload as { estimate: EstimateResult }).estimate,
        (payload as { meta?: { customerName?: string; address?: string; jobOrEstimateId?: string } }).meta,
      );
    case "duct_cleaning":
      return buildDuctCleaningPdf(payload as DuctCleaningReportInput);
    default:
      throw new Error(`Unknown PDF kind: ${kind}`);
  }
}
