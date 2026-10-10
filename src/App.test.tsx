import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { QuestionBank } from "./types";

const bank: QuestionBank = {
  schemaVersion: 1,
  contentVersion: "test",
  contentMode: "demo",
  questions: [
    {
      id: "q1",
      category: "Δείγμα",
      prompt: "Ποια είναι η σωστή επιλογή;",
      choices: [
        { key: "A", text: "Σωστή" },
        { key: "B", text: "Λάθος" }
      ],
      correctChoice: "A",
      explanation: "Επειδή είναι δείγμα."
    },
    {
      id: "q2",
      category: "Δείγμα",
      prompt: "Δεύτερη ερώτηση",
      choices: [
        { key: "A", text: "Α" },
        { key: "B", text: "Β" }
      ],
      correctChoice: "B"
    }
  ]
};

describe("student application", () => {
  it("shows the demo notice and requires a category", async () => {
    render(<App loadBank={async () => bank} />);
    expect(await screen.findByText(/Περιεχόμενο επίδειξης/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Εξάσκηση/ })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Κατηγορία"), "Δείγμα");
    expect(screen.getByRole("button", { name: /^Εξάσκηση/ })).toBeEnabled();
  });

  it("hides the demo notice for production content", async () => {
    render(<App loadBank={async () => ({ ...bank, contentMode: "production" })} />);
    await screen.findByLabelText("Κατηγορία");
    expect(screen.queryByText(/Περιεχόμενο επίδειξης/)).not.toBeInTheDocument();
  });

  it("locks a practice answer and shows feedback", async () => {
    render(<App loadBank={async () => bank} random={() => 0} />);
    await userEvent.selectOptions(await screen.findByLabelText("Κατηγορία"), "Δείγμα");
    await userEvent.click(screen.getByRole("button", { name: /^Εξάσκηση/ }));
    await userEvent.click(screen.getByRole("button", { name: /A\. Σωστή/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Σωστά");
    expect(screen.getByText("Επειδή είναι δείγμα.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /B\. Λάθος/ })).toBeDisabled();
  });

  it("requires explicit confirmation before advancing an exam answer", async () => {
    render(<App loadBank={async () => bank} random={() => 0.99} />);
    await userEvent.selectOptions(await screen.findByLabelText("Κατηγορία"), "Δείγμα");
    await userEvent.click(screen.getByRole("button", { name: /^Εξέταση/ }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /A\. Σωστή/ }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Επόμενη" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("shows a recovery action when loading fails", async () => {
    render(
      <App
        loadBank={async () => {
          throw new Error("offline");
        }}
      />
    );
    expect(
      await screen.findByRole("heading", { name: "Δεν φορτώθηκαν οι ερωτήσεις" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Δοκιμή ξανά" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("Κατηγορία")).not.toBeInTheDocument());
  });
});
