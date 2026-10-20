# Curriculum and intellectual-property policy

NovaSchool writes its own curriculum. Other curricula are studied for facts
and structure, never copied.

## What may and may not be used

| Allowed | Not allowed without written permission |
| --- | --- |
| Facts and scientific principles (Ohm's law, photosynthesis) | Syllabus or specification wording, copied or lightly reworded |
| The existence of a topic at a grade level | Textbook chapters, explanations, diagrams or illustrations |
| External reference codes used only to map our outcomes | Past exam questions, mark schemes, examiner reports |
| Openly licensed material within its licence (e.g. CC BY with attribution) | Translations made by others |
| Public-domain material | Logos, names or claims suggesting endorsement |

## Process for every new outcome, lesson, question or lab

1. Record each consulted source in `content_sources`: title, publisher, URL, access date, licence, permitted use, attribution text.
2. Write the content in our own words. A reviewer checks that no protected wording, structure of expression or example has been reproduced.
3. Link the content to its sources in `content_provenance` with the right relation (`informed_by` for facts).
4. Map to external pathways by code only, as `unverified`, until a named reviewer checks the alignment. Never write "equivalent to", "approved by" or "aligned with [board]" in public copy unless `officially_endorsed` is recorded with written evidence.
5. Publish only after review (status `published` needs a reviewer).

## Programmes in scope

Pakistani national and provincial boards and Cambridge International first; Chinese and South Korean frameworks later. Each starts as a `curriculum_pathways` row with `officially_endorsed = false`.

## AI-drafted content

Marked `ai_drafted = true`, never published without human review, and subject to the same source and wording rules.

## Free core

Core learning and virtual labs must work without paid AI services.
