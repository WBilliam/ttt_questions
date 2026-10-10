from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Iterable, Literal, Sequence


CHOICE_KEYS = ("A", "B", "C", "D", "E", "F")
LABEL_MAP = {
    "A": "A",
    "B": "B",
    "C": "C",
    "D": "D",
    "E": "E",
    "F": "F",
    "Α": "A",
    "Β": "B",
    "Γ": "C",
    "Δ": "D",
    "Ε": "E",
    "ΣΤ": "F",
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "D",
    "5": "E",
    "6": "F",
}
ANSWER_RE = re.compile(
    r"(?:ANSWER|ΣΩΣΤΗ\s+ΑΠΑΝΤΗΣΗ)\s*:?\s*([A-FΑ-Ε]|ΣΤ)\b",
    re.IGNORECASE,
)
CHOICE_RE = re.compile(
    r"^\s*[\[(]?\s*(ΣΤ|[A-FΑ-Ε])\s*[\].):\-]\s*(.+?)\s*$",
    re.IGNORECASE,
)
CHOICE_LABEL_ONLY_RE = re.compile(
    r"^\s*[\[(]?\s*(ΣΤ|[A-FΑ-Ε])\s*[\].):\-]\s*$", re.IGNORECASE
)
NUMBERED_CHOICE_RE = re.compile(r"^\s*[\[(]?\s*([1-9])\s*[\].):\-]\s*(.+?)\s*$")
QUESTION_NUMBER_RE = re.compile(r"^\s*(?:Ερ\.\s*)?\d+(?:η|ο|ος)?\s*[.)\-:]?\s*", re.IGNORECASE)
ANSWER_METADATA_RE = re.compile(r"^\.?\s*(?:ANSWER|ΣΩΣΤΗ\s+ΑΠΑΝΤΗΣΗ)\s*:?\s*$", re.IGNORECASE)
TRAILING_ANSWER_METADATA_RE = re.compile(
    r"\.?\s*(?:ANSWER|ΣΩΣΤ[ΗΉ]\s+ΑΠ[ΑΆ]ΝΤΗΣΗ)\s*:?\s*$", re.IGNORECASE
)
GENERATED_IMAGE_RE = re.compile(r"^visual-[0-9a-f]{20}\.png$")
CONFIRMED_SOURCE_LINE_SPLITS = {
    (
        "ΤΕΧΝΙΚΗ ΑΝΑΛΥΣΗ.docx",
        "1. 12x12 2. 2. 10x10 ✓",
    ): ("1. 12x12", "2. 10x10 ✓"),
}


@dataclass(frozen=True)
class StyledLine:
    text: str
    bold: bool = False
    colors: tuple[str, ...] = ()
    index: int = 0
    list_id: str | None = None
    list_level: int | None = None
    style: str = ""
    page: int | None = None
    top: float | None = None
    bottom: float | None = None


@dataclass(frozen=True)
class ExtractedQuestion:
    category: str
    prompt: str
    choices: list[str]
    correct_option: str
    source: str
    source_index: int = 0
    image: str = ""
    image_alt: str = ""


@dataclass(frozen=True)
class ExtractionIssue:
    source: str
    category: str
    location: str
    reason: str
    excerpt: str = ""


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def fold_for_match(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFD", normalize_text(value))
        if unicodedata.category(character) != "Mn"
    )


def strip_question_number(value: str) -> str:
    return normalize_text(QUESTION_NUMBER_RE.sub("", value, count=1))


def normalize_label(value: str) -> str | None:
    key = normalize_text(value).upper()
    return LABEL_MAP.get(key)


def strip_trailing_answer_metadata(value: str) -> str:
    return normalize_text(TRAILING_ANSWER_METADATA_RE.sub("", value))


def _choice_parts(value: str, allow_numeric: bool = False) -> tuple[str, str] | None:
    match = CHOICE_RE.match(normalize_text(value))
    if not match and allow_numeric:
        match = NUMBERED_CHOICE_RE.match(normalize_text(value))
    if not match:
        return None
    key = normalize_label(match.group(1)) or (match.group(1) if allow_numeric else None)
    text = strip_trailing_answer_metadata(match.group(2))
    return (key, text) if key and text else None


def _apply_confirmed_source_line_splits(
    lines: Sequence[StyledLine], source: str
) -> list[StyledLine]:
    source_name = Path(source).name
    corrected: list[StyledLine] = []
    for line in lines:
        replacements = CONFIRMED_SOURCE_LINE_SPLITS.get(
            (source_name, normalize_text(line.text))
        )
        if replacements:
            corrected.extend(replace(line, text=text) for text in replacements)
        else:
            corrected.append(line)
    return corrected


def _choice_label_only(value: str) -> str | None:
    match = CHOICE_LABEL_ONLY_RE.match(normalize_text(value))
    return normalize_label(match.group(1)) if match else None


