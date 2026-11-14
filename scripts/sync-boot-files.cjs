// Regenera a lista FILES do public/js/boot.js a partir dos arquivos reais (rodar após criar/remover arquivo em public/js).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public', 'js');
const list = [];
(function walk(d, pre) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name), pre + e.name + '/'); else if (e.name.endsWith('.js') && e.name !== 'boot.js') list.push(pre + e.name.slice(0, -3)); } })(root, '');
const top = list.filter((f) => !f.includes('/')).sort(), sub = list.filter((f) => f.includes('/')).sort();
const lit = "  var FILES = [" + [...top, ...sub].map((f) => `'${f}'`).join(', ') + '];';
const bf = path.join(root, 'boot.js');
const s = fs.readFileSync(bf, 'utf8');
const out = s.replace(/  var FILES = \[[\s\S]*?\];/, lit);
if (process.argv.includes('--check')) { if (out !== s) { console.error('boot.js FILES desatualizado: rode node scripts/sync-boot-files.cjs'); process.exit(1); } process.exit(0); }
fs.writeFileSync(bf, out);
console.log('FILES:', list.length);
