import type { ChoiceKey, ExamReviewEntry, QuizQuestion } from "../types";

export type RandomSource = () => number;

export function groupByCategory(questions: readonly QuizQuestion[]): Map<string, QuizQuestion[]> {
  const groups = new Map<string, QuizQuestion[]>();
  for (const question of questions) {
    const existing = groups.get(question.category) ?? [];
    existing.push(question);
    groups.set(question.category, existing);
  }
  return groups;
}

export function pickPracticeQuestion(
  questions: readonly QuizQuestion[],
  random: RandomSource = Math.random
): QuizQuestion {
  if (questions.length === 0) throw new Error("Δεν υπάρχουν διαθέσιμες ερωτήσεις.");
  return questions[Math.min(Math.floor(random() * questions.length), questions.length - 1)];
}

export function shuffleQuestions(
  questions: readonly QuizQuestion[],
  random: RandomSource = Math.random
): QuizQuestion[] {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(Math.floor(random() * (index + 1)), index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function calculateScore(correct: number, total: number) {
  return { correct, total, percentage: total === 0 ? 0 : Math.round((correct / total) * 100) };
}

export function buildExamReview(
  questions: readonly QuizQuestion[],
  answers: Readonly<Record<string, ChoiceKey>>
): ExamReviewEntry[] {
  return questions.map((question) => {
    const selectedChoice = answers[question.id];
    if (!selectedChoice)
      throw new Error(`Δεν καταγράφηκε απάντηση για την ερώτηση ${question.id}.`);
    return { question, selectedChoice, isCorrect: selectedChoice === question.correctChoice };
  });
}
