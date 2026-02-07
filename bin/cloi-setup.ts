#!/usr/bin/env node
/*  Terminal Helper shell-RC bootstrap — idempotent & non-interactive capable  */
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

/* ---------- config ------------------------------------------------------ */
const SENTINEL = '# >>> Terminal Helper_HISTORY_SETTINGS >>>';
const SNIPPET = `
${SENTINEL}
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY
# <<< Terminal Helper_HISTORY_SETTINGS <<<
`;
/* ----------------------------------------------------------------------- */

const argvHas = (flag: string): boolean => process.argv.slice(2).includes(flag);
const interactive = !argvHas('--auto');

if (process.env.TERMINAL_HELPER_SKIP_ZSHRC === '1') {
  console.log('ℹ︎ Skipping ~/.zshrc modification – Terminal Helper_SKIP_ZSHRC=1');
  process.exit(0);
}

/* resolve correct home dir even when run under sudo */
const sudoUser = process.env.SUDO_USER;
let homeDir: string;
try {
  homeDir = sudoUser
    ? execSync(`eval echo "~${sudoUser}"`, { encoding: 'utf8' }).trim()
    : os.homedir();
} catch {
  homeDir = os.homedir();
}
const ZSHRC = path.join(homeDir, '.zshrc');

/* read existing file (if any) */
let content = fs.existsSync(ZSHRC) ? fs.readFileSync(ZSHRC, 'utf8') : '';

if (content.includes(SENTINEL)) {
  console.log('✅ Terminal Helper history settings already present – nothing to do.');
  process.exit(0);
}

async function confirm(q: string): Promise<boolean> {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin,
                                          output: process.stdout });
    rl.question(q + ' (Y/n) ', a => {
      rl.close(); res(/^y(es)?$/i.test(a.trim() || 'y'));
    });
  });
}

(async () => {
  if (interactive) {
    const ok = await confirm(
      'Terminal Helper will add history settings to your ~/.zshrc. Proceed?'
    );
    if (!ok) { console.log('Aborted.'); process.exit(0); }
  } else {
    console.log('ℹ︎ --auto mode: patching ~/.zshrc without prompt.');
  }

  /* ensure file exists, then append */
  if (!fs.existsSync(ZSHRC)) fs.writeFileSync(ZSHRC, '', 'utf8');
  fs.appendFileSync(ZSHRC, SNIPPET, 'utf8');
  console.log('✅ Added Terminal Helper history settings to ~/.zshrc');
})().catch(err => {
  console.error('❌ Error updating ~/.zshrc:', err);
  process.exit(1);
});
