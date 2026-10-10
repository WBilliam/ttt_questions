import tempfile
import unittest
from pathlib import Path

from scripts.extract_question_docs import (
    StyledLine,
    build_visual_question,
    clean_generated_images,
    deduplicate_questions,
    expand_inline_choices,
    parse_explicit_questions,
    parse_styled_questions,
    visual_crop_end,
)


class ExtractQuestionDocsTest(unittest.TestCase):
    def test_visual_question_uses_generic_choices_without_guessing_image_text(self):
        question, issue = build_visual_question(
            [
                StyledLine("2. Ποια εκτέλεση είναι σωστή;", index=10),
                StyledLine("α)", index=11),
                StyledLine("β)", index=12),
                StyledLine("γ)", index=13),
                StyledLine("δ)", index=14),
            ],
            answer="C",
            category="Βιομηχανική",
            source="visual.pdf",
            image="visual-q2.png",
        )

        self.assertIsNone(issue)
        self.assertEqual("Ποια εκτέλεση είναι σωστή;", question.prompt)
        self.assertEqual(["Επιλογή Α", "Επιλογή Β", "Επιλογή Γ", "Επιλογή Δ"], question.choices)
        self.assertEqual("C", question.correct_option)
        self.assertEqual("visual-q2.png", question.image)

    def test_visual_question_removes_diagram_labels_from_prompt(self):
        question, issue = build_visual_question(
            [
                StyledLine(
                    "4. Ποια θέση είναι σωστή; Αρχική Θέση A) B) C) D)",
                    index=20,
                ),
            ],
            answer="B",
            category="Βιομηχανική",
            source="visual.pdf",
            image="visual-q4.png",
        )

        self.assertIsNone(issue)
        self.assertEqual("Ποια θέση είναι σωστή;", question.prompt)

        question, issue = build_visual_question(
            [StyledLine("5. Η κίνηση ολοκληρώνεται μέχρι τη θέση: B", index=30)],
            answer="B",
            category="Βιομηχανική",
            source="visual.pdf",
            image="visual-q5.png",
        )

        self.assertIsNone(issue)
        self.assertEqual("Η κίνηση ολοκληρώνεται μέχρι τη θέση:", question.prompt)

    def test_visual_question_counts_inline_labels_and_preserves_text_only_choice(self):
        question, issue = build_visual_question(
            [
                StyledLine("2. Επιλέξτε τη σωστή θέση"),
                StyledLine("A) B) Γ) Δ) Ε)"),
            ],
            answer="E",
            category="Βιομηχανική",
            source="visual.pdf",
            image="visual-q2.png",
        )

        self.assertIsNone(issue)
        self.assertEqual(5, len(question.choices))

        question, issue = build_visual_question(
            [
                StyledLine("3. Επιλέξτε τη σωστή εκτέλεση"),
                StyledLine("A) B) C) D) Καμία από τις προαναφερόμενες"),
            ],
            answer="A",
            category="Βιομηχανική",
            source="visual.pdf",
            image="visual-q3.png",
        )

        self.assertIsNone(issue)
        self.assertEqual("Καμία από τις προαναφερόμενες", question.choices[3])

    def test_visual_crop_stops_before_formatted_answer_rows(self):
        end = visual_crop_end(
            [
                StyledLine("4. Οπτική ερώτηση", page=0, top=100),
                StyledLine("α) Στην α περίπτωση", page=0, top=420),
                StyledLine("β) Στην β περίπτωση", page=0, top=445),
            ],
            StyledLine("ANSWER: A", page=0, top=500),
        )

        self.assertEqual((0, 420), end)

        end = visual_crop_end(
            [
                StyledLine("4. Οπτική ερώτηση", page=0, top=100),
                StyledLine("Α)", page=0, top=420),
                StyledLine("Β)", page=0, top=445),
            ],
            StyledLine("ANSWER: A", page=0, top=500),
        )

        self.assertEqual((0, 500), end)

    def test_inline_choices_are_split_without_changing_text(self):
        lines = expand_inline_choices(
            [StyledLine("A. Πρώτη B. Δεύτερη C. Τρίτη D. Τέταρτη", index=7)]
        )

        self.assertEqual(
            ["A. Πρώτη", "B. Δεύτερη", "C. Τρίτη", "D. Τέταρτη"],
            [line.text for line in lines],
        )
        self.assertTrue(all(line.index == 7 for line in lines))

    def test_explicit_answer_marker_and_wrapped_text(self):
        questions, issues = parse_explicit_questions(
            [
                StyledLine("1. Ποια πρόταση"),
                StyledLine("είναι σωστή;"),
                StyledLine("α) Πρώτη επιλογή"),
                StyledLine("β) Δεύτερη επιλογή"),
                StyledLine("που συνεχίζεται"),
                StyledLine("γ) Τρίτη επιλογή"),
                StyledLine("ANSWER: B"),
            ],
            category="Δοκιμή",
            source="sample.docx",
        )

        self.assertEqual([], issues)
        self.assertEqual(1, len(questions))
        self.assertEqual("Ποια πρόταση είναι σωστή;", questions[0].prompt)
        self.assertEqual(
            ["Πρώτη επιλογή", "Δεύτερη επιλογή που συνεχίζεται", "Τρίτη επιλογή"],
            questions[0].choices,
        )
        self.assertEqual("B", questions[0].correct_option)

    def test_explicit_parser_supports_a_label_on_its_own_line(self):
        questions, issues = parse_explicit_questions(
            [
                StyledLine("1. Ποια πρόταση είναι σωστή;"),
                StyledLine("Α)"),
                StyledLine("Πρώτη επιλογή"),
                StyledLine("Β) Δεύτερη επιλογή"),
                StyledLine("ANSWER: B"),
            ],
            category="Δοκιμή",
            source="sample.pdf",
        )

        self.assertEqual([], issues)
        self.assertEqual(["Πρώτη επιλογή", "Δεύτερη επιλογή"], questions[0].choices)

    def test_explicit_parser_drops_document_heading_before_list_question(self):
        questions, issues = parse_explicit_questions(
            [
                StyledLine("Ερωτήσεις για τις εξετάσεις", index=1),
                StyledLine("Ποια είναι σωστή;", index=3, list_id="2", list_level=0),
                StyledLine("Α. Πρώτη", index=4),
                StyledLine("Β. Δεύτερη", index=5),
                StyledLine("ANSWER: A", index=6),
            ],
            category="Δοκιμή",
            source="sample.docx",
        )

        self.assertEqual([], issues)
        self.assertEqual("Ποια είναι σωστή;", questions[0].prompt)

    def test_greek_answer_marker(self):
        questions, issues = parse_explicit_questions(
            [
                StyledLine("Ερώτηση;"),
                StyledLine("Α. Ναι"),
                StyledLine("Β. Όχι"),
                StyledLine("Σωστή απάντηση: Α"),
            ],
            category="Δοκιμή",
            source="sample.docx",
        )

        self.assertEqual([], issues)
        self.assertEqual("A", questions[0].correct_option)

    def test_styled_correct_choices_for_bold_red_blue_and_checkmark(self):
        cases = [
            ("bold", StyledLine("Β. Σωστό", bold=True)),
            ("red", StyledLine("Β. Σωστό", colors=("FF0000",))),
            ("blue", StyledLine("Β. Σωστό", colors=("0070C0",))),
            ("check", StyledLine("Β. Σωστό ✓")),
        ]
        for mode, correct_line in cases:
            with self.subTest(mode=mode):
                questions, issues = parse_styled_questions(
                    [
                        StyledLine("1. Ποια είναι σωστή;"),
                        StyledLine("Α. Λάθος"),
                        correct_line,
                        StyledLine("Γ. Επίσης λάθος"),
                    ],
                    category="Δοκιμή",
                    source="sample.docx",
                    correct_style=mode,
                )
                self.assertEqual([], issues)
                self.assertEqual("B", questions[0].correct_option)
                self.assertEqual("Σωστό", questions[0].choices[1])

    def test_styled_parser_does_not_append_answer_metadata_to_a_choice(self):
        questions, issues = parse_styled_questions(
            [
                StyledLine("1. Ποια είναι σωστή;"),
                StyledLine("Α. Λάθος"),
                StyledLine("Β. Σωστό", bold=True),
                StyledLine("Γ. Επίσης λάθος.ANSWER:"),
                StyledLine(".ANSWER:"),
            ],
            category="Δοκιμή",
            source="sample.docx",
            correct_style="bold",
        )

        self.assertEqual([], issues)
        self.assertEqual(["Λάθος", "Σωστό", "Επίσης λάθος"], questions[0].choices)

    def test_styled_parser_strips_attached_greek_answer_metadata(self):
        questions, issues = parse_styled_questions(
            [
                StyledLine("1. Ποια είναι σωστή;"),
                StyledLine("Α. Λάθος"),
                StyledLine("Β. Σωστό", bold=True),
                StyledLine("Γ. Επίσης λάθος.Σωστή απάντηση:"),
            ],
            category="Δοκιμή",
            source="sample.docx",
            correct_style="bold",
        )

        self.assertEqual([], issues)
        self.assertEqual(["Λάθος", "Σωστό", "Επίσης λάθος"], questions[0].choices)

    def test_unlabelled_choices_are_ordered_and_question_numbers_removed(self):
        questions, issues = parse_styled_questions(
            [
                StyledLine("12. Ποια είναι σωστή;", bold=True),
                StyledLine("Πρώτη"),
                StyledLine("Δεύτερη", colors=("FF0000",)),
                StyledLine("Τρίτη"),
            ],
            category="Δοκιμή",
            source="sample.docx",
            correct_style="red",
            unlabelled_choices=True,
        )

        self.assertEqual([], issues)
        self.assertEqual("Ποια είναι σωστή;", questions[0].prompt)
        self.assertEqual(["Πρώτη", "Δεύτερη", "Τρίτη"], questions[0].choices)
        self.assertEqual("B", questions[0].correct_option)

    def test_ambiguous_correct_answer_is_excluded_and_reported(self):
        questions, issues = parse_styled_questions(
            [
                StyledLine("1. Ποια είναι σωστή;"),
                StyledLine("Α. Πρώτη", bold=True),
                StyledLine("Β. Δεύτερη", bold=True),
            ],
            category="Δοκιμή",
            source="ambiguous.docx",
            correct_style="bold",
        )

        self.assertEqual([], questions)
        self.assertEqual(1, len(issues))
        self.assertIn("ambiguous.docx", issues[0].source)
        self.assertIn("δύο", issues[0].reason)

    def test_duplicates_are_removed_only_within_same_category(self):
        first, _ = parse_explicit_questions(
            [
                StyledLine("Ερώτηση;"),
                StyledLine("Α. Ναι"),
                StyledLine("Β. Όχι"),
                StyledLine("ANSWER: A"),
            ],
            category="Κατηγορία Α",
            source="one.docx",
        )
        second, _ = parse_explicit_questions(
            [
                StyledLine("  Ερώτηση;  "),
                StyledLine("Α. Ναι"),
                StyledLine("Β. Όχι"),
                StyledLine("ANSWER: A"),
            ],
            category="Κατηγορία Α",
            source="two.docx",
        )
        third, _ = parse_explicit_questions(
            [
                StyledLine("Ερώτηση;"),
                StyledLine("Α. Ναι"),
                StyledLine("Β. Όχι"),
                StyledLine("ANSWER: A"),
            ],
            category="Κατηγορία Β",
            source="three.docx",
        )

        unique, duplicates = deduplicate_questions(first + second + third)

        self.assertEqual(2, len(unique))
        self.assertEqual(1, len(duplicates))
        self.assertIn("two.docx", duplicates[0].source)

    def test_same_prompt_with_different_choices_is_not_a_duplicate(self):
        first, _ = parse_explicit_questions(
            [
                StyledLine("Ερώτηση;"),
                StyledLine("Α. Ναι"),
                StyledLine("Β. Όχι"),
                StyledLine("ANSWER: A"),
            ],
            category="Κατηγορία",
            source="one.docx",
        )
        second, _ = parse_explicit_questions(
            [
                StyledLine("Ερώτηση;"),
                StyledLine("Α. Πάντα"),
                StyledLine("Β. Ποτέ"),
                StyledLine("ANSWER: B"),
            ],
            category="Κατηγορία",
            source="two.docx",
        )

        unique, duplicates = deduplicate_questions(first + second)

        self.assertEqual(2, len(unique))
        self.assertEqual([], duplicates)

    def test_generated_image_cleanup_preserves_unrelated_files(self):
        with tempfile.TemporaryDirectory() as directory:
            images = Path(directory)
            generated = images / "visual-0123456789abcdef0123.png"
            unrelated = images / "keep.png"
            generated.write_bytes(b"generated")
            unrelated.write_bytes(b"keep")

            clean_generated_images(images)

            self.assertFalse(generated.exists())
            self.assertTrue(unrelated.exists())


if __name__ == "__main__":
    unittest.main()