def _issue(
    source: str,
    category: str,
    line: StyledLine | None,
    reason: str,
    excerpt: str = "",
) -> ExtractionIssue:
    index = line.index if line else 0
    return ExtractionIssue(
        source=source,
        category=category,
        location=f"παράγραφος/γραμμή {index}" if index else "άγνωστη θέση",
        reason=reason,
        excerpt=excerpt or (line.text if line else ""),
    )


def _record_from_block(
    block: Sequence[StyledLine],
    answer: str,
    category: str,
    source: str,
) -> tuple[ExtractedQuestion | None, ExtractionIssue | None]:
    first_choice = next(
        (
            i
            for i, line in enumerate(block)
            if _choice_parts(line.text) or _choice_label_only(line.text)
        ),
        None,
    )
    if first_choice is None:
        return None, _issue(source, category, block[0] if block else None, "δεν εντοπίστηκαν επιλογές")

    prompt_block = [line for line in block[:first_choice] if normalize_text(line.text)]
    prompt_starts = [
        i
        for i, line in enumerate(prompt_block)
        if QUESTION_NUMBER_RE.match(line.text) or line.list_level == 0
    ]
    if prompt_starts:
        prompt_block = prompt_block[prompt_starts[-1] :]
    prompt_lines = [normalize_text(line.text) for line in prompt_block]
    prompt = strip_question_number(" ".join(prompt_lines))

    choices: list[str] = []
    labels: list[str] = []
    for line in block[first_choice:]:
        parts = _choice_parts(line.text)
        if parts:
            label, choice = parts
            labels.append(label)
            choices.append(choice)
        elif label := _choice_label_only(line.text):
            labels.append(label)
            choices.append("")
        elif choices:
            choices[-1] = normalize_text(f"{choices[-1]} {line.text}")

    if not prompt:
        return None, _issue(source, category, block[0] if block else None, "λείπει το κείμενο της ερώτησης")
    if len(choices) < 2 or any(not choice for choice in choices):
        return None, _issue(source, category, block[0] if block else None, "εντοπίστηκαν λιγότερες από δύο επιλογές", prompt)
    expected_labels = list(CHOICE_KEYS[: len(labels)])
    if labels != expected_labels:
        return None, _issue(source, category, block[first_choice], "οι ετικέτες επιλογών δεν είναι συνεχόμενες", ", ".join(labels))
    if answer not in labels:
        return None, _issue(source, category, block[-1], "η σωστή απάντηση δεν αντιστοιχεί σε επιλογή", answer)
    return (
        ExtractedQuestion(
            category=category,
            prompt=prompt,
            choices=choices,
            correct_option=answer,
            source=source,
            source_index=prompt_block[0].index if prompt_block else 0,
        ),
        None,
    )


def parse_explicit_questions(
    lines: Sequence[StyledLine], category: str, source: str
) -> tuple[list[ExtractedQuestion], list[ExtractionIssue]]:
    questions: list[ExtractedQuestion] = []
    issues: list[ExtractionIssue] = []
    block: list[StyledLine] = []
    for line in lines:
        text = normalize_text(line.text)
        if not text:
            continue
        match = ANSWER_RE.search(fold_for_match(text))
        if not match:
            block.append(line)
            continue
        answer = normalize_label(match.group(1))
        if not answer:
            issues.append(_issue(source, category, line, "μη αναγνωρίσιμη σωστή απάντηση"))
        else:
            record, issue = _record_from_block(block, answer, category, source)
            if record:
                questions.append(record)
            if issue:
                issues.append(issue)
        block = []
    if block and any(_choice_parts(line.text) for line in block):
        issues.append(_issue(source, category, block[0], "η τελευταία ερώτηση δεν έχει σαφή ένδειξη σωστής απάντησης"))
    return questions, issues


CorrectStyle = Literal["bold", "red", "blue", "check"]


def _line_is_correct(line: StyledLine, style: CorrectStyle) -> bool:
    colors = {color.upper().replace("#", "") for color in line.colors}
    if style == "bold":
        return line.bold
    if style == "red":
        return any(
            len(color) == 6
            and int(color[0:2], 16) >= 190
            and int(color[2:4], 16) <= 90
            and int(color[4:6], 16) <= 90
            for color in colors
        )
    if style == "blue":
        return any(
            len(color) == 6
            and int(color[0:2], 16) <= 90
            and int(color[4:6], 16) >= 150
            for color in colors
        )
    return "✓" in line.text or "✔" in line.text


def _looks_like_question_start(line: StyledLine, numeric_choices: bool = False) -> bool:
    text = normalize_text(line.text)
    if numeric_choices and NUMBERED_CHOICE_RE.match(text):
        return False
    return bool(
        QUESTION_NUMBER_RE.match(text)
        or text.lower().startswith("ερ.")
        or text.endswith("?")
        or line.list_level == 0
        or (line.bold and _choice_parts(text) is None and NUMBERED_CHOICE_RE.match(text) is None)
    )


