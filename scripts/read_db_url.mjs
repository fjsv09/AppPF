import fs from 'fs';
const content = fs.readFileSync('.db_url', 'utf16le');
console.log(content);
