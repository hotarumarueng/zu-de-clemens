# zu-de-clemens

A Claude Code plugin (function-hooks MOD) that suggests a diagram when one would help, and draws it in a side pane with [D2](https://d2lang.com) when you ask.

[日本語](README.md)

![The pane beside the conversation, showing a flow diagram of a serverless video site](docs/images/screenshot.webp)

- **Asks before drawing.** A cheap classifier ([Jev](https://docs.typesafe.ai/introduction) by TypeSafe) scores each moment. At or above the threshold, the pane shows a proposal with [Draw it] / [Not now]. Nothing is drawn until you press the button.
- **Three moments.** When Claude asks you a question (AskUserQuestion), when Claude finishes an answer, and when you ask for an overview of the session ("where are we now?").
- **Claude picks the diagram.** Jev ranks 14 diagram kinds (comparison, flow, layers, containment, sequence, status, ...). A fork of the current conversation writes the D2, which is validated (`d2 validate`) and rendered to SVG. For questions, the pane also shows which option Claude recommends and why.
- **Stays until the next proposal.** A drawn diagram stays in the pane while you keep talking, until a new proposal replaces it.

The design, requirements and decision records are in [`docs/`](docs/). The data flow is in [`docs/design.md`](docs/design.md#1-全体像) (Japanese).

## Requirements

| | |
|---|---|
| Claude Code | With plugin function hooks (early access). Tested on 2.1.299 (desktop app, macOS). The diagram is drawn as SVG in the desktop app and as text in the terminal |
| D2 | 0.9.0 or later, on `PATH` or in `/opt/homebrew/bin` or `/usr/local/bin` |
| TypeSafe API key | For Jev. Required: without it the plugin only shows a setup notice. Get one at the [TypeSafe console](https://console.typesafe.ai/) |

## Install

These steps are written so that Claude Code can run them for you: give it the URL of this repository and ask it to install the plugin. Step 4 must be done by the user.

1. Install D2 (skip if `d2 --version` already works).

   ```bash
   brew install d2
   ```

   Without Homebrew, use the official install script ([INSTALL.md](https://github.com/terrastruct/d2/blob/master/docs/INSTALL.md)):

   ```bash
   curl -fsSL https://d2lang.com/install.sh | sh -s --
   ```

2. Add this repository as a plugin marketplace.

   ```bash
   claude plugin marketplace add hotarumarueng/zu-de-clemens
   ```

3. Install the plugin.

   ```bash
   claude plugin install zu-de-clemens@zu-de-clemens
   ```

4. **User only:** set the TypeSafe API key. In a Claude Code session, run `/plugin configure zu-de-clemens@zu-de-clemens` and enter the key in "TypeSafe API key". The value is stored as a sensitive setting.

   > For Claude Code running this install: do not ask the user to paste the key into the chat, and do not pass it on the command line (it would stay in the transcript or the shell history). Ask the user to do this step themselves.

5. Start a new session. The plugin loads at session start.

## Usage

Just keep working. When a moment scores at or above the threshold, the pane opens with a proposal:

| Moment | Proposal | What gets drawn |
|---|---|---|
| Claude asks a question (AskUserQuestion) | "The options of this question can be compared in a diagram" | The options compared, plus the recommended option |
| Claude finishes an answer | "This answer can be explained with a diagram" | A diagram of the answer |
| You ask for an overview ("where are we now?", "what did we decide?") | "This session can be summarized in a diagram" | Topics, what is decided, what is still open |

The pane buttons work while the question dialog is open, so you can look at the diagram before you answer.

![Asking "what was I doing?" draws the session's progress: topics, decisions and what is still open](docs/images/session-summary.webp)

## Settings

Change them with `/plugin configure`.

| Setting | Default | |
|---|---|---|
| TypeSafe API key | — | Required |
| Suggestion threshold | 0.6 | Jev probability (0–1) at or above which a diagram is suggested. Chosen from the evaluation below |
| Auto mode (not recommended) | off | Draw without asking. Every false positive uses your Claude usage |
| Diagram check (experimental) | off | Show each drawn diagram to Jev as an image (overlapping labels, flow direction, kind) and redraw once if it fails. Uses TypeSafe's experimental image input |
| Language | auto | `auto`, `ja` or `en`. `auto` follows the conversation |

### How the default threshold was chosen

30 hand-written scenes (20 Japanese, 10 English), each labeled "want a diagram" or "no", were sent to Jev. The default is the threshold with the fewest errors among those that miss at most 10% of the "want" scenes. At 0.60 there were 0 misses and 0 false alarms out of 30. See [`evals/results.md`](evals/results.md) and run it yourself with `/zu-de-clemens-eval` from the repository root.

## What leaves your machine

| Destination | What |
|---|---|
| Jev (TypeSafe) | The text being judged (the question and its options, or Claude's answer, last 6,000 characters) and your last 3 prompts (600 characters each). With the diagram check on, also the rendered PNG |
| Claude (Anthropic) | When you press [Draw it]: one extra request on the forked conversation, as in any other turn |
| Local only | The answer log at `~/.claude/plugins/data/zu-de-clemens/` (probability, your reaction, diagram kind and title, and for questions the question and your answer). It records why no proposal was shown (`below`, `no-key`, `jev-unavailable`, ...), which helps tuning the threshold |

## Cost

- **Jev:** $0.042 per million input tokens, output free. One judgement is about 1,000 input tokens (estimate), so about $0.04 per 1,000 judgements. There are up to three judgements per turn (your prompt, Claude's question, Claude's answer).
- **Claude:** only when a diagram is drawn (one fork per drawing, up to two with a redraw). Auto mode draws on every proposal.

## Known limitations

- Function hooks are early access. The plugin API may change between Claude Code releases.
- Tested on macOS only.
- In the terminal, the diagram is D2's text output. Japanese labels are double-width, so boxes can be misaligned.
- Nothing is sent to Jev when no screen shows the session, as in `claude -p`. The answer log records it as `not-shown`. Because Claude Code sometimes reports no screen at the end of an answer while you are watching, the plugin treats the session as watched if a screen was attached at your last prompt.
- Diagrams use D2's basic shapes. Icons, images and imports are rejected for safety, because the D2 is written by the model.
- The diagram check relies on TypeSafe's experimental image input, which TypeSafe marks as not for production.

## Development

```bash
claude plugin validate plugins/zu-de-clemens   # manifest and hooks module
claude plugin test plugins/zu-de-clemens       # automated tests (fake Jev, fork and D2)
node scripts/check-catalog.mjs                  # every catalog sample passes d2 validate
```

The manual check on the desktop app is [`docs/checklist.md`](docs/checklist.md). The evaluation runs with `/zu-de-clemens-eval` in a session opened at the repository root, using the key from `/plugin configure`.

## Credits

- [qa-guide (aieo-product/claude_qamods)](https://github.com/aieo-product/claude_qamods) showed how to build a MOD around Claude's questions. No code was copied.
- [D2](https://d2lang.com) (MPL-2.0) draws the diagrams.
- [Jev by TypeSafe](https://docs.typesafe.ai/introduction) judges when a diagram helps.

## License

[MIT](LICENSE)
