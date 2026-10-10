# 📋 Remind Jon List — Pythos Roadmap & Feature Incubation

Tasks, feature ideas, and architectural enhancements that show high potential but require design refinement before active UI rollout.

---

### 1. 📝 Problem & Solution Study Sheet Export (`exportLessonNotes`)
- **Status:** Functional generator preserved in `app.js` (`exportLessonNotes()`, `cleanQuestionStatement()`, `extractBoxedAnswers()`, `cleanAssistantSolution()`). UI button hidden from toolbar and header.
- **Why it has potential:** Allows students to generate clean, printable Markdown/study sheets of all math/physics problems solved in a tutoring session with final answers and step-by-step derivations, stripping out conversational chit-chat.
- **What needs work before re-enabling:**
  1. **UI Placement & UX:** Find a seamless, intuitive home for the action that feels natural and uncluttered (e.g. an action inside a session options dropdown menu, or at the bottom of the conversation when solving a multi-step problem).
  2. **Preview & Selection Modal:** Give students a lightweight preview drawer where they can toggle checkboxes on which solved problems to include before exporting.
  3. **Export Formats:** Add one-click PDF generation with pre-rendered KaTeX math, or direct LaTeX code export alongside Markdown.

---

*Last Updated: October 9, 2026*
