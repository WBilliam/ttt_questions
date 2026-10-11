import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  buildExamReview,
  calculateScore,
  groupByCategory,
  pickPracticeQuestion,
  shuffleQuestions,
  type RandomSource
} from "./domain/quiz";
import { loadQuestionBank } from "./data/questionBank";
import type { ChoiceKey, ExamReviewEntry, QuestionBank, QuizQuestion } from "./types";

type State =
  | { screen: "loading" }
  | { screen: "recovery"; message: string }
  | { screen: "home"; bank: QuestionBank; category: string }
  | {
      screen: "practice";
      bank: QuestionBank;
      category: string;
      questions: QuizQuestion[];
      question: QuizQuestion;
      selected?: ChoiceKey;
    }
  | {
      screen: "exam";
      bank: QuestionBank;
      category: string;
      questions: QuizQuestion[];
      index: number;
      answers: Record<string, ChoiceKey>;
      pending?: ChoiceKey;
    }
  | {
      screen: "results";
      bank: QuestionBank;
      category: string;
      questions: QuizQuestion[];
      review: ExamReviewEntry[];
    };

type Action =
  | { type: "loaded"; bank: QuestionBank }
  | { type: "failed"; message: string }
  | { type: "category"; category: string }
  | { type: "start-practice"; questions: QuizQuestion[]; question: QuizQuestion }
  | { type: "answer-practice"; choice: ChoiceKey }
  | { type: "next-practice"; question: QuizQuestion }
  | { type: "start-exam"; questions: QuizQuestion[] }
  | { type: "select-exam"; choice: ChoiceKey }
  | { type: "commit-exam" }
  | { type: "home" }
  | { type: "restart-exam"; questions: QuizQuestion[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { screen: "home", bank: action.bank, category: "" };
    case "failed":
      return { screen: "recovery", message: action.message };
    case "category":
      return state.screen === "home" ? { ...state, category: action.category } : state;
    case "start-practice":
      return state.screen === "home"
        ? {
            screen: "practice",
            bank: state.bank,
            category: state.category,
            questions: action.questions,
            question: action.question
          }
        : state;
    case "answer-practice":
      return state.screen === "practice" && !state.selected
        ? { ...state, selected: action.choice }
        : state;
    case "next-practice":
      return state.screen === "practice"
        ? { ...state, question: action.question, selected: undefined }
        : state;
    case "start-exam":
      return state.screen === "home"
        ? {
            screen: "exam",
            bank: state.bank,
            category: state.category,
            questions: action.questions,
            index: 0,
            answers: {}
          }
        : state;
    case "select-exam":
      return state.screen === "exam" ? { ...state, pending: action.choice } : state;
    case "commit-exam": {
      if (state.screen !== "exam" || !state.pending) return state;
      const question = state.questions[state.index];
      const answers = { ...state.answers, [question.id]: state.pending };
      if (state.index < state.questions.length - 1)
        return { ...state, index: state.index + 1, answers, pending: undefined };
      return {
        screen: "results",
        bank: state.bank,
        category: state.category,
        questions: state.questions,
        review: buildExamReview(state.questions, answers)
      };
    }
    case "home":
      return "bank" in state
        ? { screen: "home", bank: state.bank, category: state.category }
        : state;
    case "restart-exam":
      return "bank" in state
        ? {
            screen: "exam",
            bank: state.bank,
            category: state.category,
            questions: action.questions,
            index: 0,
            answers: {}
          }
        : state;
  }
}

interface AppProps {
  loadBank?: () => Promise<QuestionBank>;
  random?: RandomSource;
}

