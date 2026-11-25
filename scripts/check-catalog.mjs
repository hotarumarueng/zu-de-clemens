// 図の種類カタログの D2 の見本が、すべて d2 validate を通るかを確かめる。
import { spawnSync } from 'node:child_process'

import { KINDS } from '../plugins/zu-de-clemens/hooks/catalog.ts'

let failed = 0
for (const kind of KINDS) {
  // md の種類は D2 で描かないので対象外
  if (kind.form === 'md') continue
  const r = spawnSync('d2', ['validate', '-'], { input: kind.sample, encoding: 'utf8' })
  if (r.status !== 0) {
    failed++
    console.error(`NG ${kind.id}: ${(r.stderr || r.stdout).trim()}`)
  } else {
    console.log(`ok ${kind.id}`)
  }
}
process.exit(failed ? 1 : 0)
