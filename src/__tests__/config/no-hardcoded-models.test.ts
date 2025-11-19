/**
 * Test to ensure no hardcoded model names in the codebase.
 * All model references must use src/config/models.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Known hardcoded model patterns that should NOT appear in code
const HARDCODED_MODEL_PATTERNS = [
  /gemini-[\d.]+-flash-preview-[\d-]+/g,  // e.g., gemini-2.5-flash-preview-05-20
  /gemini-[\d.]+-flash-experimental-[\d-]+/g,  // e.g., gemini-2.5-flash-experimental-0827
  /gemini-[\d.]+-pro-preview-[\d-]+/g,  // e.g., gemini-2.0-pro-preview-xxx
  /['"]gemini-[\d.]+-flash['"](?!-lite|-image)/g,  // Bare gemini-x.x-flash in quotes (but allow -lite, -image)
];

// Directories to scan
const SCAN_DIRS = [
  'src/lib',
  'src/app',
  'src/components',
];

// Files/directories to exclude
const EXCLUDE_PATTERNS = [
  '__tests__',
  'node_modules',
  '.next',
  'src/config/models.ts', // The config file itself is allowed to have model names
];

// Allowed files that may contain model strings for documentation
const ALLOWED_FILES = [
  'src/config/models.ts',
];

function getAllFiles(dir: string, files: string[] = []): string[] {
  const fullPath = path.join(process.cwd(), dir);

  if (!fs.existsSync(fullPath)) {
    return files;
  }

  const items = fs.readdirSync(fullPath);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const fullItemPath = path.join(process.cwd(), itemPath);

    // Skip excluded patterns
    if (EXCLUDE_PATTERNS.some(pattern => itemPath.includes(pattern))) {
      continue;
    }

    const stat = fs.statSync(fullItemPath);

    if (stat.isDirectory()) {
      getAllFiles(itemPath, files);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(itemPath);
    }
  }

  return files;
}

describe('No Hardcoded Models', () => {
  it('should not have hardcoded model names in source files', () => {
    const violations: { file: string; line: number; content: string; pattern: string }[] = [];

    for (const dir of SCAN_DIRS) {
      const files = getAllFiles(dir);

      for (const file of files) {
        // Skip allowed files
        if (ALLOWED_FILES.includes(file)) {
          continue;
        }

        const fullPath = path.join(process.cwd(), file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          for (const pattern of HARDCODED_MODEL_PATTERNS) {
            // Reset regex state
            pattern.lastIndex = 0;
            const match = pattern.exec(line);

            if (match) {
              violations.push({
                file,
                line: i + 1,
                content: line.trim(),
                pattern: match[0],
              });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const errorMessage = violations
        .map(v => `\n  ${v.file}:${v.line}\n    Found: "${v.pattern}"\n    Line: ${v.content}`)
        .join('\n');

      fail(
        `Found ${violations.length} hardcoded model name(s). ` +
        `Always use GEMINI_MODELS from src/config/models.ts instead:${errorMessage}`
      );
    }
  });

  it('should import models from config when using model names', () => {
    const filesUsingModels: { file: string; hasImport: boolean }[] = [];

    for (const dir of SCAN_DIRS) {
      const files = getAllFiles(dir);

      for (const file of files) {
        if (ALLOWED_FILES.includes(file)) {
          continue;
        }

        const fullPath = path.join(process.cwd(), file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check if file uses any model-related terms
        const usesModelTerms =
          content.includes('ModelTier') ||
          content.includes('GEMINI_MODELS') ||
          content.includes('getModelForTask');

        if (usesModelTerms) {
          // Check if it imports from config/models
          const hasProperImport =
            content.includes("from '@/config/models'") ||
            content.includes('from "@/config/models"') ||
            content.includes("from '../config/models'") ||
            content.includes("from '../../config/models'");

          if (!hasProperImport) {
            filesUsingModels.push({ file, hasImport: false });
          }
        }
      }
    }

    const missingImports = filesUsingModels.filter(f => !f.hasImport);

    if (missingImports.length > 0) {
      const errorMessage = missingImports
        .map(f => `\n  ${f.file}`)
        .join('');

      fail(
        `Found ${missingImports.length} file(s) using model terms without importing from config:${errorMessage}`
      );
    }
  });
});
