const {execSync} = require('child_process');
const path = require('path');
const jestBin = path.join('node_modules', '.bin', 'jest.cmd');
try {
  const r = execSync('"' + jestBin + '" --json --no-coverage', {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: 30000
  });
  console.log('success, len=' + r.length);
  const j = JSON.parse(r);
  console.log('numFailed=' + j.numFailedTests + ' numTotal=' + j.numTotalTests);
} catch(e) {
  const out = e.stdout;
  console.log('caught, out len=' + (out ? out.length : 0));
  if (out) {
    try {
      const j = JSON.parse(out);
      console.log('numFailed=' + j.numFailedTests + ' numTotal=' + j.numTotalTests);
    } catch(pe) {
      console.log('parse err, out[:300]=' + out.slice(0, 300));
    }
  } else {
    console.log('stderr:', e.stderr ? e.stderr.slice(0,200) : 'none');
  }
}