def _is_unlabelled_question_start(line: StyledLine) -> bool:
    if line.list_level == 0 and line.style == "List Paragraph":
        return True
    return line.bold and line.list_level != 1 and not line.colors


def _styled_group_to_record(
    group: Sequence[StyledLine],
    category: str,
    source: str,
    correct_style: CorrectStyle,
    unlabelled_choices: bool,
    numeric_choices: bool,
) -> tuple[ExtractedQuestion | None, ExtractionIssue | None]:
    if not group:
        return None, None
    if unlabelled_choices:
        if len(group) < 3:
            return None, None
        prompt_candidates = [i for i, line in enumerate(group) if _is_unlabelled_question_start(line)]
        if not prompt_candidates:
            return None, None
        prompt_start = max(prompt_candidates)
        prompt_lines = [group[prompt_start]]
        choice_lines = list(group[prompt_start + 1 :])
    else:
        first_choice = next(
            (i for i, line in enumerate(group) if _choice_parts(line.text, numeric_choices)),
            None,
        )
        if first_choice is None:
            return None, None
        possible_prompt = list(group[:first_choice])
        prompt_start = max(
            (
                i
                for i, line in enumerate(possible_prompt)
                if _looks_like_question_start(line, numeric_choices)
            ),
            default=0,
        )
        prompt_lines = possible_prompt[prompt_start:]
        choice_lines = list(group[first_choice:])

    prompt = strip_question_number(" ".join(line.text for line in prompt_lines))
    prompt_source_index = prompt_lines[0].index if prompt_lines else 0
    choices: list[str] = []
    marked: set[int] = set()
    for line in choice_lines:
        if ANSWER_METADATA_RE.fullmatch(fold_for_match(line.text)):
            continue
        parts = _choice_parts(line.text, numeric_choices) if not unlabelled_choices else None
        if numeric_choices and len(re.findall(r"(?:^|\s)[1-9][.)]\s*", line.text)) > 1:
            return None, _issue(
                source,
                category,
                line,
                "η ίδια γραμμή περιέχει περισσότερες από μία αριθμημένες επιλογές",
            )
        if parts or unlabelled_choices:
            choice = parts[1] if parts else strip_trailing_answer_metadata(line.text)
            choice = normalize_text(choice.replace("✓", "").replace("✔", ""))
            if not choice:
                continue
            choices.append(choice)
            if _line_is_correct(line, correct_style):
                marked.add(len(choices) - 1)
        elif choices:
            choices[-1] = normalize_text(
                f"{choices[-1]} {line.text.replace('✓', '').replace('✔', '')}"
            )
            if _line_is_correct(line, correct_style):
                marked.add(len(choices) - 1)

    if not prompt or len(choices) < 2:
        return None, _issue(source, category, group[0], "η ομάδα δεν περιέχει πλήρη ερώτηση με τουλάχιστον δύο επιλογές", prompt)
    if len(marked) != 1:
        word = "καμία" if not marked else "δύο ή περισσότερες"
        return None, _issue(source, category, group[0], f"εντοπίστηκαν {word} σημειωμένες σωστές επιλογές", prompt)
    if len(choices) > len(CHOICE_KEYS):
        return None, _issue(source, category, group[0], "εντοπίστηκαν περισσότερες από έξι επιλογές", prompt)
    return (
        ExtractedQuestion(
            category=category,
            prompt=prompt,
            choices=choices,
            correct_option=CHOICE_KEYS[next(iter(marked))],
            source=source,
            source_index=prompt_source_index,
        ),
        None,
    )


def parse_styled_questions(
    lines: Sequence[StyledLine],
    category: str,
    source: str,
    correct_style: CorrectStyle,
    unlabelled_choices: bool = False,
    numeric_choices: bool = False,
) -> tuple[list[ExtractedQuestion], list[ExtractionIssue]]:
    if numeric_choices:
        lines = _apply_confirmed_source_line_splits(lines, source)

    groups: list[list[StyledLine]] = []
    current: list[StyledLine] = []
    for line in lines:
        if not normalize_text(line.text):
            continue
        is_question_start = (
            _is_unlabelled_question_start(line)
            if unlabelled_choices
            else _looks_like_question_start(line, numeric_choices)
        )
        if current and is_question_start:
            has_choices = len(current) > 1 if unlabelled_choices else any(
                _choice_parts(item.text, numeric_choices) for item in current
            )
            if has_choices:
                groups.append(current)
                current = []
        current.append(line)
    if current:
        groups.append(current)

    questions: list[ExtractedQuestion] = []
    issues: list[ExtractionIssue] = []
    for group in groups:
        record, issue = _styled_group_to_record(
            group, category, source, correct_style, unlabelled_choices, numeric_choices
        )
        if record:
            questions.append(record)
        if issue:
            issues.append(issue)
    return questions, issues


