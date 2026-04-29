<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Before Every Commit

Run `make test` before every `git commit`. Do not commit if any tests fail — fix the failures first.

# Before Every Push

Run all of the following before every `git push`. Do not push if any step fails — fix the failures first.

```
make docker-build
make lint
```
