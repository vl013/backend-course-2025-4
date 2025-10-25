// main.js
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const url = require('url');
const { Command } = require('commander');
const { XMLBuilder } = require('fast-xml-parser');

const program = new Command();

program
  .requiredOption('-i, --input <path>', 'path to input JSON file')
  .requiredOption('-h, --host <host>', 'server host')
  .requiredOption('-p, --port <number>', 'server port', (v) => parseInt(v, 10));

program.parse(process.argv);
const opts = program.opts();

// === Перевірка існування файлу (точний текст помилки з ТЗ) ===
const inputPath = path.resolve(opts.input);

async function ensureInputExists() {
  try {
    await fs.access(inputPath);
  } catch {
    console.error('Cannot find input file'); // має бути саме так
    process.exit(1);
  }
}

// === Допоміжні: безпечний парсер JSON і нормалізація ===
function toLowerSafe(v) {
  return typeof v === 'string' ? v.toLowerCase() : v;
}

function parseJsonSafe(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('JSON is not an array');
    }
    return data;
  } catch (e) {
    return [];
  }
}

// === Основна логіка фільтрації під варіант 3 ===
// Параметри запиту:
//   ?furnished=true      -> залишити лише furnishingstatus === 'furnished' (без урах. регістру)
//   ?max_price=X         -> залишити лише price < X
function filterHouses(rows, query) {
  let filtered = rows;

  if (query.furnished === 'true') {
    filtered = filtered.filter(
      (row) => toLowerSafe(row.furnishingstatus) === 'furnished'
    );
  }

  if (typeof query.max_price !== 'undefined') {
    const limit = Number(query.max_price);
    if (!Number.isNaN(limit)) {
      filtered = filtered.filter((row) => Number(row.price) < limit);
    }
  }

  // Формуємо лише потрібні поля: price, area, furnishingstatus
  return filtered.map((row) => ({
    price: Number(row.price),
    area: Number(row.area),
    furnishingstatus: row.furnishingstatus
  }));
}

// === Побудова XML ===
const builder = new XMLBuilder({
  format: true,           // красиво відформатований XML
  ignoreAttributes: true
});

function toXml(houses) {
  // структура <houses><house>...</house></houses>
  const xmlObj = { houses: { house: houses } };
  return builder.build(xmlObj);
}

// === HTTP-сервер ===
async function start() {
  await ensureInputExists();

  const server = http.createServer(async (req, res) => {
    try {
      const { query } = url.parse(req.url, true);

      // читаємо JSON щоразу (вимога: асинхронне readFile)
      const jsonText = await fs.readFile(inputPath, 'utf-8');
      const rows = parseJsonSafe(jsonText);

      const result = filterHouses(rows, query);
      const xml = toXml(result);

      // збережемо останню відповідь у файл (асинхронне writeFile — вимога)
      await fs.writeFile(path.resolve('last-response.xml'), xml, 'utf-8');

      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(xml);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
      console.error(err);
    }
  });

  server.listen(opts.port, opts.host, () => {
    console.log(`Server listening at http://${opts.host}:${opts.port}`);
    console.log('Query params: ?furnished=true&max_price=10000000');
  });
}

start();
