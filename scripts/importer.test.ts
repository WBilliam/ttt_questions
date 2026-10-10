// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createQuestionId, normalizeRows, type SourceRow } from "./importer";

const baseRow: SourceRow = {
  rowNumber: 2,
  category: " Δείγμα — Ασφάλεια ",
  question: "Ποιος αριθμός καλεί τις υπηρεσίες έκτακτης ανάγκης στην ΕΕ;",
  option_a: "112",
  option_b: "111",
  option_c: "",
  option_d: "",
  option_e: "",
  option_f: "",
  correct_option: "A",
  explanation: "Το 112 λειτουργεί σε όλα τα κράτη μέλη της ΕΕ.",
  image: "",
  image_alt: ""
};

describe("content importer", () => {
  it("generates stable IDs from canonical content", () => {
    const first = createQuestionId(" Κατηγορία ", "Ερώτηση\r\nμε κενά", [" Α ", "Β"]);
    const second = createQuestionId("Κατηγορία", "Ερώτηση\nμε κενά", ["Α", "Β"]);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{24}$/);
  });

  it("normalizes a valid row into a question", () => {
    const result = normalizeRows([baseRow], new Set());
    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      category: "Δείγμα — Ασφάλεια",
      correctChoice: "A",
      choices: [
        { key: "A", text: "112" },
        { key: "B", text: "111" }
      ]
    });
  });

  it("reports a gap between populated choices", () => {
    const result = normalizeRows(
      [{ ...baseRow, option_b: "", option_c: "Τρίτη επιλογή" }],
      new Set()
    );
    expect(result.errors[0]).toContain("Γραμμή 2");
    expect(result.errors[0]).toContain("κενό ανάμεσα στις επιλογές");
  });

  it("reports missing referenced images and unsafe paths", () => {
    const missing = normalizeRows([{ ...baseRow, image: "missing.png" }], new Set());
    expect(missing.errors[0]).toContain("δεν βρέθηκε");
    const unsafe = normalizeRows(
      [{ ...baseRow, image: "../outside.png" }],
      new Set(["../outside.png"])
    );
    expect(unsafe.errors[0]).toContain("μη ασφαλή διαδρομή");
  });

  it("warns for missing explanations and near-duplicate categories", () => {
    const result = normalizeRows(
      [
        { ...baseRow, explanation: "" },
        { ...baseRow, rowNumber: 3, category: "δείγμα — ασφάλεια", question: "Δεύτερη ερώτηση" }
      ],
      new Set()
    );
    expect(result.warnings.some((warning) => warning.includes("χωρίς επεξήγηση"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("διαφέρουν μόνο"))).toBe(true);
  });
});
