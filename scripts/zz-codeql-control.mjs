// THROWAWAY — negative control for the CodeQL merge gate (2026-10-01 plan, Task 4).
// It plants a command-injection bug on purpose so the pull request proves the code scan
// blocks a merge. The very next commit deletes this file. Never merge it on its own.
import { execSync } from 'node:child_process'
import http from 'node:http'

http
  .createServer((req, res) => {
    const name = new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? ''
    res.end(execSync(`ls ${name}`))
  })
  .listen(0)
