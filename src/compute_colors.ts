import sharp from 'sharp';

export interface ColorData {
  r: number;
  g: number;
  b: number;
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
  color_group: string;
  color_sort_order: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export async function analyzeImageColor(filePath: string): Promise<ColorData> {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  const chromatic: Record<string, { count: number, rSum: number, gSum: number, bSum: number }> = {
    Red: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Orange: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Yellow: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Green: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Cyan: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Blue: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Purple: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Pink: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Brown: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
  };

  const neutral: Record<string, { count: number, rSum: number, gSum: number, bSum: number }> = {
    White: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Gray: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
    Black: { count: 0, rSum: 0, gSum: 0, bSum: 0 },
  };

  let totalInterior = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = channels === 4 ? data[i + 3] : 255;
    if (a < 50) continue; // transparent

    // Outline check: only skip near-black pixels where ALL channels are very low and non-vibrant
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const isDarkOutline = maxVal <= 24 || (maxVal <= 36 && (maxVal - minVal) <= 12);
    if (isDarkOutline) continue;

    totalInterior++;
    const [h, s, l] = rgbToHsl(r, g, b);

    // Grayscale: only when saturation is truly low (< 10%)
    if (s < 10) {
      if (l >= 70) {
        neutral.White.count++; neutral.White.rSum += r; neutral.White.gSum += g; neutral.White.bSum += b;
      } else if (l <= 25) {
        neutral.Black.count++; neutral.Black.rSum += r; neutral.Black.gSum += g; neutral.Black.bSum += b;
      } else {
        neutral.Gray.count++; neutral.Gray.rSum += r; neutral.Gray.gSum += g; neutral.Gray.bSum += b;
      }
    } else if (h >= 14 && h < 45 && l < 38 && s < 55) {
      chromatic.Brown.count++; chromatic.Brown.rSum += r; chromatic.Brown.gSum += g; chromatic.Brown.bSum += b;
    } else {
      let gName = 'Red';
      if (h >= 345 || h < 16) gName = 'Red';
      else if (h >= 16 && h < 45) gName = 'Orange';
      else if (h >= 45 && h < 70) gName = 'Yellow';
      else if (h >= 70 && h < 165) gName = 'Green';
      else if (h >= 165 && h < 205) gName = 'Cyan';
      else if (h >= 205 && h < 260) gName = 'Blue';
      else if (h >= 260 && h < 315) gName = 'Purple';
      else if (h >= 315 && h < 345) gName = 'Pink';

      chromatic[gName].count++; chromatic[gName].rSum += r; chromatic[gName].gSum += g; chromatic[gName].bSum += b;
    }
  }

  let totalChromatic = 0;
  for (const c of Object.values(chromatic)) totalChromatic += c.count;

  let chosenGroup = 'Gray';
  let chosenData = neutral.Gray;

  if (totalChromatic >= 10 || totalChromatic >= totalInterior * 0.15) {
    let maxC = -1;
    for (const [k, v] of Object.entries(chromatic)) {
      if (v.count > maxC) {
        maxC = v.count;
        chosenGroup = k;
        chosenData = v;
      }
    }
  } else {
    let maxN = -1;
    for (const [k, v] of Object.entries(neutral)) {
      if (v.count > maxN) {
        maxN = v.count;
        chosenGroup = k;
        chosenData = v;
      }
    }
  }

  const avgR = chosenData.count > 0 ? Math.round(chosenData.rSum / chosenData.count) : 128;
  const avgG = chosenData.count > 0 ? Math.round(chosenData.gSum / chosenData.count) : 128;
  const avgB = chosenData.count > 0 ? Math.round(chosenData.bSum / chosenData.count) : 128;
  const hex = `#${((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1)}`;
  const [finalH, finalS, finalL] = rgbToHsl(avgR, avgG, avgB);

  // Clean Rainbow sorting order:
  // Red (100-199) -> Orange (200-299) -> Yellow (300-399) -> Green (400-499) -> Cyan (500-599) -> Blue (600-699) -> Purple (700-799) -> Pink (800-849) -> Brown (850-899) -> White (900-949) -> Gray (950-999) -> Black (1000+)
  const groupOrder: Record<string, number> = {
    Red: 100,
    Orange: 200,
    Yellow: 300,
    Green: 400,
    Cyan: 500,
    Blue: 600,
    Purple: 700,
    Pink: 800,
    Brown: 850,
    White: 900,
    Gray: 950,
    Black: 1000,
  };

  const base = groupOrder[chosenGroup] || 950;
  let subOrder = 0;
  if (chosenGroup === 'Red') {
    const adjH = finalH >= 340 ? finalH - 360 : finalH;
    subOrder = (adjH + 20) * 1.5 + (100 - finalL) * 0.2;
  } else if (chosenGroup === 'White' || chosenGroup === 'Gray' || chosenGroup === 'Black') {
    subOrder = (100 - finalL) * 0.4;
  } else {
    subOrder = finalH * 0.4 + (100 - finalL) * 0.2;
  }

  return {
    r: avgR,
    g: avgG,
    b: avgB,
    hex,
    hue: finalH,
    saturation: finalS,
    lightness: finalL,
    color_group: chosenGroup,
    color_sort_order: Math.round(base + subOrder),
  };
}
