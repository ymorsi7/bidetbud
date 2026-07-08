#!/usr/bin/env node
/**
 * One-off: point import scripts at scripts/lib/bidet-seed.cjs instead of inline HTML seed.
 */
const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname);
const requireLine = "const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');\n";

const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.cjs') && f !== 'migrate-bidet-seed-scripts.cjs');

let updated = 0;
for (const file of files) {
  const fp = path.join(scriptsDir, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes('BIDETBUD_SEED')) continue;
  if (src.includes("require('./lib/bidet-seed.cjs')")) continue;

  const original = src;

  // Drop html read used only for seed extraction
  src = src.replace(
    /const html(?:Path)? = path\.join\(__dirname, ['"]\.\.\/index\.html['"]\);\s*\n/g,
    ''
  );
  src = src.replace(
    /const html = fs\.readFileSync\(htmlPath, 'utf8'\);\s*\n/g,
    ''
  );
  src = src.replace(
    /const html = fs\.readFileSync\(path\.join\(__dirname, '\.\.\/index\.html'\), 'utf8'\);\s*\n/g,
    ''
  );

  src = src.replace(
    /const match = html\.match\(\/window\\\.BIDETBUD_SEED\\s\*=\\s*\(\[\[\\s\\S\]\*\?\]\);\/\);\s*\nif \(!match\) \{\s*\n\s*console\.error\([^)]+\);\s*\n\s*process\.exit\(1\);\s*\n\}\s*\n/g,
    ''
  );
  src = src.replace(
    /const (?:existing|seed|merged) = JSON\.parse\(match\[1\]\);\s*\n/g,
    (m) => {
      const varName = m.match(/const (\w+)/)[1];
      return `const ${varName} = readSeed();\n`;
    }
  );
  src = src.replace(
    /const seed = JSON\.parse\(html\.match\(\/window\\\.BIDETBUD_SEED\\s\*=\\s*\(\[\[\\s\\S\]\*\?\]\);\/\)\[1\]\);\s*\n/g,
    'const seed = readSeed();\n'
  );

  src = src.replace(
    /const newSeed(?:Json)? = JSON\.stringify\([^)]+\);\s*\nconst newHtml = html\.replace\(\s*\n?\s*\/window\\\.BIDETBUD_SEED\\s\*=\\s*\\\[\[\\s\\S\]\*\?\\\];\/,\s*\n?\s*`window\\.BIDETBUD_SEED = \$\{[^}]+\};`\s*\n?\s*\);\s*\nfs\.writeFileSync\(htmlPath, newHtml\);\s*\n/g,
    (m) => {
      const wm = m.match(/JSON\.stringify\((\w+)\)/);
      const varName = wm ? wm[1] : 'merged';
      return `writeSeed(${varName});\n`;
    }
  );
  src = src.replace(
    /const newHtml = html\.replace\(\s*\n?\s*\/window\\\.BIDETBUD_SEED\\s\*=\\s*\\\[\[\\s\\S\]\*\?\\\];\/,\s*\n?\s*`window\\.BIDETBUD_SEED = \$\{JSON\.stringify\((\w+)\)\};`\s*\n?\s*\);\s*\nfs\.writeFileSync\([^,]+, newHtml\);\s*\n/g,
    'writeSeed($1);\n'
  );

  if (!src.includes("require('./lib/bidet-seed.cjs')")) {
    const fsLine = src.indexOf("const fs = require('fs');\n");
    if (fsLine >= 0) {
      const insertAt = fsLine + "const fs = require('fs');\n".length;
      src = src.slice(0, insertAt) + requireLine + src.slice(insertAt);
    } else {
      src = requireLine + src;
    }
  }

  if (src !== original) {
    fs.writeFileSync(fp, src);
    updated++;
    console.log('updated', file);
  }
}

console.log(`Done — ${updated} script(s) migrated.`);