def deduplicate_questions(
    questions: Iterable[ExtractedQuestion],
) -> tuple[list[ExtractedQuestion], list[ExtractionIssue]]:
    unique: list[ExtractedQuestion] = []
    duplicates: list[ExtractionIssue] = []
    seen: set[tuple[str, str, tuple[str, ...], str]] = set()
    for question in questions:
        key = (
            normalize_text(question.category).casefold(),
            normalize_text(question.prompt).casefold(),
            tuple(normalize_text(choice).casefold() for choice in question.choices),
            question.correct_option,
        )
        if key in seen:
            duplicates.append(
                ExtractionIssue(
                    source=question.source,
                    category=question.category,
                    location=f"παράγραφος/γραμμή {question.source_index}",
                    reason="ακριβές διπλότυπο ερώτησης στην ίδια κατηγορία",
                    excerpt=question.prompt,
                )
            )
            continue
        seen.add(key)
        unique.append(question)
    return unique, duplicates


def read_docx_lines(path: Path) -> list[StyledLine]:
    from docx import Document
    from docx.oxml.ns import qn

    document = Document(path)
    lines: list[StyledLine] = []
    for index, paragraph in enumerate(document.paragraphs, start=1):
        text = normalize_text(paragraph.text)
        if not text:
            continue
        colors: set[str] = set()
        bold = False
        for run in paragraph.runs:
            if normalize_text(run.text) and run.bold is True:
                bold = True
            if run.font.color.rgb:
                colors.add(str(run.font.color.rgb).upper())
            color_nodes = run._r.xpath("./w:rPr/w:color")
            for node in color_nodes:
                value = node.get(qn("w:val"))
                if value and value.lower() != "auto":
                    colors.add(value.upper())
        paragraph_colors = paragraph._p.xpath("./w:pPr/w:rPr/w:color")
        for node in paragraph_colors:
            value = node.get(qn("w:val"))
            if value and value.lower() != "auto":
                colors.add(value.upper())
        paragraph_bold = paragraph._p.xpath("./w:pPr/w:rPr/w:b")
        if paragraph_bold:
            value = paragraph_bold[0].get(qn("w:val"))
            bold = value not in {"0", "false", "off"}

        num_pr = paragraph._p.pPr.numPr if paragraph._p.pPr is not None else None
        list_id = None
        list_level = None
        if num_pr is not None:
            if num_pr.numId is not None:
                list_id = str(num_pr.numId.val)
            if num_pr.ilvl is not None:
                list_level = int(num_pr.ilvl.val)
        lines.append(
            StyledLine(
                text=text,
                bold=bold,
                colors=tuple(sorted(colors)),
                index=index,
                list_id=list_id,
                list_level=list_level,
                style=paragraph.style.name if paragraph.style else "",
            )
        )
    return lines


def read_pdf_lines(path: Path) -> list[StyledLine]:
    import pdfplumber

    lines: list[StyledLine] = []
    index = 0
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages):
            extracted = page.extract_text_lines(strip=True, return_chars=False) or []
            for raw_line in extracted:
                text = normalize_text(str(raw_line.get("text", "")))
                if text:
                    index += 1
                    lines.append(
                        StyledLine(
                            text=text,
                            index=index,
                            page=page_number,
                            top=float(raw_line.get("top", 0)),
                            bottom=float(raw_line.get("bottom", raw_line.get("top", 0))),
                        )
                    )
    return lines


INLINE_CHOICE_RE = re.compile(r"(?<!\S)([A-DΑΒΓΔ])\.\s*", re.IGNORECASE)


def expand_inline_choices(lines: Sequence[StyledLine]) -> list[StyledLine]:
    expanded: list[StyledLine] = []
    for line in lines:
        matches = list(INLINE_CHOICE_RE.finditer(line.text))
        if len(matches) < 2:
            expanded.append(line)
            continue
        prefix = normalize_text(line.text[: matches[0].start()])
        if prefix:
            expanded.append(
                StyledLine(
                    text=prefix,
                    bold=line.bold,
                    colors=line.colors,
                    index=line.index,
                    list_id=line.list_id,
                    list_level=line.list_level,
                    style=line.style,
                )
            )
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(line.text)
            text = normalize_text(line.text[match.start() : end])
            expanded.append(
                StyledLine(
                    text=text,
                    bold=line.bold,
                    colors=line.colors,
                    index=line.index,
                    list_id=line.list_id,
                    list_level=line.list_level,
                    style=line.style,
                )
            )
    return expanded


