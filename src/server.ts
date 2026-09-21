import express from 'express';
import * as path from 'path';
import { queryItems, getItemById, getStats } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.resolve(__dirname, '../public')));

// API: Get all items with optional filters
app.get('/api/items', (req, res) => {
  try {
    const { search, type, quality, unlocked, dlc, color, sort, order } = req.query;
    const items = queryItems({
      search: search ? String(search) : undefined,
      type: type ? String(type) : undefined,
      quality: quality ? String(quality) : undefined,
      unlocked: unlocked ? String(unlocked) : undefined,
      dlc: dlc ? String(dlc) : undefined,
      color: color ? String(color) : undefined,
      sort: (sort === 'name' || sort === 'quality' || sort === 'id' || sort === 'color') ? sort : 'color',
      order: order === 'desc' ? 'desc' : 'asc',
    });
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get single item by ID
app.get('/api/items/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid item ID' });
    }
    const item = getItemById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Stats
app.get('/api/stats', (_req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] The Binding of Isaac Item Guide is running at http://localhost:${PORT}`);
});
