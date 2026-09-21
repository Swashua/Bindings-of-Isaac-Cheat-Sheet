import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

export interface ItemData {
  id: number;
  game_id: number;
  name: string;
  type: 'Activated' | 'Passive';
  image_url: string;
  local_image: string;
  quote: string;
  description: string;
  quality: number | null;
  unlock_condition: string;
  is_unlocked_by_default: number;
  dominant_color?: string;
  color_group?: string;
  color_order?: number;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cleanNameKey(str: string): string {
  return str.toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchWikiPage(apiUrl: string, pageTitle: string): Promise<string> {
  const url = `${apiUrl}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json`;
  console.log(`[Scraper] Fetching ${pageTitle} from ${apiUrl}...`);
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    maxContentLength: 50 * 1024 * 1024,
    timeout: 30000,
  });

  if (!response.data || !response.data.parse || !response.data.parse.text) {
    throw new Error(`Failed to parse page ${pageTitle}`);
  }

  return response.data.parse.text['*'];
}

async function getUnlockablesMap(): Promise<Map<string, string>> {
  const unlockMap = new Map<string, string>();

  // 1. Fetch from Flash Unlockables: https://bindingofisaac.fandom.com/wiki/Unlockables
  try {
    const flashHtml = await fetchWikiPage('https://bindingofisaac.fandom.com/api.php', 'Unlockables');
    const $ = cheerio.load(flashHtml);
    let flashCount = 0;

    $('table').each((_, table) => {
      let lastUnlock = '';
      $(table).find('tr').each((__, tr) => {
        const tds = $(tr).find('td');
        if (tds.length === 3) {
          const name = $(tds[0]).text().trim();
          const type = $(tds[1]).text().trim();
          const how = $(tds[2]).text().trim();
          if (how) lastUnlock = how;
          if (name && (type.toLowerCase().includes('collectible') || type.toLowerCase().includes('activated'))) {
            unlockMap.set(cleanNameKey(name), how || lastUnlock);
            flashCount++;
          }
        } else if (tds.length === 2) {
          const name = $(tds[0]).text().trim();
          const type = $(tds[1]).text().trim();
          if (name && (type.toLowerCase().includes('collectible') || type.toLowerCase().includes('activated'))) {
            if (lastUnlock) {
              unlockMap.set(cleanNameKey(name), lastUnlock);
              flashCount++;
            }
          }
        }
      });
    });
    console.log(`[Scraper] Loaded ${flashCount} unlocks from Flash wiki.`);
  } catch (err: any) {
    console.warn(`[Scraper] Warning: Failed to fetch Flash unlockables: ${err.message}`);
  }

  // 2. Fetch from Rebirth Achievements: https://bindingofisaacrebirth.fandom.com/wiki/Achievements
  try {
    const achHtml = await fetchWikiPage('https://bindingofisaacrebirth.fandom.com/api.php', 'Achievements');
    const $ = cheerio.load(achHtml);
    let achCount = 0;

    $('table').each((tableIdx, table) => {
      if (tableIdx > 3) return; // Tables 0-3 correspond to base Rebirth, Afterbirth, Afterbirth+, Repentance
      $(table).find('tr').each((__, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 4) {
          const name = $(tds[0]).text().trim();
          const desc = $(tds[2]).text().trim();
          const unlock = $(tds[3]).text().trim();
          if (name && unlock) {
            const key = cleanNameKey(name);
            // Rebirth achievement unlocks are more comprehensive for Rebirth/Repentance
            unlockMap.set(key, unlock);
            achCount++;

            // If the achievement description explicitly mentions unlocking an item
            const itemMatch = desc.match(/unlocked\s+(?:the\s+)?([a-z0-9\s'-]+)/i);
            if (itemMatch && itemMatch[1]) {
              const matchedKey = cleanNameKey(itemMatch[1]);
              if (!unlockMap.has(matchedKey)) {
                unlockMap.set(matchedKey, unlock);
              }
            }
          }
        }
      });
    });
    console.log(`[Scraper] Loaded ${achCount} achievements from Rebirth wiki.`);
  } catch (err: any) {
    console.warn(`[Scraper] Warning: Failed to fetch Rebirth achievements: ${err.message}`);
  }

  return unlockMap;
}

export async function scrapeItems(): Promise<ItemData[]> {
  const unlockMap = await getUnlockablesMap();

  console.log('[Scraper] Fetching Items page from Rebirth wiki...');
  const itemsHtml = await fetchWikiPage('https://bindingofisaacrebirth.fandom.com/api.php', 'Items');
  const $ = cheerio.load(itemsHtml);

  const items: ItemData[] = [];

  const parseSection = (sectionName: string, type: 'Activated' | 'Passive') => {
    let targetTable: any = null;

    $('h2').each((_, h2) => {
      if ($(h2).text().includes(sectionName)) {
        targetTable = $(h2).nextAll('table').first();
      }
    });

    if (!targetTable || targetTable.length === 0) {
      console.warn(`[Scraper] Could not find table for ${sectionName}`);
      return;
    }

    const rows = targetTable.find('tbody tr').length > 0 ? targetTable.find('tbody tr') : targetTable.find('tr');
    console.log(`[Scraper] Parsing ${type} Collectibles table (${rows.length} rows)...`);

    rows.each((rowIndex: number, tr: any) => {
      const ths = $(tr).find('th');
      if (ths.length > 0) return; // Skip header

      const tds = $(tr).find('td');
      if (tds.length < 5) return;

      // Col 0: Item Name
      const name = $(tds[0]).text().trim();
      if (!name) return;

      // Col 1: Item ID (extract numeric value, removing "5.100.")
      const rawIdText = $(tds[1]).text().trim();
      const idMatch = rawIdText.match(/\d+$/);
      const id = idMatch ? parseInt(idMatch[0], 10) : items.length + 1;

      // Col 2: Icon
      // IMPORTANT: User specified:
      // "grab only the name, the image of the item but dont include the bar to the right of it"
      // In Activated items, Col 2 contains 2 divs:
      // 1) item icon
      // 2) recharge bar ("Recharge 3.png", etc.)
      let imageUrl = '';
      $(tds[2]).find('img').each((_, img) => {
        const alt = $(img).attr('alt') || '';
        const imgName = $(img).attr('data-image-name') || '';

        // Ignore recharge bars and room indicator images
        if (
          !imgName.toLowerCase().startsWith('recharge') &&
          !alt.toLowerCase().includes('rooms') &&
          !imageUrl
        ) {
          let src = $(img).attr('data-src') || $(img).attr('src') || '';
          if (src.startsWith('data:') && $(img).attr('data-src')) {
            src = $(img).attr('data-src')!;
          }
          if (src) {
            // Clean URL: remove any thumbnail scaling down to get crisp full size
            src = src.replace(/\/scale-to-width-down\/\d+/, '');
            imageUrl = src;
          }
        }
      });

      // Col 3: In-game Quote
      const quote = $(tds[3]).text().trim();

      // Col 4: Description
      // Clean up internal newlines and extra spaces
      const description = $(tds[4]).text().replace(/\s+/g, ' ').trim();

      // Col 5: Quality (0 to 4, or null)
      let quality: number | null = null;
      if (tds.length >= 6) {
        const qText = $(tds[5]).text().trim();
        const parsedQ = parseInt(qText, 10);
        if (!isNaN(parsedQ)) {
          quality = parsedQ;
        }
      }

      // Unlock condition lookup
      const cKey = cleanNameKey(name);
      let unlockCondition = unlockMap.get(cKey) || '';
      let isUnlockedByDefault = 0;

      if (!unlockCondition) {
        // Check without trailing roman numerals or variant words
        const baseKey = cKey.replace(/\d+$/, '');
        if (baseKey !== cKey && unlockMap.has(baseKey)) {
          unlockCondition = unlockMap.get(baseKey)!;
        }
      }

      if (unlockCondition) {
        isUnlockedByDefault = 0;
      } else {
        unlockCondition = 'Unlocked by default (Available from the start)';
        isUnlockedByDefault = 1;
      }

      const gameId = id;
      items.push({
        id: items.length + 1,
        game_id: gameId,
        name,
        type,
        image_url: imageUrl,
        local_image: `/images/items/${type.toLowerCase()}_${gameId}.png`,
        quote,
        description,
        quality,
        unlock_condition: unlockCondition,
        is_unlocked_by_default: isUnlockedByDefault,
      });
    });
  };

  parseSection('Activated Collectibles', 'Activated');
  parseSection('Passive Collectibles', 'Passive');

  // Sort items by game_id ascending, then type
  items.sort((a, b) => a.game_id - b.game_id || a.type.localeCompare(b.type));
  // Re-assign sequential unique ID
  items.forEach((item, index) => {
    item.id = index + 1;
  });

  console.log(`[Scraper] Successfully scraped ${items.length} total items!`);
  const activeCount = items.filter(i => i.type === 'Activated').length;
  const passiveCount = items.filter(i => i.type === 'Passive').length;
  const unlockableCount = items.filter(i => i.is_unlocked_by_default === 0).length;
  console.log(`[Scraper] Breakdown: ${activeCount} Active, ${passiveCount} Passive, ${unlockableCount} Require Unlock.`);

  return items;
}

export function saveToDatabase(items: ItemData[], dbPath: string) {
  console.log(`[Database] Saving ${items.length} items to SQLite database at ${dbPath}...`);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  db.exec(`
    DROP TABLE IF EXISTS items;
    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      game_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_image TEXT NOT NULL,
      quote TEXT,
      description TEXT,
      quality INTEGER,
      unlock_condition TEXT,
      is_unlocked_by_default INTEGER NOT NULL,
      dominant_color TEXT,
      color_group TEXT,
      color_order INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_items_game_id ON items(game_id);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_quality ON items(quality);
    CREATE INDEX IF NOT EXISTS idx_items_unlocked ON items(is_unlocked_by_default);
    CREATE INDEX IF NOT EXISTS idx_items_color_order ON items(color_order);
  `);

  const insert = db.prepare(`
    INSERT INTO items (
      id, game_id, name, type, image_url, local_image, quote, description, quality, unlock_condition, is_unlocked_by_default, dominant_color, color_group, color_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    insert.run(
      item.id,
      item.game_id,
      item.name,
      item.type,
      item.image_url,
      item.local_image,
      item.quote,
      item.description,
      item.quality,
      item.unlock_condition,
      item.is_unlocked_by_default,
      item.dominant_color || '#888888',
      item.color_group || 'Gray',
      item.color_order || 999
    );
  }

  db.close();
  console.log('[Database] SQLite database updated successfully.');
}

export async function downloadImages(items: ItemData[], outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[Downloader] Caching images into ${outputDir}...`);
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  // Concurrency limit to be polite
  const concurrency = 15;
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (item) => {
        if (!item.image_url) return;
        const fileName = `${item.type.toLowerCase()}_${item.game_id}.png`;
        const filePath = path.join(outputDir, fileName);
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 50) {
          skipped++;
          return;
        }

        try {
          const res = await axios.get(item.image_url, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': USER_AGENT,
              'Referer': 'https://bindingofisaacrebirth.fandom.com/',
            },
            timeout: 10000,
          });
          fs.writeFileSync(filePath, res.data);
          downloaded++;
        } catch {
          failed++;
        }
      })
    );
  }

  console.log(`[Downloader] Finished caching images: ${downloaded} downloaded, ${skipped} already existed, ${failed} failed.`);
}

