const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// Generate PNG icons if they don't exist
function generateIcons() {
  const iconsDir = path.resolve(__dirname, 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  [16, 48, 128].forEach((size) => {
    const iconPath = path.join(iconsDir, `icon${size}.png`);
    if (!fs.existsSync(iconPath)) {
      const png = createMinimalPNG(size);
      fs.writeFileSync(iconPath, png);
      console.log(`Generated ${iconPath}`);
    }
  });
}

function createMinimalPNG(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdr = Buffer.alloc(12 + 13);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdrData.copy(ihdr, 8);
  ihdr.writeUInt32BE(ihdrCrc, 21);

  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const cx = size / 2;
      const cy = size / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = size / 2;

      if (dist < maxDist * 0.3) {
        row.push(0x61, 0xda, 0xfb, 0xff); // React blue nucleus
      } else if (dist < maxDist * 0.85) {
        row.push(0x1a, 0x1a, 0x2e, 0xff); // Dark background
      } else if (dist < maxDist) {
        row.push(0x1a, 0x1a, 0x2e, 0x80); // Fade edge
      } else {
        row.push(0x00, 0x00, 0x00, 0x00); // Transparent
      }
    }
    scanlines.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(scanlines);
  const compressed = zlib.deflateSync(rawData);

  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  const idat = Buffer.alloc(12 + compressed.length);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  idat.writeUInt32BE(idatCrc, 8 + compressed.length);

  const iendCrc = crc32(Buffer.from('IEND'));
  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write('IEND', 4);
  iend.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

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

// Generate icons before webpack runs
generateIcons();

module.exports = {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    injected: './src/injected.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],
  optimization: {
    minimize: false, // Keep readable for debugging
  },
  devtool: 'source-map',
};
