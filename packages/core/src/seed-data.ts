import { adminDb } from './db';
import { appEnv } from './env';
import { log } from './logger';
import type { IntentLevel, Track } from './types';

interface SeedSubreddit {
  name: string;
  rules_summary: string;
  allows_links: boolean;
  min_karma: number;
  track: Track;
  active: boolean;
}

/**
 * Trilha A = aquisição (onde está o cliente). Trilha B = lançamento e
 * credibilidade de founder — posts "I built this", 1x cada, por isso entram
 * inativos: não são alvo de polling contínuo.
 */
export const SUBREDDITS: SeedSubreddit[] = [
  {
    name: 'careerchange',
    rules_summary:
      'Núcleo exato do ICP. Autopromoção mal vista; só mencione ferramenta se pedirem recomendação explícita.',
    allows_links: false,
    min_karma: 50,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'careerguidance',
    rules_summary:
      'Alto volume de pedidos de ajuda. Sem autopromoção, sem links de produto. Respostas devem ser substantivas.',
    allows_links: false,
    min_karma: 50,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'findapath',
    rules_summary:
      'Pessoas perdidas profissionalmente. Tom de apoio, zero venda. Links só de recursos gratuitos e neutros.',
    allows_links: false,
    min_karma: 20,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'Layoffs',
    rules_summary:
      'Demitidos recentes, dor aguda. Comunidade sensível a oportunismo. Nunca mencionar produto em post de desabafo.',
    allows_links: false,
    min_karma: 30,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'jobs',
    rules_summary:
      'Volume massivo; filtrar por intenção. Proibido autopromoção e recrutamento. Respostas curtas e diretas funcionam melhor.',
    allows_links: false,
    min_karma: 50,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'careeradvice',
    rules_summary: 'Perguntas diretas. Sem spam, sem links de produto próprio.',
    allows_links: false,
    min_karma: 30,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'resumes',
    rules_summary:
      'Porta de entrada (Kairós tem resume review). Feedback específico e acionável; nenhum link comercial.',
    allows_links: false,
    min_karma: 20,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'GetEmployed',
    rules_summary: 'Busca ativa de emprego. Tolera recursos úteis, não tolera pitch.',
    allows_links: true,
    min_karma: 20,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'AskManagers',
    rules_summary:
      'Profissionais sêniores. Respostas devem vir de experiência real de gestão. Autopromoção derruba credibilidade.',
    allows_links: false,
    min_karma: 50,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'ExperiencedDevs',
    rules_summary:
      'Vertical com transição frequente. Comunidade técnica e cética; nada de marketing, nada de generalidades.',
    allows_links: false,
    min_karma: 100,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'consulting',
    rules_summary: 'Vertical com transição frequente. Sem autopromoção.',
    allows_links: false,
    min_karma: 50,
    track: 'acquisition',
    active: true,
  },
  {
    name: 'sales',
    rules_summary: 'Vertical com transição frequente. Sem autopromoção nem links comerciais.',
    allows_links: false,
    min_karma: 30,
    track: 'acquisition',
    active: true,
  },

  // Trilha B — lançamento/credibilidade (1x cada, ativação manual).
  {
    name: 'SideProject',
    rules_summary: 'Post "I built this" é bem-vindo. Links permitidos.',
    allows_links: true,
    min_karma: 0,
    track: 'launch',
    active: false,
  },
  {
    name: 'IMadeThis',
    rules_summary: 'Post de lançamento é o formato do sub. Links permitidos.',
    allows_links: true,
    min_karma: 0,
    track: 'launch',
    active: false,
  },
  {
    name: 'startups',
    rules_summary: 'Autopromoção só nas threads/dias designados. Ler regras antes de postar.',
    allows_links: true,
    min_karma: 0,
    track: 'launch',
    active: false,
  },
  {
    name: 'Entrepreneur',
    rules_summary: 'Autopromoção restrita. Contar a história vale mais que divulgar o link.',
    allows_links: true,
    min_karma: 0,
    track: 'launch',
    active: false,
  },
  {
    name: 'ClaudeAI',
    rules_summary:
      'Construído com Claude — história legítima e bem-vinda aqui. Links permitidos em contexto de "o que eu construí".',
    allows_links: true,
    min_karma: 0,
    track: 'launch',
    active: false,
  },
];

interface SeedKeyword {
  term: string;
  intent_level: IntentLevel;
}

export const KEYWORDS: SeedKeyword[] = [
  // Intenção alta
  { term: 'career change at 45', intent_level: 'high' },
  { term: 'career change at 50', intent_level: 'high' },
  { term: 'too old to switch careers', intent_level: 'high' },
  { term: 'too old to change careers', intent_level: 'high' },
  { term: 'laid off after 20 years', intent_level: 'high' },
  { term: 'midlife career crisis', intent_level: 'high' },
  { term: 'pivot careers', intent_level: 'high' },
  { term: 'career pivot', intent_level: 'high' },
  { term: 'stuck in my career', intent_level: 'high' },
  { term: 'starting over at 50', intent_level: 'high' },

  // Intenção média
  { term: 'hate my job', intent_level: 'medium' },
  { term: 'what should i do next', intent_level: 'medium' },
  { term: 'career coach worth it', intent_level: 'medium' },
  { term: 'burned out', intent_level: 'medium' },
  { term: 'transferable skills', intent_level: 'medium' },
  { term: 'no idea what to do', intent_level: 'medium' },

  // Concorrentes
  { term: 'betterup', intent_level: 'competitor' },
  { term: 'career coaching alternatives', intent_level: 'competitor' },
  { term: 'ai career coach', intent_level: 'competitor' },
];

/**
 * Seed idempotente, rodado no boot do worker — evita passo manual de deploy.
 * Usa upsert por chave natural, então rodar de novo não sobrescreve ajustes
 * feitos no painel (exceto os campos listados).
 */
export async function ensureSeed(): Promise<void> {
  const db = adminDb();

  const ownerEmail = appEnv().ownerEmail;
  if (ownerEmail) {
    const { error } = await db
      .from('allowed_emails')
      .upsert({ email: ownerEmail }, { onConflict: 'email' });
    if (error) throw new Error(`Falha ao registrar OWNER_EMAIL: ${error.message}`);
  } else {
    log.warn('OWNER_EMAIL não definido — ninguém conseguirá entrar no painel');
  }

  const { error: subErr } = await db
    .from('subreddits')
    .upsert(SUBREDDITS, { onConflict: 'name', ignoreDuplicates: true });
  if (subErr) throw new Error(`Falha ao semear subreddits: ${subErr.message}`);

  const { error: kwErr } = await db
    .from('keywords')
    .upsert(KEYWORDS, { onConflict: 'term', ignoreDuplicates: true });
  if (kwErr) throw new Error(`Falha ao semear keywords: ${kwErr.message}`);

  const { error: setErr } = await db
    .from('settings')
    .upsert({ id: true }, { onConflict: 'id', ignoreDuplicates: true });
  if (setErr) throw new Error(`Falha ao criar settings: ${setErr.message}`);

  log.info('Seed garantido', {
    subreddits: SUBREDDITS.length,
    keywords: KEYWORDS.length,
    ownerEmail: ownerEmail || null,
  });
}