PDF_HEADER_PATTERNS = (
    "ΣΧΟΛΗ ΕΠΙΜΟΡΦΩΣΗΣ ΑΘΛΗΜΑΤΩΝ",
    "ΓΡΑΠΤΕΣ ΕΞΕΤΑΣΕΙΣ",
    "ΣΤΟ ΜΑΘΗΜΑ",
    "ΥΠΕΥΘΥΝΟΣ ΚΑΘΗΓΗΤΗΣ",
    "ΗΜΕΡΟΜΗΝΙΑ",
    "ΚΥΚΛΩΝΟΥΜΕ ΤΗΝ ΟΡΘΗ ΑΠΑΝΤΗΣΗ",
)


def filter_pdf_headers(lines: Sequence[StyledLine]) -> list[StyledLine]:
    result: list[StyledLine] = []
    for line in lines:
        folded = fold_for_match(line.text).upper().strip("() ")
        if any(folded.startswith(pattern) for pattern in PDF_HEADER_PATTERNS):
            continue
        result.append(line)
    return result


RAW_CHOICE_PREFIX_RE = re.compile(r"^\s*([A-FΑ-Ε]|ΣΤ)\s*[\].):\-]\s*", re.IGNORECASE)
VISUAL_LABEL_RE = re.compile(r"(?<!\w)(ΣΤ|[A-FΑ-Ε])\s*[).]", re.IGNORECASE)
GENERIC_CHOICES = ("Επιλογή Α", "Επιλογή Β", "Επιλογή Γ", "Επιλογή Δ", "Επιλογή Ε", "Επιλογή ΣΤ")
VISUAL_LABEL_SEQUENCE_RE = re.compile(
    r"\s+(?:ΑΡΧΙΚ[ΗΉ]\s+Θ[ΕΈ]ΣΗ\s*)?(?:(?:ΣΤ|[A-FΑ-Ε])\s*\)?\s*){2,}$",
    re.IGNORECASE,
)
VISUAL_SINGLE_LABEL_RE = re.compile(r"(?<=\s)(?:ΣΤ|[A-FΑ-Ε])\)?(?=\s)", re.IGNORECASE)
VISUAL_TRAILING_LABEL_RE = re.compile(r"(:)\s*(?:ΣΤ|[A-FΑ-Ε])\s*$", re.IGNORECASE)
VISUAL_POSITION_CAPTION_RE = re.compile(r"\s+ΑΡΧΙΚ[ΗΉ]\s+Θ[ΕΈ]ΣΗ\s*$", re.IGNORECASE)


def clean_visual_prompt(value: str) -> str:
    prompt = normalize_text(value)
    prompt = VISUAL_LABEL_SEQUENCE_RE.sub("", prompt)
    prompt = VISUAL_POSITION_CAPTION_RE.sub("", prompt)
    prompt = VISUAL_TRAILING_LABEL_RE.sub(r"\1", prompt)
    prompt = VISUAL_SINGLE_LABEL_RE.sub("", prompt)
    return normalize_text(prompt)


def extract_visual_choices(block: Sequence[StyledLine]) -> tuple[list[str], dict[str, str]]:
    labels: list[str] = []
    texts: dict[str, str] = {}
    for line in block:
        matches = list(VISUAL_LABEL_RE.finditer(line.text))
        if not matches:
            continue
        for index, match in enumerate(matches):
            label = normalize_label(match.group(1))
            if not label:
                continue
            labels.append(label)
            end = matches[index + 1].start() if index + 1 < len(matches) else len(line.text)
            text = normalize_text(line.text[match.end() : end])
            if text:
                texts[label] = text
    return labels, texts


def _has_formatted_visual_choice_text(line: StyledLine) -> bool:
    matches = list(VISUAL_LABEL_RE.finditer(line.text))
    if len(matches) != 1 or not RAW_CHOICE_PREFIX_RE.match(line.text):
        return False
    return bool(normalize_text(line.text[matches[0].end() :]))


