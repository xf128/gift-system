import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Config
const STATIC_DIR = process.env.STATIC_DIR || 'public';
const FUNCTIONS_DIR = process.env.FUNCTIONS_DIR || 'functions';
const DB_PATH = process.env.DB_PATH || './db.sqlite';

console.log(`🐝 Starting Cloudflare Adapter...`);
console.log(`📂 Working Dir: ${process.cwd()}`);
console.log(`🗄️ DB Path: ${path.resolve(DB_PATH)}`);

// D1 Wrapper
class D1Database {
    constructor(dbPath) {
        this.db = new Database(dbPath);
    }
    prepare(query) {
        const stmt = this.db.prepare(query);
        return {
            bind: (...args) => {
                const boundStmt = stmt.bind(...args);
                return {
                    first: async (col) => {
                        const row = boundStmt.get();
                        return col ? (row ? row[col] : null) : row;
                    },
                    all: async () => {
                        const results = boundStmt.all();
                        return { results: results || [], success: true, meta: {} };
                    },
                    run: async () => {
                        const res = boundStmt.run();
                        return { success: true, meta: { last_row_id: res.lastInsertRowid, changes: res.changes } };
                    },
                };
            },
            first: async (col) => {
                const row = stmt.get();
                return col ? (row ? row[col] : null) : row;
            },
            all: async () => {
                const results = stmt.all();
                return { results: results || [], success: true, meta: {} };
            },
            run: async () => {
                const res = stmt.run();
                return { success: true, meta: { last_row_id: res.lastInsertRowid, changes: res.changes } };
            },
        };
    }
    async batch(statements) {
        const results = [];
        const transaction = this.db.transaction(() => {
            for (const stmt of statements) {
                results.push(stmt.run());
            }
        });
        transaction();
        return results.map(res => ({ success: true, meta: { last_row_id: res.lastInsertRowid, changes: res.changes } }));
    }
}

// Env Mock
const env = {
    DB: new D1Database(DB_PATH),
    ...process.env
};

// Global error handler for JSON parsing
app.use((req, res, next) => {
    express.json({ limit: '50mb' })(req, res, (err) => {
        if (err) {
            console.error('🔥 JSON Parse Error:', err);
            return res.status(413).json({ success: false, error: '上传文件过大或格式错误', details: err.message });
        }
        next();
    });
});

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve static files
app.use(express.static(path.join(process.cwd(), STATIC_DIR)));

// Dynamic API Routing (CF Pages Functions Emulator)
app.all('/api/*', async (req, res) => {
    try {
        const apiPath = req.path.replace(/^\/api\//, '');
        console.log(`🔍 Routing API: ${apiPath}`);
        
        const possiblePaths = [
            path.join(process.cwd(), FUNCTIONS_DIR, 'api', apiPath + '.js'),
            path.join(process.cwd(), FUNCTIONS_DIR, 'api', apiPath, 'index.js')
        ];

        let filePath = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                filePath = p;
                break;
            }
        }

        if (!filePath) {
            console.log(`❌ API Not Found: ${apiPath}`);
            return res.status(404).json({ error: 'API route not found', requested: apiPath });
        }

        console.log(`🚀 Executing: ${filePath}`);
        // Bypass cache
        const module = await import('file://' + filePath + '?v=' + Date.now());
        
        const method = req.method.charAt(0).toUpperCase() + req.method.slice(1).toLowerCase();
        const handler = module.onRequest || module[`onRequest${method}`] || module.default;

        if (!handler) {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const context = {
            request: {
                method: req.method,
                headers: new Headers(req.headers),
                json: () => Promise.resolve(req.body),
                text: () => Promise.resolve(JSON.stringify(req.body)),
                url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
            },
            env,
            params: req.params,
        };

        const response = await handler(context);

        if (response instanceof Response) {
            res.status(response.status);
            response.headers.forEach((val, key) => res.setHeader(key, val));
            const body = await response.text();
            res.send(body);
        } else {
            res.json(response);
        }

    } catch (err) {
        console.error('🔥 API Execution Error:', err);
        // Return JSON error even if the handler would have returned a string Response
        res.status(500).json({ 
            success: false, 
            error: 'Internal Server Error', 
            details: err.message, 
            stack: err.stack 
        });
    }
});

app.listen(port, () => {
    console.log(`🐝 Cloudflare Adapter listening at http://localhost:${port}`);
});
