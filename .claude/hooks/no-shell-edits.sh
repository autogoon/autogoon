#!/usr/bin/env bash
# PreToolUse/Bash: deny a script being used to edit files.
#
# Edits go through Edit and Write, which render a reviewable diff. A script
# rewrite renders nothing, so the change is invisible and has to be taken on
# trust from a summary — and batching six into one script is what makes a bad
# edit hard to catch.
#
# The check is on the PROGRAM BEING RUN, not on the text of the command. Only an
# interpreter or a stream editor can do this; git, npm, grep and gh cannot, so
# they are never examined. Scanning command text instead caught arrows in commit
# messages, `->` in format strings, and every heredoc regardless of what fed it.
#
# Always exits 0; a denial is carried in the JSON, not the exit code.
set -uo pipefail

# DISABLED. The checks below stand but are unreachable: they were catching
# commands that edit nothing, a commit message among them. Delete this line to
# turn the hook back on.
exit 0

cmd=$(jq -r '.tool_input.command // ""')

USE_TOOLS="Use Edit or Write instead — they render a diff that can be reviewed."

deny() {
  jq -n --arg r "$1 $USE_TOOLS" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# A path that may be written freely: scratch space, not the working tree.
scratch() {
  case $1 in
  /dev/null | /dev/stderr | /dev/stdout) return 0 ;;
  /tmp/* | /private/tmp/* | /var/folders/*) return 0 ;;
  *scratchpad*) return 0 ;;
  *) return 1 ;;
  esac
}

# Deny if this segment redirects anywhere but scratch. Shared by every tool
# below, since `>` writes the same whoever produced the bytes.
check_redirect() {
  local seg=$1 target
  # Arrows are not redirects.
  seg=${seg//->/  }
  seg=${seg//=>/  }
  while read -r target; do
    [[ -z $target ]] && continue
    scratch "$target" && continue
    deny "Redirecting into $target writes a file with no diff."
  done < <(grep -oE '>>?[[:space:]]*[^[:space:];&|)]+' <<<"$seg" |
    sed -E 's/^>>?[[:space:]]*//')
}

# Split into segments on the operators that start a new command, and judge each
# by the program it runs. A heredoc body is data, so stop at the first `<<` —
# the marker itself stays on the line being judged.
head_of_cmd=${cmd%%$'\n'*}
segments=$(tr ';|&\n' '\n' <<<"${cmd%%<<*}")

while IFS= read -r seg; do
  # Leading token, past any VAR=value prefixes.
  read -r -a words <<<"$seg"
  prog=""
  for w in "${words[@]}"; do
    [[ $w == *=* && $w != /* && $w != -* ]] && continue
    prog=${w##*/}
    break
  done
  [[ -z $prog ]] && continue

  case $prog in
  # Interpreters. A heredoc or an inline script is how they edit files.
  python | python3 | perl | ruby | node)
    # perl and ruby take -i too, clustered: -0pi, -pi.bak.
    case $prog in
    perl | ruby)
      grep -qE -- "(^|[[:space:]])-[a-zA-Z0-9.]*i" <<<"$seg" &&
        deny "An in-place rewrite leaves no diff."
      ;;
    esac
    grep -qE "(^|[[:space:]])$prog([[:space:]]|$)" <<<"$head_of_cmd" &&
      grep -q '<<' <<<"$cmd" &&
      deny "A heredoc script edits files invisibly."
    # A write call, or open() with a mode — the mode follows a comma, so a file
    # named 'x' is not mistaken for mode 'x'.
    grep -qE -- "-[ce][[:space:]]" <<<"$seg" &&
      grep -qE '\.write\(|writeFileSync|open\([^)]*,[^)]*["'"'"'][^"'"'"']*[wax]' <<<"$cmd" &&
      deny "That inline script writes to a file."
    check_redirect "$seg"
    ;;
  # Stream editors. `-i` means in place; anywhere in a clustered flag counts.
  sed | gsed | awk | gawk)
    grep -qE -- "(^|[[:space:]])-[a-zA-Z0-9.]*i" <<<"$seg" &&
      deny "An in-place rewrite leaves no diff."
    check_redirect "$seg"
    ;;
  # Shell builtins that only reach a file through a redirect.
  echo | cat | printf)
    check_redirect "$seg"
    ;;
  esac
done <<<"$segments"

exit 0