def build_visual_question(
    block: Sequence[StyledLine],
    answer: str,
    category: str,
    source: str,
    image: str,
) -> tuple[ExtractedQuestion | None, ExtractionIssue | None]:
    question_starts = [i for i, line in enumerate(block) if QUESTION_NUMBER_RE.match(line.text)]
    start = question_starts[-1] if question_starts else 0
    prompt_lines: list[str] = []
    detected_labels, visual_choice_text = extract_visual_choices(block[start:])
    found_choice_row = False
    for line in block[start:]:
        raw_choice = RAW_CHOICE_PREFIX_RE.match(line.text)
        if raw_choice:
            found_choice_row = True
            continue
        if not found_choice_row:
            prompt_lines.append(line.text)
    prompt = clean_visual_prompt(strip_question_number(" ".join(prompt_lines)))
    if not prompt:
        return None, _issue(source, category, block[start] if block else None, "λείπει το κείμενο της οπτικής ερώτησης")
    detected_count = max(4, max((CHOICE_KEYS.index(label) + 1 for label in detected_labels), default=4))
    choice_count = max(2, min(detected_count, 6))
    choices = [
        visual_choice_text.get(key, GENERIC_CHOICES[index])
        for index, key in enumerate(CHOICE_KEYS[:choice_count])
    ]
    if answer not in CHOICE_KEYS[:choice_count]:
        return None, _issue(source, category, block[start], "η σωστή απάντηση δεν αντιστοιχεί στις οπτικές επιλογές", answer)
    return (
        ExtractedQuestion(
            category=category,
            prompt=prompt,
            choices=choices,
            correct_option=answer,
            source=source,
            source_index=block[start].index,
            image=image,
            image_alt=f"Οπτικές επιλογές για την ερώτηση: {prompt}",
        ),
        None,
    )


def render_visual_question_crop(
    pdf_path: Path,
    block: Sequence[StyledLine],
    answer_line: StyledLine,
    output_path: Path,
) -> None:
    import pdfplumber
    from PIL import Image

    positioned = [line for line in block if line.page is not None and line.top is not None]
    question_starts = [line for line in positioned if QUESTION_NUMBER_RE.match(line.text)]
    start_line = question_starts[-1] if question_starts else (positioned[0] if positioned else None)
    if start_line is None or answer_line.page is None or answer_line.top is None:
        raise ValueError(f"Δεν υπάρχουν συντεταγμένες για την οπτική ερώτηση στο {pdf_path}")

    end_page, end_top = visual_crop_end(block, answer_line)

    images: list[Image.Image] = []
    with pdfplumber.open(pdf_path) as document:
        for page_number in range(start_line.page, end_page + 1):
            page = document.pages[page_number]
            top = max(0.0, (start_line.top or 0.0) - 8.0) if page_number == start_line.page else 0.0
            ends_at_answer = end_page == answer_line.page and end_top == answer_line.top
            margin = 0.5 if ends_at_answer else 8.0
            bottom = max(top + 1.0, end_top - margin) if page_number == end_page else page.height
            cropped = page.crop((0.0, top, page.width, min(bottom, page.height)))
            images.append(cropped.to_image(resolution=150, antialias=True).original.convert("RGB"))
    width = max(image.width for image in images)
    height = sum(image.height for image in images)
    combined = Image.new("RGB", (width, height), "white")
    offset = 0
    for image in images:
        combined.paste(image, (0, offset))
        offset += image.height
    pixels = combined.load()
    highlight_pixels = 0
    for y in range(combined.height):
        for x in range(combined.width):
            red, green, blue = pixels[x, y]
            if red >= 180 and green >= 150 and blue <= 160 and red - blue >= 55:
                highlight_pixels += 1
    for y in range(combined.height):
        for x in range(combined.width):
            red, green, blue = pixels[x, y]
            if red >= 180 and green >= 150 and blue <= 160 and red - blue >= 55:
                pixels[x, y] = (255, 255, 255)
            elif (
                highlight_pixels >= 50
                and red >= 45
                and green >= 45
                and red - blue >= 30
                and green - blue >= 30
            ):
                pixels[x, y] = (0, 0, 0)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.save(output_path, format="PNG", optimize=True)


def visual_crop_end(
    block: Sequence[StyledLine], answer_line: StyledLine
) -> tuple[int, float]:
    if answer_line.page is None or answer_line.top is None:
        raise ValueError("Η γραμμή απάντησης δεν έχει συντεταγμένες")
    formatted_choices = sorted(
        (
            line
            for line in block
            if line.page is not None
            and line.top is not None
            and _has_formatted_visual_choice_text(line)
        ),
        key=lambda line: (line.page, line.top),
    )
    if formatted_choices:
        first_choice = formatted_choices[0]
        return first_choice.page or 0, first_choice.top or 0.0
    return answer_line.page, answer_line.top


