#!/bin/bash
# PreToolUse guard for the playwright-test-healer agent (wired in its frontmatter).
#
# The healer may edit tests, so it may write - but only under e2e/ and specs/. Without this it
# could rewrite src/, CLAUDE.md or an agent's own `tools` line, because a rule in the prompt
# ("do not edit src/") is a request, not a barrier. Exit 2 blocks the call and tells the agent why.
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$file" in
  /*) abs="$file" ;;
  *) abs="$root/$file" ;;
esac
# Collapse ../ so "e2e/../src/x" cannot pass as e2e/.
abs=$(cd "$(dirname "$abs")" 2>/dev/null && pwd -P)/$(basename "$abs")

case "$abs" in
  "$root"/e2e/* | "$root"/specs/*) exit 0 ;;
esac
echo "Blocked: the test healer may only write under e2e/ and specs/ (tried: $file). If the application is wrong, report it; do not edit src/." >&2
exit 2
