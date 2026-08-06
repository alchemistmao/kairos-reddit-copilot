import fs from 'node:fs';
import path from 'node:path';
import { appEnv } from './env';

/**
 * Localiza o diretório /prompts em runtime. Ordem:
 *   1. PROMPTS_DIR (se definido)
 *   2. subindo a partir do cwd
 *   3. subindo a partir deste módulo (dist/ dentro de node_modules)
 */
function resolvePromptsDir(): string {
  const configured = appEnv().promptsDir;
  if (configured) {
    if (fs.existsSync(configured)) return configured;
    throw new Error(`PROMPTS_DIR aponta para um caminho inexistente: ${configured}`);
  }

  const roots = [process.cwd(), __dirname];
  for (const root of roots) {
    let dir = root;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'prompts');
      if (fs.existsSync(path.join(candidate, 'classifier.md'))) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  throw new Error(
    'Diretório /prompts não encontrado. Defina PROMPTS_DIR ou rode a partir da raiz do repo.',
  );
}

const cache = new Map<string, string>();

/** Lê prompts/<name>.md em runtime (com cache em memória). */
export function loadPrompt(name: 'classifier' | 'drafter'): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = path.join(resolvePromptsDir(), `${name}.md`);
  const content = fs.readFileSync(file, 'utf8');
  cache.set(name, content);
  return content;
}

/** Substitui {{PLACEHOLDERS}} pelos valores fornecidos. */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key]! : match,
  );
}
