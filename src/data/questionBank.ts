import { z } from "zod";
import { choiceKeys, type QuestionBank } from "../types";

const choiceKeySchema = z.enum(choiceKeys);
const questionSchema = z
  .object({
    id: z.string().trim().min(1),
    category: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    choices: z
      .array(z.object({ key: choiceKeySchema, text: z.string().trim().min(1) }))
      .min(2)
      .max(6),
    correctChoice: choiceKeySchema,
    explanation: z.string().trim().min(1).optional(),
    image: z
      .object({
        webpSrc: z.string().trim().min(1),
        fallbackSrc: z.string().trim().min(1),
        alt: z.string().trim().min(1)
      })
      .optional()
  })
  .superRefine((question, context) => {
    if (!question.choices.some((choice) => choice.key === question.correctChoice)) {
      context.addIssue({ code: "custom", message: "μη έγκυρη σωστή επιλογή" });
    }
  });

const bankEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.string().trim().min(1),
  contentMode: z.enum(["demo", "production"]),
  questions: z.array(z.unknown()).min(1, "Η τράπεζα δεν περιέχει ερωτήσεις.")
});

export function parseQuestionBank(value: unknown): QuestionBank {
  const envelope = bankEnvelopeSchema.safeParse(value);
  if (!envelope.success)
    throw new Error(envelope.error.issues.map((issue) => issue.message).join(" "));
  const questions = envelope.data.questions.flatMap((candidate, index) => {
    const result = questionSchema.safeParse(candidate);
    if (result.success) return [result.data];
    if (import.meta.env.DEV)
      console.warn(`Παράλειψη μη έγκυρης ερώτησης ${index + 1}:`, result.error.issues);
    return [];
  });
  if (questions.length === 0) {
    const first = questionSchema.safeParse(envelope.data.questions[0]);
    throw new Error(
      first.success
        ? "Η τράπεζα δεν περιέχει έγκυρες ερωτήσεις."
        : first.error.issues.map((issue) => issue.message).join(" ")
    );
  }
  return { ...envelope.data, questions };
}

export async function loadQuestionBank(): Promise<QuestionBank> {
  const response = await fetch(`${import.meta.env.BASE_URL}generated/question-bank.json`, {
    cache: "no-cache"
  });
  if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση των ερωτήσεων.");
  return parseQuestionBank(await response.json());
}