def parse_pdf_questions(
    path: Path, category: str, images_dir: Path
) -> tuple[list[ExtractedQuestion], list[ExtractionIssue]]:
    source = path.as_posix()
    lines = filter_pdf_headers(read_pdf_lines(path))
    questions: list[ExtractedQuestion] = []
    issues: list[ExtractionIssue] = []
    block: list[StyledLine] = []
    for line in lines:
        match = ANSWER_RE.search(fold_for_match(line.text))
        if not match:
            block.append(line)
            continue
        answer = normalize_label(match.group(1))
        if not answer:
            issues.append(_issue(source, category, line, "μη αναγνωρίσιμη σωστή απάντηση"))
            block = []
            continue
        record, text_issue = _record_from_block(block, answer, category, source)
        if record:
            questions.append(record)
        else:
            source_index = next(
                (item.index for item in reversed(block) if QUESTION_NUMBER_RE.match(item.text)),
                block[0].index if block else 0,
            )
            digest = hashlib.sha256(f"{source}|{source_index}".encode("utf-8")).hexdigest()[:20]
            filename = f"visual-{digest}.png"
            visual, visual_issue = build_visual_question(
                block, answer, category, source, filename
            )
            if visual:
                try:
                    render_visual_question_crop(path, block, line, images_dir / filename)
                    questions.append(visual)
                except Exception as error:
                    issues.append(_issue(source, category, line, f"απέτυχε η δημιουργία οπτικής επιλογής: {error}"))
            else:
                issues.append(visual_issue or text_issue or _issue(source, category, line, "αποτυχία εξαγωγής"))
        block = []
    return questions, issues


CATEGORY_MATCHERS = (
    ("ANTI DOPING", "Αντιντόπινγκ"),
    ("E-KOUROS", "E-KOUROS"),
    ("ΒΙΟΜΗΧΑΝΙΚ", "Βιομηχανική"),
    ("ΦΥΣΙΚΟΘΕΡΑΠ", "Φυσικοθεραπεία"),
    ("ΚΙΝΗΤΙΚΗ ΜΑΘΗΣ", "Κινητική Μάθηση"),
    ("ΟΡΓΑΝΩΣΗ ΚΑΙ ΔΙΟΙΚΗΣΗ", "Οργάνωση και Διοίκηση Αθλητισμού"),
    ("ΕΡΓΟΦΥΣΙΟΛΟΓ", "Εργοφυσιολογία"),
    ("ΑΝΑΤΟΜ", "Ανατομία"),
    ("ΜΕΘΟΔΟΛΟΓΙΑ ΕΡΕΥΝ", "Μεθοδολογία Έρευνας"),
    ("ΓΕΝΙΚΗ ΠΡΟΠΟΝ", "Γενική Προπονητική"),
    ("ΦΥΣΙΟΛΟΓ", "Φυσιολογία"),
    ("ΑΘΛΗΤΙΚΗ ΨΥΧΟΛΟΓ", "Αθλητική Ψυχολογία"),
    ("ΑΘΛΗΤΙΚΗ ΠΑΙΔΑΓΩΓ", "Αθλητική Παιδαγωγική"),
    ("ΕΙΔΙΚΗ ΠΡΟΠΟΝ", "Ειδική Προπονητική"),
    ("ΗΘΙΚΗ ΚΑΙ ΑΚΕΡΑΙΟΤ", "Ηθική και Ακεραιότητα"),
    ("ΙΣΤΟΡΙΑ ΤΟΥ ΤΑΕΚΒΟΝΤΟ", "Ιστορία του Ταεκβοντό"),
    ("ΚΑΝΟΝΙΣΜΟΙ ΑΓΩΝ", "Κανονισμοί Αγώνων"),
    ("ΜΕΘΟΔΟΛΟΓΙΑ ΔΙΔΑΣΚ", "Μεθοδολογία Διδασκαλίας"),
    ("ΠΑΡΑΒΙΑΣΗ ΔΙΚΑΙΩΜΑΤΩΝ ΠΑΙΔΙΟΥ", "Παραβίαση Δικαιωμάτων Παιδιού"),
    ("ΤΕΧΝΙΚΗ ΑΝΑΛΥΣ", "Τεχνική Ανάλυση"),
)


def category_for_path(path: Path) -> str:
    folded = fold_for_match(str(path)).upper()
    for fragment, category in CATEGORY_MATCHERS:
        if fragment in folded:
            return category
    raise ValueError(f"Δεν υπάρχει αντιστοίχιση κατηγορίας για: {path}")


def extract_source(path: Path, images_dir: Path | None = None) -> tuple[list[ExtractedQuestion], list[ExtractionIssue]]:
    category = category_for_path(path)
    source = path.as_posix()
    if path.suffix.lower() == ".pdf":
        if images_dir is None:
            images_dir = Path("content/production/images")
        return parse_pdf_questions(path, category, images_dir)

    lines = read_docx_lines(path)
    folded_name = fold_for_match(path.name).upper()
    if path.name.lower().startswith("gga") or "ANTI DOPING" in folded_name:
        return parse_explicit_questions(lines, category, source)
    if "ΙΣΤΟΡΙΑ ΤΟΥ ΤΑΕΚΒΟΝΤΟ" in folded_name:
        return parse_explicit_questions(expand_inline_choices(lines), category, source)
    if "E-KOUROS" in folded_name:
        return parse_styled_questions(lines, category, source, "bold", unlabelled_choices=True)
    if "ΜΕΘΟΔΟΛΟΓΙΑ ΔΙΔΑΣΚ" in folded_name:
        return parse_styled_questions(lines, category, source, "red", unlabelled_choices=True)
    if "ΕΙΔΙΚΗ ΠΡΟΠΟΝ" in folded_name:
        return parse_styled_questions(lines, category, source, "blue")
    if "ΤΕΧΝΙΚΗ ΑΝΑΛΥΣ" in folded_name:
        return parse_styled_questions(lines, category, source, "check", numeric_choices=True)
    return parse_styled_questions(lines, category, source, "bold")


