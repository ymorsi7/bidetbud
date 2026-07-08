#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname);
const targets = fs
  .readdirSync(dir)
  .filter(
    (f) =>
      f.endsWith('.cjs') &&
      (f.startsWith('import-') ||
        [
          'apply-address-fixes.cjs',
          'check-duplicates.cjs',
          'dedupe-seed.cjs',
          'fix-france-seed.cjs',
          'fix-restaurant-types.cjs',
        ].includes(f))
  );

for (const file of targets) {
  const fp = path.join(dir, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes("require('./lib/bidet-seed.cjs')")) continue;
  const orig = src;

  src = src.replace(
    /const match = html\.match\([\s\S]*?BIDETBUD_SEED[\s\S]*?\);\n(?:if \(!match\) \{[\s\S]*?\}\n\n?)?/g,
    ''
  );
  src = src.replace(/const (\w+) = JSON\.parse\(match\[1\]\);\n/g, 'const $1 = readSeed();\n');
  src = src.replace(
    /const newSeed(?:Json)? = JSON\.stringify\((\w+)\);\nconst newHtml = html\.replace\([\s\S]*?BIDETBUD_SEED[\s\S]*?\);\n\n?fs\.writeFileSync\([^)]+\);\n/g,
    'writeSeed($1);\n'
  );
  src = src.replace(
    /const newHtml = html\.replace\([\s\S]*?BIDETBUD_SEED[\s\S]*?\);\n\s*fs\.writeFileSync\([^)]+\);\n/g,
    (m) => {
      const wm = m.match(/JSON\.stringify\((\w+)\)/);
      return wm ? `writeSeed(${wm[1]});\n` : m;
    }
  );
  src = src.replace(
    /const newSeedJson = JSON\.stringify\(seed\);\nconst newHtml = html\.replace\([\s\S]*?BIDETBUD_SEED[\s\S]*?\);\n\s*fs\.writeFileSync\(htmlPath, newHtml\);\n/g,
    'writeSeed(seed);\n'
  );

  if (file === 'check-duplicates.cjs') {
    src = src.replace(/const \{ readSeed, writeSeed \}/, 'const { readSeed }');
  }
  if (file === 'apply-address-fixes.cjs') {
    src = src.replace(/console\.log\('Updated', htmlPath\);/g, "console.log('Updated bidet seed');");
  }

  if (src !== orig) {
    fs.writeFileSync(fp, src);
    console.log('fixed', file);
  }
}

console.log('done');
