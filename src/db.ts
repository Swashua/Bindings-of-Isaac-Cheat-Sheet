import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import { ItemData } from './scraper';

const DB_PATH = path.resolve(__dirname, '../data/isaac.db');

export function getDb(): DatabaseSync {
  return new DatabaseSync(DB_PATH);
}

export interface ItemFilterOptions {
  search?: string;
  type?: string;
  quality?: string;
  unlocked?: string; // 'default' | 'unlockable' | 'all'
  sort?: 'color' | 'id' | 'name' | 'quality';
  order?: 'asc' | 'desc';
}

export function queryItems(options: ItemFilterOptions = {}): ItemData[] {
  const db = getDb();

  let query = 'SELECT * FROM items WHERE 1=1';
  const params: any[] = [];

  if (options.search) {
    query += ' AND (name LIKE ? OR description LIKE ? OR quote LIKE ? OR unlock_condition LIKE ?)';
    const term = `%${options.search}%`;
    params.push(term, term, term, term);
  }

  if (options.type && options.type.toLowerCase() !== 'all') {
    query += ' AND LOWER(type) = LOWER(?)';
    params.push(options.type);
  }

  if (options.quality !== undefined && options.quality !== '' && options.quality.toLowerCase() !== 'all') {
    const qNum = parseInt(options.quality, 10);
    if (!isNaN(qNum)) {
      query += ' AND quality = ?';
      params.push(qNum);
    }
  }

  if (options.unlocked === 'default') {
    query += ' AND is_unlocked_by_default = 1';
  } else if (options.unlocked === 'unlockable') {
    query += ' AND is_unlocked_by_default = 0';
  }

  // Sort
  const sortCol = options.sort || 'color';
  const sortOrder = options.order === 'desc' ? 'DESC' : 'ASC';

  if (sortCol === 'color') {
    query += ` ORDER BY color_order ${sortOrder}, game_id ASC`;
  } else if (sortCol === 'quality') {
    // Put null qualities at the end
    query += ` ORDER BY quality IS NULL, quality ${sortOrder}, game_id ASC`;
  } else if (sortCol === 'name') {
    query += ` ORDER BY name ${sortOrder}`;
  } else {
    query += ` ORDER BY game_id ${sortOrder}`;
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as unknown as ItemData[];
  db.close();

  return rows;
}

export function getItemById(id: number): ItemData | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM items WHERE id = ? OR game_id = ? LIMIT 1');
  const row = stmt.get(id, id) as unknown as ItemData | undefined;
  db.close();
  return row || null;
}

export function getStats() {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM items').get() as any).count;
  const active = (db.prepare("SELECT COUNT(*) as count FROM items WHERE type = 'Activated'").get() as any).count;
  const passive = (db.prepare("SELECT COUNT(*) as count FROM items WHERE type = 'Passive'").get() as any).count;
  const unlockable = (db.prepare('SELECT COUNT(*) as count FROM items WHERE is_unlocked_by_default = 0').get() as any).count;
  const starting = (db.prepare('SELECT COUNT(*) as count FROM items WHERE is_unlocked_by_default = 1').get() as any).count;
  db.close();

  return {
    total,
    active,
    passive,
    unlockable,
    starting,
  };
}
