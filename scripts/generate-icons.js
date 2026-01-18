/**
 * Icon Generation Script
 *
 * This script creates simple PNG icons for the Chrome extension.
 * For production, you should replace these with properly designed icons.
 *
 * Run: node scripts/generate-icons.js
 *
 * Alternatively, you can:
 * 1. Use the icon.svg in the icons folder
 * 2. Convert it to PNG at 16x16, 48x48, and 128x128 using:
 *    - Online tools like https://cloudconvert.com/svg-to-png
 *    - ImageMagick: convert -background none -resize 16x16 icon.svg icon16.png
 *    - Inkscape: inkscape -w 16 -h 16 icon.svg -o icon16.png
 */

const fs = require('fs');
const path = require('path');

// Simple 1-pixel PNG generator (creates minimal valid PNG files)
function createMinimalPNG(size) {
  // PNG header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdr = Buffer.alloc(12 + 13);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdrData.copy(ihdr, 8);
  ihdr.writeInt32BE(ihdrCrc, 21);

  // Create simple image data (React blue color)
  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      // Draw a simple React-like circle
      const cx = size / 2;
      const cy = size / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = size / 2;

      if (dist < maxDist * 0.3) {
        // Center nucleus - React blue
        row.push(0x61, 0xda, 0xfb, 0xff);
      } else if (dist < maxDist * 0.35) {
        // Slight glow
        row.push(0x61, 0xda, 0xfb, 0x80);
      } else if (dist < maxDist * 0.9) {
        // Background
        row.push(0x1a, 0x1a, 0x2e, 0xff);
      } else {
        // Rounded corner (transparent)
        row.push(0x00, 0x00, 0x00, 0x00);
      }
    }
    scanlines.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(scanlines);

  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);

  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  const idat = Buffer.alloc(12 + compressed.length);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  idat.writeInt32BE(idatCrc, 8 + compressed.length);

  // IEND chunk
  const iendCrc = crc32(Buffer.from('IEND'));
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write('IEND', 4);
  iend.writeInt32BE(iendCrc, 8);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// CRC32 calculation
function crc32(data) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, '..', 'icons');

[16, 48, 128].forEach((size) => {
  const png = createMinimalPNG(size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('\nIcons generated! For better quality icons, convert icon.svg to PNG.');
