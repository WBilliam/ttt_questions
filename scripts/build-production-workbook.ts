import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";

interface ExtractedRow extends Record<string, string | number | null> {
  category: string;
  question: string;
  correct_option: string;
}

const headers = [
  "category",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "option_f",
  "correct_option",
  "explanation",
  "image",
  "image_alt",
  "source",
  "source_index"
] as const;

const root = process.cwd();
const productionDir = path.join(root, "content/production");
const rows = JSON.parse(
  await readFile(path.join(productionDir, "questions.json"), "utf8")
) as ExtractedRow[];
const workbook = new ExcelJS.Workbook();
workbook.creator = "Practice Quiz content pipeline";
workbook.created = new Date(0);
workbook.modified = new Date(0);
const sheet = workbook.addWorksheet("Questions", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }]
});
sheet.addRow(headers);
rows.forEach((row) =>
  sheet.addRow(
    headers.map((header) => {
      const value = row[header];
      return value === "" || value == null ? null : value;
    })
  )
);
sheet.getRow(1).font = {
  name: "Arial",
  size: 10,
  bold: true,
  color: { argb: "FFFFFFFF" }
};
sheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF173F35" }
};
sheet.getRow(1).alignment = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true
};
sheet.getRow(1).height = 28;
const widths = [28, 58, 38, 38, 38, 38, 38, 38, 14, 30, 27, 52, 48, 14];
sheet.columns.forEach((column, index) => {
  column.width = widths[index];
});
sheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
});
sheet.autoFilter = { from: "A1", to: `N${rows.length + 1}` };
await mkdir(productionDir, { recursive: true });
const workbookPath = path.join(productionDir, "questions.xlsx");
await workbook.xlsx.writeFile(workbookPath);
const archive = await JSZip.loadAsync(await readFile(workbookPath));
const stableArchiveDate = new Date("1980-01-01T00:00:00.000Z");
for (const entry of Object.values(archive.files)) entry.date = stableArchiveDate;
await writeFile(
  workbookPath,
  await archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS"
  })
);
console.log(`Δημιουργήθηκε workbook παραγωγής με ${rows.length} ερωτήσεις.`);
