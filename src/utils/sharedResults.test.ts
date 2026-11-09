import { describe, expect, it, vi } from 'vitest';
import type { RosterData } from '../types';
import { createResultsSummary, decodeResultsSummary, encodeResultsSummary, shortenResultsLink } from './sharedResults';

const players = [
  { id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' },
  { id: 'c', name: 'Casey' }, { id: 'd', name: 'Drew' },
];

const roster: RosterData = {
  rosterType: 'fixed',
  partnerMode: 'strict',
  allPlayers: players,
  numCourts: 1,
  sessionName: 'Friday games',
  allowSameGender: false,
  rounds: [{
    roundNumber: 1,
    sittingOut: [],
    courts: [{ courtNumber: 1, team1: players.slice(0, 2), team2: players.slice(2) }],
  }],
};

describe('shared results links', () => {
  it('reopens a complete results snapshot without roster or score history', async () => {
    const summary = createResultsSummary(roster, [{
      roundNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 0,
      games: [{ team1Score: 11, team2Score: 0 }, { team1Score: 11, team2Score: 0 }],
    }]);
    const payload = await encodeResultsSummary(summary);
    const reopened = await decodeResultsSummary(payload);

    expect(reopened).toEqual(summary);
    expect(reopened.playedCount).toBe(1);
    expect(reopened.results.standings[0]).toMatchObject({ name: 'Alex & Blair', wins: 1, pointsFor: 11 });
    expect(reopened.results.cleanSweepLeader).toMatchObject({ name: 'Alex & Blair', cleanSweeps: 1 });
    expect(payload).not.toContain('Friday games');
  });

  it('rejects invalid or incomplete links', async () => {
    await expect(decodeResultsSummary('jbm90LWpzb24')).rejects.toThrow();
    await expect(decodeResultsSummary('jeyJ2ZXJzaW9uIjoxfQ')).rejects.toThrow('Invalid results link.');
  });

  it('posts the full URL to CleanURI and reuses the returned short link', async () => {
    const longUrl = 'https://rallyq.example/#results=abc123';
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      expect(args).toHaveLength(2);
      return new Response(JSON.stringify({ result_url: 'https://cleanuri.com/abc123' }), { status: 200 });
    });

    expect(await shortenResultsLink(longUrl, request)).toBe('https://cleanuri.com/abc123');
    expect(await shortenResultsLink(longUrl, request)).toBe('https://cleanuri.com/abc123');
    expect(request).toHaveBeenCalledTimes(1);
    const [endpoint, options] = request.mock.calls[0];
    expect(endpoint).toBe('https://cleanuri.com/api/v1/shorten');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(URLSearchParams);
    expect((options?.body as URLSearchParams).get('url')).toBe(longUrl);
  });

  it('rejects an unexpected shortener response', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ result_url: 'https://example.com/other' }), { status: 200 }));
    await expect(shortenResultsLink('https://rallyq.example/#results=invalid', request)).rejects.toThrow('Invalid response');
  });
});