async function run() {
  const items = await scrapeItems();

  // 1. Download images locally
  const imagesDir = path.resolve(__dirname, '../public/images/items');
  await downloadImages(items, imagesDir);

  // 2. Compute dominant colors and color order
  const { analyzeImageColor } = await import('./compute_colors');
  for (const item of items) {
    const fileName = `${item.type.toLowerCase()}_${item.game_id}.png`;
    const filePath = path.join(imagesDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const colorData = await analyzeImageColor(filePath);
        item.dominant_color = colorData.hex;
        item.color_group = colorData.color_group;
        item.color_order = colorData.color_sort_order;
      } catch {
        item.dominant_color = '#888888';
        item.color_group = 'Gray';
        item.color_order = 999;
      }
    }
  }

  // 3. Save to SQLite database
  const dbPath = path.resolve(__dirname, '../data/isaac.db');
  saveToDatabase(items, dbPath);

  // 4. Save JSON copies for frontend static access
  const jsonPath = path.resolve(__dirname, '../data/items.json');
  fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2));

  const publicJsonPath = path.resolve(__dirname, '../public/data/items.json');
  fs.writeFileSync(publicJsonPath, JSON.stringify(items, null, 2));

  console.log(`[Scraper] Exported items.json to ${jsonPath} and ${publicJsonPath}`);
  console.log('[Scraper] All scraping and color analysis tasks completed successfully!');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[Scraper] Fatal error:', err);
    process.exit(1);
  });
}
