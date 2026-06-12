# AGENTS.md

## Project Rules
- Do not run Playwright, `npm run dev`, or production data operations unless explicitly asked.
- Do not modify Cloudflare Console (Wrangler) settings. You can only suggest your modification in chat.
- Commit small completed edits with conventional commit messages.
- Keep committed repo files limited to durable project documentation and code. Put temporary implementation guidance or operator notes in `reference/` instead.
- `.dev.vars.example` is a tracked example file and should be committed when intentionally changed.

## Miscellaneous
- When using a full width space, use unicode \u3000 to set.
- Add comments only for non-trivial logic, and write code comments in English.

## Git
- Do commit automatically.
- Commit frequently instead of doing a large commit at the end of the work.
- Use conventional commits.
- Do not run any git commands other than `git add` and `git commit -m`. Do not use commit amendments. Instead, just submit a new commit.
