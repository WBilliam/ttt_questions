import { describe, expect, it } from "vitest";
import {
  buildExamReview,
  calculateScore,
  groupByCategory,
  pickPracticeQuestion,
  shuffleQuestions
} from "./quiz";
import type { QuizQuestion } from "../types";

const questions: QuizQuestion[] = [
  {
    id: "q1",
    category: "Κατηγορία Α",
    prompt: "Ερώτηση 1",
    choices: [
      { key: "A", text: "Α" },
      { key: "B", text: "Β" }
    ],
    correctChoice: "A"
  },
  {
    id: "q2",
    category: "Κατηγορία Α",
    prompt: "Ερώτηση 2",
    choices: [
      { key: "A", text: "Α" },
      { key: "B", text: "Β" }
    ],
    correctChoice: "B",
    explanation: "Επεξήγηση"
  },
  {
    id: "q3",
    category: "Κατηγορία Β",
    prompt: "Ερώτηση 3",
    choices: [
      { key: "A", text: "Α" },
      { key: "B", text: "Β" }
    ],
    correctChoice: "A"
  }
];

describe("quiz domain", () => {
  it("groups questions by exact category", () => {
    const groups = groupByCategory(questions);
    expect([...groups.keys()]).toEqual(["Κατηγορία Α", "Κατηγορία Β"]);
    expect(groups.get("Κατηγορία Α")?.map((question) => question.id)).toEqual(["q1", "q2"]);
  });

  it("picks a practice question only from the supplied category and permits repeats", () => {
    const category = questions.slice(0, 2);
    const random = () => 0.75;
    expect(pickPracticeQuestion(category, random).id).toBe("q2");
    expect(pickPracticeQuestion(category, random).id).toBe("q2");
  });

  it("shuffles every exam question exactly once without mutating the source", () => {
    const source = questions.slice(0, 2);
    const shuffled = shuffleQuestions(source, () => 0);
    expect(shuffled.map((question) => question.id)).toEqual(["q2", "q1"]);
    expect(source.map((question) => question.id)).toEqual(["q1", "q2"]);
  });

  it("calculates rounded percentage scores", () => {
    expect(calculateScore(2, 3)).toEqual({ correct: 2, total: 3, percentage: 67 });
  });

  it("builds ordered review entries with student and correct answers", () => {
    const review = buildExamReview(questions.slice(0, 2), { q1: "A", q2: "A" });
    expect(review).toEqual([
      { question: questions[0], selectedChoice: "A", isCorrect: true },
      { question: questions[1], selectedChoice: "A", isCorrect: false }
    ]);
  });
});
