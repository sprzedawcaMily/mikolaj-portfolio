import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const LOG_DIR = 'logs';
const SPIKES_FILE = 'mesh-perf-spikes.jsonl';
const REPORT_FILE = 'mesh-perf-report.json';

function ensureLogDir(root: string) {
  const dir = path.join(root, LOG_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function meshPerfLogPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: 'mesh-perf-log',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url?.startsWith('/__mesh-perf/')) return next();

        if (url === '/__mesh-perf/log' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const payload = JSON.parse(body) as {
              type?: string;
              spikes?: unknown[];
              [key: string]: unknown;
            };
            const dir = ensureLogDir(root);

            if (payload.type === 'spike' && payload.spike) {
              const line = `${JSON.stringify(payload.spike)}\n`;
              fs.appendFileSync(path.join(dir, SPIKES_FILE), line, 'utf8');
            }

            if (payload.type === 'report') {
              fs.writeFileSync(
                path.join(dir, REPORT_FILE),
                `${JSON.stringify(payload, null, 2)}\n`,
                'utf8',
              );
            }

            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 400;
            res.end(err instanceof Error ? err.message : String(err));
          }
          return;
        }

        if (url === '/__mesh-perf/report' && req.method === 'GET') {
          const reportPath = path.join(ensureLogDir(root), REPORT_FILE);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (fs.existsSync(reportPath)) {
            res.end(fs.readFileSync(reportPath, 'utf8'));
          } else {
            res.end('{}');
          }
          return;
        }

        next();
      });
    },
  };
}
