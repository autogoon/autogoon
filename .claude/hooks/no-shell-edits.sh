#!/usr/bin/env bash
# PreToolUse/Bash: deny a shell command being used to edit files.
#
# Edits go through Edit and Write, which render a reviewable diff. A script
# rewrite renders nothing, so the change is invisible and has to be taken on
# trust from a summary — and batching six into one script is what makes a bad
# edit hard to catch.
#
# Two paths, because the evidence differs:
#
#   sed -i / perl -i    Decided here. The -i says outright that the file is
#                       rewritten in place, so no judgement is needed — and
#                       requiring the flag keeps a plain `sed -n '1,5p' file`
#                       off the slow path.
#   python / bash       Handed to Claude. A script's effect is not visible in
#                       its shape: `python3 -c "print(open(f).read())"` reads
#                       and `python3 -c "open(f,'w')..."` writes, and no regex
#                       tells them apart. Costs a few seconds on the commands
#                       that mention either word.
#
# Everything else runs unexamined, and no decision is ever made from the shape
# of the text alone: a commit message, a format string or a heredoc body can
# contain anything that reads like an edit. Only a flag that admits the rewrite,
# or Claude having read the script, denies a command.
#
# It fails open at every step — a missing dependency, a timeout, an unexpected
# answer all allow the command. A blocked commit is more disruptive than the
# invisible edit this guards against.
#
# Always exits 0; a denial is carried in the JSON, not the exit code.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')
[[ -z $cmd ]] && exit 0

deny() {
  jq -n --arg r "You MUST NOT use shell commands to edit source or documentation files, use the Edit tool instead." '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# In-place rewrites. `[^|;&]*` keeps the flag in the same command as the tool,
# so the -i in `sed -n 1,5p f | grep -i x` belongs to grep and is not matched.
grep -qE '(^|[^[:alnum:]_])sed[^|;&]*[[:space:]]-[[:alnum:]]*i' <<<"$cmd" && deny
grep -qE '(^|[^[:alnum:]_])perl[^|;&]*[[:space:]]-[[:alnum:].]*i' <<<"$cmd" && deny

# Interpreters, where only reading the script tells you what it does.
grep -qiE 'python|bash' <<<"$cmd" || exit 0

command -v claude >/dev/null || exit 0

read -r -d '' prompt <<PROMPT
You are a guard on a code repository. Decide whether the shell command below
writes to a file inside the project working tree — a script that opens a file
for writing or appending, an in-place stream edit, or a redirect into a tracked
path.

Answer ALLOW for everything else, including: reading or printing files, running
tests, builds, linters or formatters, git and gh commands, and writes to /tmp or
a scratchpad directory. Text inside a commit message or a string literal is not
a command.

Reply with exactly one word, BLOCK or ALLOW. If you are unsure, reply ALLOW.

Command:
$cmd
PROMPT

# Run from /tmp so the nested CLI does not load this project's hooks and call
# itself. Closing stdin skips a 3-second wait for piped input that never comes.
# No timeout here: the hook's own timeout in .claude/settings.json kills a slow
# call, and a killed hook allows the command.
verdict=$(cd /tmp && claude -p \
  --model claude-opus-5 \
  --disable-slash-commands \
  "$prompt" </dev/null 2>/dev/null |
  grep -oiE '\b(BLOCK|ALLOW)\b' | head -1 | tr '[:lower:]' '[:upper:]')

[[ $verdict == BLOCK ]] && deny
exit 0
