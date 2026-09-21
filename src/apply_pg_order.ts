import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

const contentPath = 'C:/Users/Joshua/.gemini/antigravity-cli/brain/4c0b6826-90b5-40f9-8809-75d834c1d64e/.system_generated/steps/460/content.md';
const content = fs.readFileSync(contentPath, 'utf8');
const html = content.substring(content.indexOf('<!doctype html>'));
const $ = cheerio.load(html);

// Map item name -> cid, and game_id -> cid
const nameToCid = new Map<string, number>();
const idToCid = new Map<number, number>();

function cleanName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

$('li').each((_, li) => {
  const title = $(li).find('p.item-title').text().trim();
  const rawId = $(li).find('p.r-itemid').text().trim();
  const cidAttr = $(li).attr('data-cid');
  if (title && cidAttr !== undefined) {
    const cid = parseInt(cidAttr, 10);
    nameToCid.set(cleanName(title), cid);
    const idMatch = rawId.match(/\d+$/);
    if (idMatch) {
      idToCid.set(parseInt(idMatch[0], 10), cid);
    }
  }
});

const jsonPath = path.resolve(__dirname, '../data/items.json');
const publicJsonPath = path.resolve(__dirname, '../public/data/items.json');
const dbPath = path.resolve(__dirname, '../data/isaac.db');

const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const db = new DatabaseSync(dbPath);

const stmt = db.prepare(`
  UPDATE items
  SET color_order = ?
  WHERE id = ?
`);

let matchedCount = 0;

for (const item of items) {
  const cName = cleanName(item.name);
  let cid = nameToCid.get(cName);
  if (cid === undefined && idToCid.has(item.game_id)) {
    cid = idToCid.get(item.game_id);
  }

  if (cid === undefined && item.name === 'Broken Glass Cannon') {
    const gcCid = nameToCid.get('glasscannon');
    cid = gcCid !== undefined ? gcCid : 200;
  }

  if (cid !== undefined) {
    item.color_order = cid;
    stmt.run(cid, item.id);
    matchedCount++;
  } else {
    console.warn('Could not find cid for item:', item.name);
  }
}

db.close();

fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2));
fs.writeFileSync(publicJsonPath, JSON.stringify(items, null, 2));

console.log(`Successfully mapped and updated all ${matchedCount} / ${items.length} items to the exact Screenshot / Platinum God color arrangement!`);
