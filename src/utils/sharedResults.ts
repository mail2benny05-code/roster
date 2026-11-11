import type { GameScore, RosterData } from '../types';
import { calculateResults } from './scoreResults';
import type { ScoreResults, Standing } from './scoreResults';

type DisplayStanding = Pick<Standing, 'id' | 'name' | 'wins' | 'losses' | 'draws' | 'played' | 'pointsFor' | 'pointsAgainst' | 'winPercentage' | 'pointDifference'>;

export interface ResultsSummary {
  version: 1;
  sessionName: string;
  rosterType: RosterData['rosterType'];
  playedCount: number;
  doNotPlayCount: number;
  results: Omit<ScoreResults, 'standings'> & { standings: DisplayStanding[] };
}

export function createResultsSummary(data: RosterData, scores: GameScore[]): ResultsSummary {
  const results = calculateResults(data, scores);
  return {
    version: 1,
    sessionName: data.sessionName,
    rosterType: data.rosterType,
    playedCount: results.standings.reduce((sum, standing) => sum + standing.played, 0) / (data.rosterType === 'fixed' ? 2 : 4),
    doNotPlayCount: scores.filter(score => score.doNotPlay).length,
    results: {
      ...results,
      standings: results.standings.map(({ id, name, wins, losses, draws, played, pointsFor, pointsAgainst, winPercentage, pointDifference }) =>
        ({ id, name, wins, losses, draws, played, pointsFor, pointsAgainst, winPercentage, pointDifference })),
    },
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid results link.');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function encodeResultsSummary(summary: ResultsSummary): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(summary));
  let payload = `j${toBase64Url(plain)}`;
  if (typeof CompressionStream !== 'undefined') {
    const compressed = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const candidate = `g${toBase64Url(compressed)}`;
    if (candidate.length < payload.length) payload = candidate;
  }
  if (payload.length > 20000) throw new Error('These results are too large for a share link. Download the HTML summary instead.');
  return payload;
}

const shortLinkCache = new Map<string, string>();

export async function shortenResultsLink(longUrl: string, request: typeof fetch = fetch): Promise<string> {
  const cached = shortLinkCache.get(longUrl);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await request('https://cleanuri.com/api/v1/shorten', {
      method: 'POST',
      body: new URLSearchParams({ url: longUrl }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Link shortening is unavailable.');
    const result: unknown = await response.json();
    if (!isObject(result) || typeof result.result_url !== 'string') throw new Error('Invalid response from link shortener.');
    const shortUrl = new URL(result.result_url);
    if (shortUrl.protocol !== 'https:' || shortUrl.hostname !== 'cleanuri.com') throw new Error('Invalid response from link shortener.');
    shortLinkCache.set(longUrl, shortUrl.toString());
    return shortUrl.toString();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function readLimited(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 250000) {
      await reader.cancel();
      throw new Error('Results link is too large.');
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNamedCount = (value: unknown): boolean => isObject(value) && typeof value.name === 'string' && isNumber(value.count);

function isResultsSummary(value: unknown): value is ResultsSummary {
  if (!isObject(value) || value.version !== 1 || typeof value.sessionName !== 'string' ||
      !['gender', 'mixed', 'fixed'].includes(String(value.rosterType)) ||
      !isNumber(value.playedCount) || !isNumber(value.doNotPlayCount) || !isObject(value.results)) return false;
  const results = value.results;
  return Array.isArray(results.standings) && results.standings.every((standing: unknown) =>
    isObject(standing) && typeof standing.id === 'string' && typeof standing.name === 'string' &&
    ['wins', 'losses', 'draws', 'played', 'pointsFor', 'pointsAgainst', 'winPercentage', 'pointDifference'].every(field => isNumber(standing[field]))) &&
    (results.biggestWin === null || (isObject(results.biggestWin) &&
      typeof results.biggestWin.winner === 'string' && typeof results.biggestWin.loser === 'string' &&
      ['winnerScore', 'loserScore', 'margin'].every(field => isNumber((results.biggestWin as Record<string, unknown>)[field])))) &&
    (results.toughestLoss === null || (isObject(results.toughestLoss) &&
      typeof results.toughestLoss.name === 'string' && isNumber(results.toughestLoss.averageMargin) && isNumber(results.toughestLoss.losses))) &&
    (results.heartbreaker === undefined || results.heartbreaker === null || isNamedCount(results.heartbreaker)) &&
    Array.isArray(results.spoilers) && results.spoilers.every(isNamedCount) &&
    (results.playerCards === undefined || (Array.isArray(results.playerCards) && results.playerCards.every((card: unknown) =>
      isObject(card) && typeof card.id === 'string' &&
      (card.bestPartner === null || (isObject(card.bestPartner) && typeof card.bestPartner.name === 'string' && isNumber(card.bestPartner.wins))) &&
      (card.toughestOpponent === null || (isObject(card.toughestOpponent) && typeof card.toughestOpponent.name === 'string' && isNumber(card.toughestOpponent.losses))) &&
      (card.bestWin === null || (isObject(card.bestWin) && typeof card.bestWin.opponent === 'string' && typeof card.bestWin.score === 'string' && isNumber(card.bestWin.margin))) &&
      Array.isArray(card.badges) && card.badges.every((badge: unknown) => typeof badge === 'string'))));
}

export async function decodeResultsSummary(payload: string): Promise<ResultsSummary> {
  if (payload.length > 20000 || payload.length < 2) throw new Error('Invalid results link.');
  const bytes = fromBase64Url(payload.slice(1));
  let decoded: Uint8Array;
  if (payload[0] === 'g') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed results links.');
    decoded = await readLimited(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip')));
  } else if (payload[0] === 'j') {
    decoded = bytes;
  } else {
    throw new Error('Invalid results link.');
  }
  const summary: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  if (!isResultsSummary(summary)) throw new Error('Invalid results link.');
  return summary;
}
