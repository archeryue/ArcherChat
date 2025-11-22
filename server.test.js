#!/usr/bin/env node
/**
 * Custom Next.js server for E2E testing
 * This allows us to set NODE_ENV=test while running the dev server
 */

// IMPORTANT: Set NODE_ENV before importing Next.js
process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_AUTH = 'true';

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// NOTE: We use dev: false to prevent Next.js from overriding NODE_ENV to "development"
// This means we won't have hot reload, but we need NODE_ENV=test for the test auth provider
const dev = false;
const hostname = 'localhost';
const port = process.env.PORT || 8080;

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> NODE_ENV=${process.env.NODE_ENV}`);
    console.log(`> ENABLE_TEST_AUTH=${process.env.ENABLE_TEST_AUTH}`);
  });
});
