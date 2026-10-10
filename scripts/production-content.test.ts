// @vitest-environment node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const expectedCounts: Record<string, number> = {
  "E-KOUROS": 12,
  "Αθλητική Παιδαγωγική": 24,
  "Αθλητική Ψυχολογία": 47,
  Ανατομία: 37,
  Αντιντόπινγκ: 10,
  Βιομηχανική: 47,
  "Γενική Προπονητική": 39,
  "Ειδική Προπονητική": 31,
  Εργοφυσιολογία: 32,
  "Ηθική και Ακεραιότητα": 15,
  "Ιστορία του Ταεκβοντό": 15,
  "Κανονισμοί Αγώνων": 24,
  "Κινητική Μάθηση": 52,
  "Μεθοδολογία Έρευνας": 68,
  "Μεθοδολογία Διδασκαλίας": 20,
  "Οργάνωση και Διοίκηση Αθλητισμού": 65,
  "Παραβίαση Δικαιωμάτων Παιδιού": 15,
  Φυσικοθεραπεία: 53,
  Φυσιολογία: 38,
  "Τεχνική Ανάλυση": 22
};

describe("production question workbook", () => {
  it("contains the reviewed category counts and valid image references", async () => {
    const root = process.cwd();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(root, "content/production/questions.xlsx"));
    const sheet = workbook.worksheets[0];
    expect(sheet).toBeDefined();
    const headers = (sheet.getRow(1).values as unknown[]).map((value) => String(value ?? ""));
    const column = (name: string) => headers.indexOf(name);
    const counts: Record<string, number> = {};
    const images: string[] = [];
    const imageChoices: Record<string, string[]> = {};
    const visibleText: string[] = [];
    const imagePrompts: string[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const category = row.getCell(column("category")).text;
      counts[category] = (counts[category] ?? 0) + 1;
      const prompt = row.getCell(column("question")).text;
      visibleText.push(prompt);
      for (const choice of ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"]) {
        const text = row.getCell(column(choice)).text;
        if (text) visibleText.push(text);
      }
      const image = row.getCell(column("image")).text;
      if (image) {
        images.push(image);
        imagePrompts.push(prompt);
        imageChoices[image] = [
          "option_a",
          "option_b",
          "option_c",
          "option_d",
          "option_e",
          "option_f"
        ]
          .map((choice) => row.getCell(column(choice)).text)
          .filter(Boolean);
      }
    }
    expect(counts).toEqual(expectedCounts);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(666);
    expect(images).toHaveLength(6);
    expect(imageChoices["visual-4ed28ea39938186a2e31.png"]).toHaveLength(5);
    expect(imageChoices["visual-9f39f53b8e9c9bbec282.png"]?.[3]).toMatch(/τρεις περιπτώσεις/);
    expect(imageChoices["visual-d11ed778268ea853f289.png"]?.[3]).toMatch(/Καμία/);
    expect(visibleText.some((text) => /ANSWER\s*:/i.test(text))).toBe(false);
    expect(imagePrompts.some((prompt) => /:\s*[A-F]\s*$/i.test(prompt))).toBe(false);
    expect(imagePrompts.some((prompt) => /A\)\s*B\)\s*C\)\s*D\)/i.test(prompt))).toBe(false);
    await Promise.all(
      images.map(async (image) => {
        const imagePath = path.join(root, "content/production/images", image);
        await access(imagePath);
        const metadata = await sharp(imagePath).metadata();
        expect(metadata.width).toBeGreaterThanOrEqual(600);
        expect(metadata.height).toBeGreaterThanOrEqual(250);
      })
    );

    const report = JSON.parse(
      await readFile(path.join(root, "content/production/extraction-report.json"), "utf8")
    ) as {
      excludedQuestions: number;
      samePromptVariantGroups: unknown[];
      samePromptVariantAdditionalQuestions: number;
      issues: Array<{ reason: string }>;
    };
    expect(report.excludedQuestions).toBe(6);
    expect(report.samePromptVariantGroups).toHaveLength(17);
    expect(report.samePromptVariantAdditionalQuestions).toBe(22);
    expect(report.issues.filter((issue) => issue.reason.includes("διπλότυπο"))).toHaveLength(4);
  });
});
