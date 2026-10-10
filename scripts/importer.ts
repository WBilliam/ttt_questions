import { createHash } from "node:crypto";
import path from "node:path";
import type { ChoiceKey, QuizQuestion } from "../src/types";

export interface SourceRow {
  rowNumber: number;
  category: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  option_f: string;
  correct_option: string;
  explanation: string;
  image: string;
  image_alt: string;
}

export interface ImportedQuestion extends Omit<QuizQuestion, "image"> {
  sourceImage?: string;
  imageAlt?: string;
}

export interface NormalizeResult {
  questions: ImportedQuestion[];
  warnings: string[];
  errors: string[];
}

const keys: ChoiceKey[] = ["A", "B", "C", "D", "E", "F"];

export function cleanText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

function canonical(value: string): string {
  return cleanText(value).replace(/[ \t]+/g, " ");
}

export function createQuestionId(category: string, question: string, choices: string[]): string {
  const payload = JSON.stringify([
    canonical(category),
    canonical(question),
    ...choices.map(canonical)
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function rowError(rowNumber: number, message: string): string {
  return `Γραμμή ${rowNumber}: ${message}`;
}

export function normalizeRows(rows: SourceRow[], imageNames: ReadonlySet<string>): NormalizeResult {
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  const categoryForms = new Map<string, string>();
  const questionTexts = new Set<string>();

  for (const row of rows) {
    const category = cleanText(row.category);
    const prompt = cleanText(row.question);
    if (!category) errors.push(rowError(row.rowNumber, "λείπει η κατηγορία."));
    if (!prompt) errors.push(rowError(row.rowNumber, "λείπει το κείμενο της ερώτησης."));

    const rawChoices = [
      row.option_a,
      row.option_b,
      row.option_c,
      row.option_d,
      row.option_e,
      row.option_f
    ].map(cleanText);
    const firstGap = rawChoices.findIndex((choice) => !choice);
    if (firstGap >= 0 && rawChoices.slice(firstGap + 1).some(Boolean)) {
      errors.push(rowError(row.rowNumber, "υπάρχει κενό ανάμεσα στις επιλογές."));
    }
    const populated = rawChoices.filter(Boolean);
    if (populated.length < 2)
      errors.push(rowError(row.rowNumber, "απαιτούνται τουλάχιστον δύο επιλογές."));

    const correctChoice = cleanText(row.correct_option).toUpperCase() as ChoiceKey;
    if (!keys.includes(correctChoice)) {
      errors.push(rowError(row.rowNumber, "η σωστή επιλογή πρέπει να είναι γράμμα από A έως F."));
    } else if (!rawChoices[keys.indexOf(correctChoice)]) {
      errors.push(rowError(row.rowNumber, "η σωστή επιλογή δείχνει σε κενή απάντηση."));
    }

    const image = cleanText(row.image);
    if (image) {
      if (path.basename(image) !== image || image.includes("/") || image.includes("\\")) {
        errors.push(rowError(row.rowNumber, "η εικόνα περιέχει μη ασφαλή διαδρομή."));
      } else if (!imageNames.has(image)) {
        errors.push(rowError(row.rowNumber, `η εικόνα «${image}» δεν βρέθηκε.`));
      }
    }

    const explanation = cleanText(row.explanation);
    if (!explanation) warnings.push(rowError(row.rowNumber, "η ερώτηση είναι χωρίς επεξήγηση."));
    if (prompt.length > 500 || populated.some((choice) => choice.length > 240)) {
      warnings.push(rowError(row.rowNumber, "το κείμενο είναι ασυνήθιστα μεγάλο."));
    }

    const categoryKey = category.toLocaleLowerCase("el-GR");
    const priorCategory = categoryForms.get(categoryKey);
    if (priorCategory && priorCategory !== category) {
      warnings.push(
        rowError(
          row.rowNumber,
          `οι κατηγορίες «${priorCategory}» και «${category}» διαφέρουν μόνο σε πεζά/κεφαλαία ή κενά.`
        )
      );
    } else if (category) {
      categoryForms.set(categoryKey, category);
    }
    const questionKey = `${categoryKey}\u0000${prompt.toLocaleLowerCase("el-GR")}`;
    if (questionTexts.has(questionKey))
      warnings.push(rowError(row.rowNumber, "υπάρχει διπλό κείμενο ερώτησης στην ίδια κατηγορία."));
    questionTexts.add(questionKey);

    if (!category || !prompt || populated.length < 2 || !keys.includes(correctChoice)) continue;
    const id = createQuestionId(category, prompt, populated);
    if (ids.has(id)) {
      errors.push(rowError(row.rowNumber, `το παραγόμενο αναγνωριστικό ${id} είναι διπλό.`));
      continue;
    }
    ids.add(id);
    questions.push({
      id,
      category,
      prompt,
      choices: populated.map((text, index) => ({ key: keys[index], text })),
      correctChoice,
      ...(explanation ? { explanation } : {}),
      ...(image
        ? {
            sourceImage: image,
            imageAlt: cleanText(row.image_alt) || "Εικόνα που συνοδεύει την ερώτηση"
          }
        : {})
    });
  }

  return { questions, warnings, errors };
}