export function App({ loadBank = loadQuestionBank, random = Math.random }: AppProps) {
  const [state, dispatch] = useReducer(reducer, { screen: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadBank()
      .then((bank) => active && dispatch({ type: "loaded", bank }))
      .catch(
        (error: unknown) =>
          active &&
          dispatch({
            type: "failed",
            message: error instanceof Error ? error.message : "Άγνωστο σφάλμα"
          })
      );
    return () => {
      active = false;
    };
  }, [loadBank, attempt]);

  const groups = useMemo(
    () =>
      "bank" in state ? groupByCategory(state.bank.questions) : new Map<string, QuizQuestion[]>(),
    [state]
  );
  const categories = [...groups.keys()].sort((a, b) => a.localeCompare(b, "el"));
  const goHome = () => {
    const active = state.screen === "practice" || state.screen === "exam";
    if (!active || window.confirm("Θέλετε να εγκαταλείψετε την τρέχουσα συνεδρία;"))
      dispatch({ type: "home" });
  };

  if (state.screen === "loading")
    return (
      <main className="shell">
        <p role="status">Φόρτωση ερωτήσεων…</p>
      </main>
    );
  if (state.screen === "recovery")
    return (
      <main className="shell recovery">
        <h1>Δεν φορτώθηκαν οι ερωτήσεις</h1>
        <p>{state.message}</p>
        <button
          onClick={() => {
            dispatch({ type: "failed", message: "Φόρτωση…" });
            setAttempt((value) => value + 1);
          }}
        >
          Δοκιμή ξανά
        </button>
      </main>
    );

  const demoNotice =
    state.bank.contentMode === "demo" ? (
      <p className="demo-notice" role="note">
        Περιεχόμενο επίδειξης — οι τελικές ερωτήσεις δεν έχουν προστεθεί ακόμη.
      </p>
    ) : null;
  if (state.screen === "home")
    return (
      <main className="shell">
        {demoNotice}
        <header className="hero">
          <span className="eyebrow">Κινητό κουίζ εξάσκησης</span>
          <h1>Practice Quiz</h1>
          <p>Διάλεξε κατηγορία και τρόπο μελέτης. Δεν χρειάζεται λογαριασμός.</p>
        </header>
        <section className="home-card" aria-labelledby="start-title">
          <h2 id="start-title">Ξεκίνα</h2>
          <label htmlFor="category">Κατηγορία</label>
          <select
            id="category"
            value={state.category}
            onChange={(event) => dispatch({ type: "category", category: event.target.value })}
          >
            <option value="">Επίλεξε κατηγορία</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <div className="mode-grid">
            <button
              disabled={!state.category}
              onClick={() => {
                const questions = groups.get(state.category) ?? [];
                dispatch({
                  type: "start-practice",
                  questions,
                  question: pickPracticeQuestion(questions, random)
                });
              }}
            >
              <strong>Εξάσκηση</strong>
              <span>Άμεση ανατροφοδότηση και τυχαίες επαναλήψεις.</span>
            </button>
            <button
              disabled={!state.category}
              onClick={() =>
                dispatch({
                  type: "start-exam",
                  questions: shuffleQuestions(groups.get(state.category) ?? [], random)
                })
              }
            >
              <strong>Εξέταση</strong>
              <span>Όλες οι ερωτήσεις μία φορά και βαθμολογία στο τέλος.</span>
            </button>
          </div>
        </section>
      </main>
    );
  if (state.screen === "practice") {
    const correct = state.selected === state.question.correctChoice;
    return (
      <main className="shell">
        {demoNotice}
        <SessionHeader title="Εξάσκηση" subtitle={state.category} onHome={goHome} />
        <QuestionView
          question={state.question}
          selected={state.selected}
          locked={Boolean(state.selected)}
          onSelect={(choice) => dispatch({ type: "answer-practice", choice })}
        />
        {state.selected && (
          <div className={`feedback ${correct ? "correct" : "incorrect"}`} role="status">
            <strong>{correct ? "✓ Σωστά" : "✕ Λάθος"}</strong>
            <p>Σωστή απάντηση: {state.question.correctChoice}</p>
            {state.question.explanation && <p>{state.question.explanation}</p>}
          </div>
        )}
        <button
          className="primary full"
          disabled={!state.selected}
          onClick={() =>
            dispatch({
              type: "next-practice",
              question: pickPracticeQuestion(state.questions, random)
            })
          }
        >
          Επόμενη
        </button>
      </main>
    );
  }
  if (state.screen === "exam") {
    const question = state.questions[state.index];
    return (
      <main className="shell">
        {demoNotice}
        <SessionHeader
          title="Εξέταση"
          subtitle={state.category}
          onHome={goHome}
          progress={`${state.index + 1} / ${state.questions.length}`}
        />
        <QuestionView
          question={question}
          selected={state.pending}
          onSelect={(choice) => dispatch({ type: "select-exam", choice })}
        />
        <button
          className="primary full"
          disabled={!state.pending}
          onClick={() => dispatch({ type: "commit-exam" })}
        >
          {state.index === state.questions.length - 1 ? "Ολοκλήρωση" : "Επόμενη"}
        </button>
      </main>
    );
  }
  const score = calculateScore(
    state.review.filter((item) => item.isCorrect).length,
    state.review.length
  );
  return (
    <main className="shell">
      {demoNotice}
      <section className="result-card">
        <span className="eyebrow">Αποτέλεσμα εξέτασης</span>
        <h1>{score.percentage}%</h1>
        <p>
          {score.correct} σωστές από {score.total}
        </p>
        <div className="result-actions">
          <button
            className="primary"
            onClick={() =>
              dispatch({
                type: "restart-exam",
                questions: shuffleQuestions(state.questions, random)
              })
            }
          >
            Νέα προσπάθεια
          </button>
          <button onClick={goHome}>Αρχική</button>
        </div>
      </section>
      <section aria-labelledby="review-title">
        <h2 id="review-title">Ανασκόπηση απαντήσεων</h2>
        {state.review.map((entry, index) => (
          <article className="review-card" key={entry.question.id}>
            <h3>
              {index + 1}. {entry.question.prompt}
            </h3>
            <p>
              Η απάντησή σου:{" "}
              <strong>
                {entry.selectedChoice}.{" "}
                {entry.question.choices.find((choice) => choice.key === entry.selectedChoice)?.text}
              </strong>
            </p>
            <p>
              Σωστή απάντηση:{" "}
              <strong>
                {entry.question.correctChoice}.{" "}
                {
                  entry.question.choices.find(
                    (choice) => choice.key === entry.question.correctChoice
                  )?.text
                }
              </strong>
            </p>
            {entry.question.explanation && <p>{entry.question.explanation}</p>}
            <span className={entry.isCorrect ? "tag-correct" : "tag-incorrect"}>
              {entry.isCorrect ? "✓ Σωστά" : "✕ Λάθος"}
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}

function SessionHeader({
  title,
  subtitle,
  progress,
  onHome
}: {
  title: string;
  subtitle: string;
  progress?: string;
  onHome: () => void;
}) {
  return (
    <header className="session-header">
      <button className="link-button" onClick={onHome}>
        ← Αρχική
      </button>
      <div>
        <span className="eyebrow">{title}</span>
        <h1>{subtitle}</h1>
      </div>
      {progress && <strong className="progress">{progress}</strong>}
    </header>
  );
}

function QuestionView({
  question,
  selected,
  locked = false,
  onSelect
}: {
  question: QuizQuestion;
  selected?: ChoiceKey;
  locked?: boolean;
  onSelect: (choice: ChoiceKey) => void;
}) {
  const [largeImage, setLargeImage] = useState(false);
  const imageButton = useRef<HTMLButtonElement>(null);
  const closeImage = () => {
    setLargeImage(false);
    requestAnimationFrame(() => imageButton.current?.focus());
  };
  return (
    <section className="question-card" aria-labelledby="question-title">
      <span className="question-label">Ερώτηση</span>
      <h2 id="question-title">{question.prompt}</h2>
      {question.image && (
        <>
          <button
            ref={imageButton}
            className="image-button"
            onClick={() => setLargeImage(true)}
            aria-label="Μεγέθυνση εικόνας"
          >
            <picture>
              <source
                srcSet={`${import.meta.env.BASE_URL}${question.image.webpSrc}`}
                type="image/webp"
              />
              <img
                src={`${import.meta.env.BASE_URL}${question.image.fallbackSrc}`}
                alt={question.image.alt}
              />
            </picture>
          </button>
          <ImageDialog image={question.image} open={largeImage} onClose={closeImage} />
        </>
      )}
      <div className="choices">
        {question.choices.map((choice) => (
          <button
            key={choice.key}
            aria-label={`${choice.key}. ${choice.text}`}
            className={selected === choice.key ? "selected" : ""}
            disabled={locked}
            aria-pressed={selected === choice.key}
            onClick={() => onSelect(choice.key)}
          >
            <span>{choice.key}</span>
            {choice.text}
          </button>
        ))}
      </div>
    </section>
  );
}

function ImageDialog({
  image,
  open,
  onClose
}: {
  image: NonNullable<QuizQuestion["image"]>;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="lightbox"
      aria-label="Μεγεθυμένη εικόνα"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button aria-label="Κλείσιμο εικόνας" onClick={onClose}>
        ×
      </button>
      <img src={`${import.meta.env.BASE_URL}${image.fallbackSrc}`} alt={image.alt} />
    </dialog>
  );
}
