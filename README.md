# Bindings of Isaac Cheat Sheet

An interactive item directory and unlock companion for **The Binding of Isaac: Repentance**, built with TypeScript, Node.js, SQLite, and Express.

## Features

- **All 720 Collectibles**: 549 Passive items and 171 Activated items with official stats, quotes, and descriptions.
- **Pure Sprite Grid**: High-density collectible view with zero visual clutter.
- **Color Sorting**: Rainbow chromatic order sorting so you can spot an item instantly by its color.
- **DLC Filtering**: Quickly view items from Rebirth, Afterbirth, Afterbirth+, or Repentance. Items from the base game do not clutter the inspector with extra tags.
- **Inspector Altar**: Left panel displays item tier auras, effects, and exact unlock requirements without boxy cards.
- **Fast Search**: Instant search by item name, quote, description, or unlock method (press `/` to focus).
- **Keyboard Navigation**: Arrow keys to quickly browse and inspect nearby items in the grid.
- **Full Offline Cache**: All item sprites and SQLite database bundled locally.

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
isaac/
├── data/
│   ├── isaac.db              # SQLite database containing all 720 items
│   └── items.json            # JSON export of the dataset
├── public/
│   ├── index.html            # Main web UI
│   ├── styles.css            # Somber crypt-themed styling
│   ├── app.js                # Frontend client logic, animations and filters
│   ├── fonts/                # Game pixel fonts
│   └── images/items/         # 720 locally cached item icons
├── src/
│   ├── scraper.ts            # Wiki scraper and downloader
│   ├── db.ts                 # SQLite query and filter helpers
│   └── server.ts             # Express web server and API endpoints
├── package.json
└── README.md
```

## API

- `GET /api/items` - List items with optional filters (`search`, `type`, `quality`, `unlocked`, `dlc`, `sort`, `order`).
- `GET /api/items/:id` - Fetch single item details by ID.
- `GET /api/stats` - Summary counts by DLC, type, and quality.
