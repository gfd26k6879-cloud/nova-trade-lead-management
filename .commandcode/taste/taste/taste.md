# Taste
- Uses the Orca screen reader; keep progress updates, errors, approvals, blockers, delegated-task status, and final results concise and accessible in plain text — never rely on visual indicators alone. Confidence: 1.0
- Prefers concise plain-text progress updates at least every 60 seconds during long-running work, plus regular agent assignment/completion summaries. Confidence: 0.9
- Wants plain-language explanations of status, remaining work, and next steps; gets confused by dense process jargon and asks for clarification in simple terms. Confidence: 0.8
- Wants maximum safe concurrency: use as many subagents as possible to finish faster, with a root conductor that delegates exact bounded tasks, independently reviews every result before acceptance, and reuses agent slots. Confidence: 1.0
- Maintains strict authorization boundaries: local edits, tests, docs, and local commits are fine; pushes, pull requests, main merges, deployment, and any external/remote mutations require fresh explicit approval. Confidence: 0.9
- Never destructive with git: no reset --hard, force-push, or history rewriting; unexpected working-tree changes belong to the user and must never be discarded. Confidence: 0.9
- Likes reusable conductor/orchestrator prompt templates that can be pasted into a new terminal to resume work with maximum concurrency. Confidence: 0.8
- Expects periodic status summaries: current position in the plan, how much work remains, what's next, and why. Confidence: 0.8
- Project development moved from Windows to Fedora Linux; Windows-specific code must be made portable, and Supabase/Postgres is the target database going forward. Confidence: 0.8
