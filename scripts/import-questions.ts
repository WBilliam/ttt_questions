import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { normalizeRows, type SourceRow } from "./importer";
import type { QuestionBank, QuestionImage, QuizQuestion } from "../src/types";

interface ContentConfig {
  workbook: string;
  imagesDir: string;
  contentMode: "demo" | "production";
}

const projectRoot = process.cwd();
const outputDir = path.resolve(projectRoot, "public/generated");

function assertInside(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Μη ασφαλής διαδρομή: ${child}`);
}

async function readRows(workbookPath: string): Promise<SourceRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Το βιβλίο εργασίας δεν περιέχει φύλλο.");
  const headers = sheet.getRow(1).values as unknown[];
  const headerIndex = new Map<string, number>();
  headers.forEach((value, index) =>
    headerIndex.set(
      String(value ?? "")
        .trim()
        .toLowerCase(),
      index
    )
  );
  const required = ["category", "question", "option_a", "option_b", "correct_option"];
  const missing = required.filter((name) => !headerIndex.has(name));
  if (missing.length) throw new Error(`Λείπουν οι στήλες: ${missing.join(", ")}`);
  const value = (row: ExcelJS.Row, name: string) =>
    String(row.getCell(headerIndex.get(name) ?? 0).text ?? "");
  const rows: SourceRow[] = [];
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (!row.hasValues) continue;
    rows.push({
      rowNumber: number,
      category: value(row, "category"),
      question: value(row, "question"),
      option_a: value(row, "option_a"),
      option_b: value(row, "option_b"),
      option_c: value(row, "option_c"),
      option_d: value(row, "option_d"),
      option_e: value(row, "option_e"),
      option_f: value(row, "option_f"),
      correct_option: value(row, "correct_option"),
      explanation: value(row, "explanation"),
      image: value(row, "image"),
      image_alt: value(row, "image_alt")
    });
  }
  return rows;
}

async function processImage(imagesDir: string, filename: string): Promise<QuestionImage> {
  const source = path.resolve(imagesDir, filename);
  assertInside(imagesDir, source);
  const bytes = await readFile(source);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const image = sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true });
  const metadata = await sharp(bytes).metadata();
  const fallbackExtension = metadata.hasAlpha ? "png" : "jpg";
  const imagesOutput = path.join(outputDir, "images");
  await mkdir(imagesOutput, { recursive: true });
  await image
    .clone()
    .webp({ quality: 82 })
    .toFile(path.join(imagesOutput, `${hash}.webp`));
  if (fallbackExtension === "png")
    await image
      .clone()
      .png({ compressionLevel: 9 })
      .toFile(path.join(imagesOutput, `${hash}.png`));
  else
    await image
      .clone()
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(path.join(imagesOutput, `${hash}.jpg`));
  return {
    webpSrc: `generated/images/${hash}.webp`,
    fallbackSrc: `generated/images/${hash}.${fallbackExtension}`,
    alt: ""
  };
}

async function main(): Promise<void> {
  const config = JSON.parse(
    await readFile(path.join(projectRoot, "content/content.config.json"), "utf8")
  ) as ContentConfig;
  const workbookPath = path.resolve(projectRoot, config.workbook);
  const imagesDir = path.resolve(projectRoot, config.imagesDir);
  assertInside(projectRoot, workbookPath);
  assertInside(projectRoot, imagesDir);
  assertInside(path.resolve(projectRoot, "public"), outputDir);
  const imageNames = new Set(await readdir(imagesDir));
  const result = normalizeRows(await readRows(workbookPath), imageNames);
  result.warnings.forEach((warning) => console.warn(`ΠΡΟΕΙΔΟΠΟΙΗΣΗ: ${warning}`));
  if (result.errors.length) throw new Error(`Η εισαγωγή απέτυχε:\n${result.errors.join("\n")}`);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const questions: QuizQuestion[] = [];
  for (const sourceQuestion of result.questions) {
    const { sourceImage, imageAlt, ...question } = sourceQuestion;
    if (!sourceImage) questions.push(question);
    else {
      const processed = await processImage(imagesDir, sourceImage);
      questions.push({
        ...question,
        image: { ...processed, alt: imageAlt ?? "Εικόνα που συνοδεύει την ερώτηση" }
      });
    }
  }
  const contentVersion = createHash("sha256")
    .update(JSON.stringify(questions))
    .digest("hex")
    .slice(0, 16);
  const bank: QuestionBank = {
    schemaVersion: 1,
    contentVersion,
    contentMode: config.contentMode,
    questions
  };
  await writeFile(
    path.join(outputDir, "question-bank.json"),
    `${JSON.stringify(bank, null, 2)}\n`,
    "utf8"
  );
  const counts = new Map<string, number>();
  questions.forEach((question) =>
    counts.set(question.category, (counts.get(question.category) ?? 0) + 1)
  );
  console.log(
    `Εισαγωγή: ${questions.length} ερωτήσεις, ${questions.filter((question) => question.image).length} με εικόνα.`
  );
  counts.forEach((count, category) => console.log(`- ${category}: ${count}`));
  console.log(`Προειδοποιήσεις: ${result.warnings.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
