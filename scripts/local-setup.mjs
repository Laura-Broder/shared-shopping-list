import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const owner = randomBytes(32).toString('base64url');
const partner = randomBytes(32).toString('base64url');
await writeFile(
  '.dev.vars',
  `AUTH_MODE=links\nOWNER_ACCESS_KEY=${owner}\nPARTNER_ACCESS_KEY=${partner}\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log('נוצרו שני מפתחות לפיתוח מקומי בלבד. לאחר הפעלת npm run dev פתחו:');
console.log(`http://localhost:8787/#key=${owner}`);
console.log('הקישור השני זמין מתוך אפשרויות הרשימה. אין להשתמש במפתחות הפיתוח בפריסה הציבורית.');
