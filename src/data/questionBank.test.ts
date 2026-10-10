import { describe, expect, it, vi } from "vitest";
import { parseQuestionBank } from "./questionBank";

const validBank = {
  schemaVersion: 1,
  contentVersion: "abc123",
  contentMode: "demo",
  questions: [
    {
      id: "q1",
      category: "Δείγμα",
      prompt: "Ερώτηση",
      choices: [
        { key: "A", text: "Ναι" },
        { key: "B", text: "Όχι" }
      ],
      correctChoice: "A"
    }
  ]
};

describe("question bank runtime validation", () => {
  it("accepts a valid bank", () => {
    expect(parseQuestionBank(validBank)).toEqual(validBank);
  });

  it("rejects an empty bank", () => {
    expect(() => parseQuestionBank({ ...validBank, questions: [] })).toThrow(
      "δεν περιέχει ερωτήσεις"
    );
  });

  it("rejects a correct answer that is not a populated choice", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const malformed = structuredClone(validBank);
    malformed.questions[0].correctChoice = "C";
    expect(() => parseQuestionBank(malformed)).toThrow("μη έγκυρη σωστή επιλογή");
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("skips one malformed runtime record when valid questions remain", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mixed = structuredClone(validBank);
    mixed.questions.push({ ...mixed.questions[0], id: "q2", correctChoice: "C" });
    expect(parseQuestionBank(mixed).questions.map((question) => question.id)).toEqual(["q1"]);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