def extract_directory(
    source_dir: Path, images_dir: Path | None = None
) -> tuple[list[ExtractedQuestion], list[ExtractionIssue], dict[str, int]]:
    questions: list[ExtractedQuestion] = []
    issues: list[ExtractionIssue] = []
    source_counts: dict[str, int] = {}
    files = sorted(
        (path for path in source_dir.rglob("*") if path.suffix.lower() in {".docx", ".pdf"}),
        key=lambda path: fold_for_match(str(path)).casefold(),
    )
    for path in files:
        extracted, source_issues = extract_source(path, images_dir)
        questions.extend(extracted)
        issues.extend(source_issues)
        source_counts[path.as_posix()] = len(extracted)
    unique, duplicates = deduplicate_questions(questions)
    issues.extend(duplicates)
    return unique, issues, source_counts


def write_extraction_outputs(
    questions: Sequence[ExtractedQuestion],
    issues: Sequence[ExtractionIssue],
    source_counts: dict[str, int],
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        {
            "category": question.category,
            "question": question.prompt,
            **{
                f"option_{key.lower()}": question.choices[index] if index < len(question.choices) else ""
                for index, key in enumerate(CHOICE_KEYS)
            },
            "correct_option": question.correct_option,
            "explanation": "",
            "image": question.image,
            "image_alt": question.image_alt,
            "source": question.source,
            "source_index": question.source_index,
        }
        for question in questions
    ]
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    category_counts: dict[str, int] = {}
    for question in questions:
        category_counts[question.category] = category_counts.get(question.category, 0) + 1
    prompt_groups: dict[tuple[str, str], list[ExtractedQuestion]] = {}
    for question in questions:
        key = (
            normalize_text(question.category).casefold(),
            normalize_text(question.prompt).casefold(),
        )
        prompt_groups.setdefault(key, []).append(question)
    same_prompt_variants = [
        {
            "category": group[0].category,
            "prompt": group[0].prompt,
            "variantCount": len(group),
            "sources": [
                {"source": question.source, "sourceIndex": question.source_index}
                for question in group
            ],
        }
        for group in prompt_groups.values()
        if len(group) > 1
    ]
    report = {
        "includedQuestions": len(questions),
        "excludedQuestions": len(issues),
        "samePromptVariantGroups": same_prompt_variants,
        "samePromptVariantAdditionalQuestions": sum(
            item["variantCount"] - 1 for item in same_prompt_variants
        ),
        "categoryCounts": dict(sorted(category_counts.items())),
        "sourceCounts": source_counts,
        "issues": [asdict(issue) for issue in issues],
    }
    report_path = output_path.with_name("extraction-report.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report_path


def clean_generated_images(images_dir: Path) -> None:
    if not images_dir.exists():
        return
    for path in images_dir.iterdir():
        if path.is_file() and GENERATED_IMAGE_RE.fullmatch(path.name):
            path.unlink()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Extract normalized quiz questions from DOCX/PDF sources.")
    parser.add_argument("--source", type=Path, default=Path("question docs"))
    parser.add_argument("--output", type=Path, default=Path("content/production/questions.json"))
    parser.add_argument("--inspect-source", type=Path)
    args = parser.parse_args()
    if args.inspect_source:
        path = args.inspect_source
        lines = read_docx_lines(path) if path.suffix.lower() == ".docx" else read_pdf_lines(path)
        for line in lines:
            print(
                f"{line.index:04d} bold={int(line.bold)} colors={','.join(line.colors) or '-'} "
                f"list={line.list_id or '-'}:{line.list_level if line.list_level is not None else '-'} "
                f"style={line.style or '-'} page={line.page if line.page is not None else '-'} "
                f"top={line.top if line.top is not None else '-'} | {line.text}"
            )
        return
    images_dir = args.output.parent / "images"
    clean_generated_images(images_dir)
    images_dir.mkdir(parents=True, exist_ok=True)
    questions, issues, source_counts = extract_directory(args.source, images_dir)
    report_path = write_extraction_outputs(questions, issues, source_counts, args.output)
    print(f"Εξήχθησαν {len(questions)} ερωτήσεις από {len(source_counts)} αρχεία.")
    print(f"Εξαιρέθηκαν {len(issues)} εγγραφές· αναφορά: {report_path}")


if __name__ == "__main__":
    main()
