export const choiceKeys = ["A", "B", "C", "D", "E", "F"] as const;
export type ChoiceKey = (typeof choiceKeys)[number];

export interface QuizChoice {
  key: ChoiceKey;
  text: string;
}
export interface QuestionImage {
  webpSrc: string;
  fallbackSrc: string;
  alt: string;
}
export interface QuizQuestion {
  id: string;
  category: string;
  prompt: string;
  choices: QuizChoice[];
  correctChoice: ChoiceKey;
  explanation?: string;
  image?: QuestionImage;
}
export interface QuestionBank {
  schemaVersion: 1;
  contentVersion: string;
  contentMode: "demo" | "production";
  questions: QuizQuestion[];
}
export interface ExamReviewEntry {
  question: QuizQuestion;
  selectedChoice: ChoiceKey;
  isCorrect: boolean;
}
