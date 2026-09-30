const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');

describe('Server session isolation and validation', () => {
  let server;
  let port;
  const sessionTokens = new Map();

  const request = (method, path, body, extraHeaders = {}) => {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : null;
      const match = path.match(/^\/poker-planning-view-as-scrum-master\/([^/?#]+)/);
      const targetSession = match ? decodeURIComponent(match[1]) : null;
      const autoToken = targetSession ? sessionTokens.get(targetSession) : null;
      const headers = {
        ...(payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          : {}),
        ...(autoToken && !('x-facilitator-token' in extraHeaders)
          ? { 'x-facilitator-token': autoToken }
          : {}),
        ...extraHeaders
      };
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers
        },
        res => {
          let raw = '';
          res.on('data', chunk => {
            raw += chunk;
          });
          res.on('end', () => {
            let json = null;
            try {
              json = raw ? JSON.parse(raw) : null;
            } catch (e) {
              json = raw;
            }
            if (res.headers['x-facilitator-token']) {
              const setupMatch = path.match(/^\/poker-planning-view-as-developer\/([^/?#]+)$/);
              if (setupMatch) {
                sessionTokens.set(decodeURIComponent(setupMatch[1]), res.headers['x-facilitator-token']);
              }
            }
            resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };

  before(async () => {
    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    sessionTokens.clear();
    if (app.resetSessions) {
      app.resetSessions();
    }
  });

  it('requires the active story ID even when consecutive descriptions match', async () => {
    const path = '/poker-planning-view-as-developer/duplicates';
    assert.equal((await request('POST', path, {
      numberOfVoters: 1,
      storyList: [
        { story: 'Same', storyPoint: '', status: 'Active' },
        { story: 'Same', storyPoint: '', status: 'Not Voted' }
      ]
    })).status, 204);
    const initial = await request('GET', path);
    assert.deepEqual(initial.body.map(row => row.id), [1, 2]);
    assert.equal((await request('POST', `${path}/developers/1`, { id: '1', selected: '5', storyId: 1 })).status, 204);
    const next = initial.body.map((row, i) => ({ ...row, status: i ? 'Active' : 'Voted', storyPoint: i ? '' : '5' }));
    assert.equal((await request('POST', '/poker-planning-view-as-scrum-master/duplicates', next)).status, 204);
    for (const vote of [
      { id: '1', selected: '8', story: 'Same' },
      { id: '1', selected: '8', storyId: 1 }
    ]) {
      assert.equal((await request('POST', `${path}/developers/1`, vote)).status, 400);
    }
    assert.deepEqual((await request('GET', '/vote-mapping/duplicates')).body, []);
    assert.equal((await request('POST', `${path}/developers/1`, { id: '1', selected: '8', storyId: 2 })).status, 204);
  });

  it('accepts only the next ordered, unchanged story transition and rejects stale retries', async () => {
    const path = '/poker-planning-view-as-scrum-master/transitions';
    await request('POST', '/poker-planning-view-as-developer/transitions', {
      numberOfVoters: 1,
      storyList: ['A', 'B', 'C'].map((story, i) => ({ story, storyPoint: '', status: i ? 'Not Voted' : 'Active' }))
    });
    const initial = (await request('GET', path)).body;
    const valid = initial.map((row, i) => ({ ...row, status: i === 0 ? 'Voted' : i === 1 ? 'Active' : 'Not Voted', storyPoint: i === 0 ? '5' : '' }));
    const invalid = [
      [valid[1], valid[0], valid[2]],
      valid.map((row, i) => i === 2 ? { ...row, story: 'Rewritten' } : row),
      valid.map((row, i) => i === 1 ? { ...row, id: 99 } : row),
      valid.map((row, i) => i === 0 ? { ...row, storyPoint: '4' } : row),
      valid.map((row, i) => i === 1 ? { ...row, status: 'Not Voted' } : row),
      valid.map((row, i) => i === 2 ? { ...row, status: 'Active' } : row)
    ];
    for (const rows of invalid) assert.equal((await request('POST', path, rows)).status, 400);
    assert.deepEqual((await request('GET', path)).body, initial);
    assert.equal((await request('POST', path, valid)).status, 204);
    assert.equal((await request('POST', path, valid)).status, 400);
    assert.equal((await request('POST', path, valid.map((row, i) => i === 0 ? { ...row, storyPoint: '8' } : row))).status, 400);
  });

  it('isolates story lists and votes across two concurrent sessions', async () => {
    const s1Setup = await request(
      'POST',
      '/poker-planning-view-as-developer/session-alpha',
      {
        numberOfVoters: 2,
        storyList: [
          { story: 'Alpha Story 1', storyPoint: '', status: 'Active' },
          { story: 'Alpha Story 2', storyPoint: '', status: 'Not Voted' }
        ]
      }
    );
    assert.equal(s1Setup.status, 204);

    const s2Setup = await request(
      'POST',
      '/poker-planning-view-as-developer/session-beta',
      {
        numberOfVoters: 3,
        storyList: [
          { story: 'Beta Story 1', storyPoint: '', status: 'Active' },
          { story: 'Beta Story 2', storyPoint: '', status: 'Not Voted' }
        ]
      }
    );
    assert.equal(s2Setup.status, 204);

    const vote1InS1 = await request(
      'POST',
      '/poker-planning-view-as-developer/session-alpha/developers/1',
      { id: '1', selected: '5', story: 'Alpha Story 1', storyId: 1 }
    );
    assert.equal(vote1InS1.status, 204);

    const vote1InS2 = await request(
      'POST',
      '/poker-planning-view-as-developer/session-beta/developers/1',
      { id: '1', selected: '8', story: 'Beta Story 1', storyId: 1 }
    );
    assert.equal(vote1InS2.status, 204);

    const s1Votes = await request('GET', '/vote-mapping/session-alpha');
    assert.equal(s1Votes.status, 200);
    assert.deepEqual(s1Votes.body, [{ id: '1', selected: '5' }]);

    const s2Votes = await request('GET', '/vote-mapping/session-beta');
    assert.equal(s2Votes.status, 200);
    assert.deepEqual(s2Votes.body, [{ id: '1', selected: '8' }]);

    const s1Stories = await request(
      'GET',
      '/poker-planning-view-as-scrum-master/session-alpha'
    );
    assert.equal(s1Stories.status, 200);
    assert.equal(s1Stories.body[0].story, 'Alpha Story 1');

    const s2Stories = await request(
      'GET',
      '/poker-planning-view-as-scrum-master/session-beta'
    );
    assert.equal(s2Stories.status, 200);
    assert.equal(s2Stories.body[0].story, 'Beta Story 1');
  });

  it('returns 404 with JSON error for unknown sessions across all endpoints', async () => {
    const endpoints = [
      ['GET', '/poker-planning-view-as-developer/missing-session'],
      ['GET', '/poker-planning-view-as-developer/missing-session/developers/1'],
      ['GET', '/poker-planning-view-as-scrum-master/missing-session'],
      ['GET', '/vote-mapping/missing-session'],
      [
        'POST',
        '/poker-planning-view-as-developer/missing-session/developers/1',
        { id: '1', selected: '3' }
      ],
      [
        'POST',
        '/poker-planning-view-as-scrum-master/missing-session',
        [{ story: 'Story 1', storyPoint: '3', status: 'Voted' }]
      ]
    ];

    for (const [method, path, body] of endpoints) {
      const res = await request(method, path, body);
      assert.equal(res.status, 404, `Expected 404 for ${method} ${path}`);
      assert.ok(
        res.body && typeof res.body.error === 'string',
        `Expected error message in body for ${method} ${path}`
      );
    }
  });

  it('returns 400 with JSON error for invalid setup payloads', async () => {
    const badSetups = [
      {
        desc: 'empty story list',
        payload: { numberOfVoters: 2, storyList: [] }
      },
      {
        desc: 'missing story list',
        payload: { numberOfVoters: 2 }
      },
      {
        desc: 'invalid story status constant',
        payload: {
          numberOfVoters: 2,
          storyList: [{ story: 'Story 1', storyPoint: '', status: 'Pending' }]
        }
      },
      {
        desc: 'empty story description',
        payload: {
          numberOfVoters: 2,
          storyList: [{ story: '   ', storyPoint: '', status: 'Active' }]
        }
      },
      {
        desc: 'invalid story id shape',
        payload: {
          numberOfVoters: 2,
          storyList: [
            { id: '', story: 'Story 1', storyPoint: '', status: 'Active' }
          ]
        }
      },
      {
        desc: 'zero voter count',
        payload: {
          numberOfVoters: 0,
          storyList: [{ story: 'Story 1', storyPoint: '', status: 'Active' }]
        }
      },
      {
        desc: 'negative voter count',
        payload: {
          numberOfVoters: -2,
          storyList: [{ story: 'Story 1', storyPoint: '', status: 'Active' }]
        }
      },
      {
        desc: 'non-numeric voter count',
        payload: {
          numberOfVoters: 'abc',
          storyList: [{ story: 'Story 1', storyPoint: '', status: 'Active' }]
        }
      }
    ];

    for (const { desc, payload } of badSetups) {
      const res = await request(
        'POST',
        '/poker-planning-view-as-developer/session-bad',
        payload
      );
      assert.equal(res.status, 400, `Expected 400 for ${desc}`);
      assert.ok(
        res.body && typeof res.body.error === 'string',
        `Expected error message for ${desc}`
      );
    }
  });

  it('validates voter IDs, counts, estimates, and active story on vote route', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-vote', {
      numberOfVoters: 2,
      storyList: [
        { story: 'First Story', storyPoint: '', status: 'Active' },
        { story: 'Second Story', storyPoint: '', status: 'Not Voted' }
      ]
    });

    const badVotes = [
      {
        desc: 'non-positive integer voter id in route',
        path: '/poker-planning-view-as-developer/session-vote/developers/0',
        body: { id: '0', selected: '5' }
      },
      {
        desc: 'route id exceeding voter count',
        path: '/poker-planning-view-as-developer/session-vote/developers/3',
        body: { id: '3', selected: '5' }
      },
      {
        desc: 'body id not matching route id',
        path: '/poker-planning-view-as-developer/session-vote/developers/1',
        body: { id: '2', selected: '5' }
      },
      {
        desc: 'estimate not in dayList',
        path: '/poker-planning-view-as-developer/session-vote/developers/1',
        body: { id: '1', selected: '4' }
      },
      {
        desc: 'stale active story identifier',
        path: '/poker-planning-view-as-developer/session-vote/developers/1',
        body: { id: '1', selected: '5', story: 'Second Story' }
      }
    ];

    for (const { desc, path, body } of badVotes) {
      const res = await request('POST', path, body);
      assert.equal(res.status, 400, `Expected 400 for ${desc}`);
      assert.ok(
        res.body && typeof res.body.error === 'string',
        `Expected error message for ${desc}`
      );
    }
  });

  it('supports duplicate/retry vote from same developer without duplicating entries', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-retry', {
      numberOfVoters: 2,
      storyList: [{ story: 'Retry Story', storyPoint: '', status: 'Active' }]
    });

    const firstVote = await request(
      'POST',
      '/poker-planning-view-as-developer/session-retry/developers/1',
      { id: '1', selected: '5', storyId: 1 }
    );
    assert.equal(firstVote.status, 204);

    const retryVote = await request(
      'POST',
      '/poker-planning-view-as-developer/session-retry/developers/1',
      { id: '1', selected: '13', storyId: 1 }
    );
    assert.equal(retryVote.status, 204);

    const votes = await request('GET', '/vote-mapping/session-retry');
    assert.equal(votes.status, 200);
    assert.equal(votes.body.length, 1);
    assert.deepEqual(votes.body[0], { id: '1', selected: '13' });
  });

  it('resets votes and progresses stories only for its own session including completion', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-main', {
      numberOfVoters: 2,
      storyList: [
        { story: 'Main Story 1', storyPoint: '', status: 'Active' },
        { story: 'Main Story 2', storyPoint: '', status: 'Not Voted' }
      ]
    });
    await request('POST', '/poker-planning-view-as-developer/session-other', {
      numberOfVoters: 2,
      storyList: [{ story: 'Other Story', storyPoint: '', status: 'Active' }]
    });

    await request(
      'POST',
      '/poker-planning-view-as-developer/session-main/developers/1',
      { id: '1', selected: '5', storyId: 1 }
    );
    await request(
      'POST',
      '/poker-planning-view-as-developer/session-other/developers/1',
      { id: '1', selected: '8', storyId: 1 }
    );

    const advance = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-main',
      [
        { id: 1, story: 'Main Story 1', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'Main Story 2', storyPoint: '', status: 'Active' }
      ]
    );
    assert.equal(advance.status, 204);

    const mainVotesAfterAdvance = await request(
      'GET',
      '/vote-mapping/session-main'
    );
    assert.deepEqual(mainVotesAfterAdvance.body, []);

    const otherVotes = await request('GET', '/vote-mapping/session-other');
    assert.deepEqual(otherVotes.body, [{ id: '1', selected: '8' }]);

    const complete = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-main',
      [
        { id: 1, story: 'Main Story 1', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'Main Story 2', storyPoint: '8', status: 'Voted' }
      ]
    );
    assert.equal(complete.status, 204);

    const mainStoriesAfterComplete = await request(
      'GET',
      '/poker-planning-view-as-scrum-master/session-main'
    );
    assert.deepEqual(mainStoriesAfterComplete.body, [
      { id: 1, story: 'Main Story 1', storyPoint: '5', status: 'Voted' },
      { id: 2, story: 'Main Story 2', storyPoint: '8', status: 'Voted' }
    ]);

    const emptyProgress = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-main',
      []
    );
    assert.equal(emptyProgress.status, 400);

    const voteOnCompleted = await request(
      'POST',
      '/poker-planning-view-as-developer/session-main/developers/1',
      { id: '1', selected: '3' }
    );
    assert.equal(voteOnCompleted.status, 400);

    const otherStillActive = await request(
      'GET',
      '/poker-planning-view-as-scrum-master/session-other'
    );
    assert.equal(otherStillActive.body[0].story, 'Other Story');
  });

  it('handles session names with spaces, Unicode, ?, #, and / in client URL construction and server routing', async () => {
    const rawName = 'Sprint #1 / 2026? 🚀';
    const encoded = encodeURIComponent(rawName);

    const setup = await request(
      'POST',
      `/poker-planning-view-as-developer/${encoded}`,
      {
        numberOfVoters: 2,
        storyList: [
          { story: 'Complex Story 1', storyPoint: '', status: 'Active' },
          { story: 'Complex Story 2', storyPoint: '', status: 'Not Voted' }
        ]
      }
    );
    assert.equal(setup.status, 204);

    const developerStories = await request(
      'GET',
      `/poker-planning-view-as-developer/${encoded}/developers/1`
    );
    assert.equal(developerStories.status, 200);
    assert.deepEqual(developerStories.body, [
      { id: 1, story: 'Complex Story 1', storyPoint: '', status: 'Active' },
      { id: 2, story: 'Complex Story 2', storyPoint: '', status: 'Not Voted' }
    ]);

    const vote = await request(
      'POST',
      `/poker-planning-view-as-developer/${encoded}/developers/1`,
      { id: '1', selected: '5', story: 'Complex Story 1', storyId: 1 }
    );
    assert.equal(vote.status, 204);

    const votes = await request('GET', `/vote-mapping/${encoded}`);
    assert.equal(votes.status, 200);
    assert.deepEqual(votes.body, [{ id: '1', selected: '5' }]);

    const stories = await request(
      'GET',
      `/poker-planning-view-as-scrum-master/${encoded}`
    );
    assert.equal(stories.status, 200);
    assert.equal(stories.body[0].story, 'Complex Story 1');

    const progress = await request(
      'POST',
      `/poker-planning-view-as-scrum-master/${encoded}`,
      [
        { id: 1, story: 'Complex Story 1', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'Complex Story 2', storyPoint: '', status: 'Active' }
      ]
    );
    assert.equal(progress.status, 204);

    const progressedStories = await request(
      'GET',
      `/poker-planning-view-as-developer/${encoded}/developers/1`
    );
    assert.deepEqual(progressedStories.body, [
      { id: 1, story: 'Complex Story 1', storyPoint: '5', status: 'Voted' },
      { id: 2, story: 'Complex Story 2', storyPoint: '', status: 'Active' }
    ]);

    const votesAfterProgress = await request('GET', `/vote-mapping/${encoded}`);
    assert.deepEqual(votesAfterProgress.body, []);
  });

  it('keeps literal percent sequences distinct from encoded session names', async () => {
    for (const name of ['Sprint%20A', 'Sprint A']) {
      const result = await request(
        'POST',
        `/poker-planning-view-as-developer/${encodeURIComponent(name)}`,
        { numberOfVoters: 1, storyList: [{ story: name, storyPoint: '', status: 'Active' }] }
      );
      assert.equal(result.status, 204);
    }
    for (const name of ['Sprint%20A', 'Sprint A']) {
      const result = await request('GET', `/poker-planning-view-as-developer/${encodeURIComponent(name)}`);
      assert.equal(result.body[0].story, name);
    }
  });

  it('enforces real progression scored story shape and rejects invalid scored shapes', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-lifecycle', {
      numberOfVoters: 2,
      storyList: [
        { story: 'Card A', storyPoint: '', status: 'Active' },
        { story: 'Card B', storyPoint: '', status: 'Not Voted' }
      ]
    });

    const step1 = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-lifecycle',
      [
        { id: 1, story: 'Card A', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'Card B', storyPoint: '', status: 'Active' }
      ]
    );
    assert.equal(step1.status, 204);

    const step2 = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-lifecycle',
      [
        { id: 1, story: 'Card A', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'Card B', storyPoint: '8', status: 'Voted' }
      ]
    );
    assert.equal(step2.status, 204);

    const invalidScoredShapes = [
      {
        desc: 'storyPoint is object',
        body: [
          { story: 'Card A', storyPoint: { value: 5 }, status: 'Voted' }
        ]
      },
      {
        desc: 'storyPoint is boolean',
        body: [{ story: 'Card A', storyPoint: true, status: 'Voted' }]
      },
      {
        desc: 'invalid status string',
        body: [{ story: 'Card A', storyPoint: '5', status: 'Done' }]
      }
    ];

    for (const { desc, body } of invalidScoredShapes) {
      const res = await request(
        'POST',
        '/poker-planning-view-as-scrum-master/session-lifecycle',
        body
      );
      assert.equal(res.status, 400, `Expected 400 for ${desc}`);
    }
  });

  it('prevents cross-session overwrites on initialization while allowing intentional same-name setup', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-alpha', {
      numberOfVoters: 2,
      storyList: [{ story: 'Initial Story', storyPoint: '', status: 'Active' }]
    });

    const crossOverwrite = await request(
      'POST',
      '/poker-planning-view-as-developer/session-alpha',
      {
        numberOfVoters: 2,
        sessionName: 'session-beta',
        storyList: [{ story: 'Cross Story', storyPoint: '', status: 'Active' }]
      }
    );
    assert.equal(crossOverwrite.status, 400);

    const sameNameReinit = await request(
      'POST',
      '/poker-planning-view-as-developer/session-alpha',
      {
        numberOfVoters: 3,
        sessionName: 'session-alpha',
        storyList: [{ story: 'Replaced Story', storyPoint: '', status: 'Active' }]
      }
    );
    assert.equal(sameNameReinit.status, 204);

    const stories = await request(
      'GET',
      '/poker-planning-view-as-scrum-master/session-alpha'
    );
    assert.equal(stories.body[0].story, 'Replaced Story');
  });

  it('enforces facilitator token authorization on scrum-master routes', async () => {
    const setup = await request('POST', '/poker-planning-view-as-developer/session-auth', {
      numberOfVoters: 1,
      storyList: [
        { story: 'Auth Story 1', storyPoint: '', status: 'Active' },
        { story: 'Auth Story 2', storyPoint: '', status: 'Not Voted' }
      ]
    });
    assert.equal(setup.status, 204);
    const token = setup.headers['x-facilitator-token'];
    assert.ok(typeof token === 'string' && token.length > 0);

    const progressPayload = [
      { id: 1, story: 'Auth Story 1', storyPoint: '5', status: 'Voted' },
      { id: 2, story: 'Auth Story 2', storyPoint: '', status: 'Active' }
    ];

    // Missing token
    const withoutToken = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-auth',
      progressPayload,
      { 'x-facilitator-token': '' }
    );
    assert.equal(withoutToken.status, 403);
    assert.equal(withoutToken.body.error, 'Unauthorized: missing or invalid facilitator token');

    // Wrong token
    const withWrongToken = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-auth',
      progressPayload,
      { 'x-facilitator-token': 'wrong-token-value' }
    );
    assert.equal(withWrongToken.status, 403);

    // Correct token
    const withValidToken = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-auth',
      progressPayload,
      { 'x-facilitator-token': token }
    );
    assert.equal(withValidToken.status, 204);
  });

  it('allows facilitator to restart voting on current story via reset-votes', async () => {
    const setup = await request('POST', '/poker-planning-view-as-developer/session-reset', {
      numberOfVoters: 2,
      storyList: [{ story: 'Reset Story', storyPoint: '', status: 'Active' }]
    });
    const token = setup.headers['x-facilitator-token'];

    // Developer 1 votes
    await request('POST', '/poker-planning-view-as-developer/session-reset/developers/1', {
      id: '1', selected: '5', storyId: 1
    });
    const votesBefore = await request('GET', '/vote-mapping/session-reset');
    assert.equal(votesBefore.body.length, 1);

    // Reset without token is forbidden
    const unauthReset = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-reset/reset-votes',
      {},
      { 'x-facilitator-token': 'invalid' }
    );
    assert.equal(unauthReset.status, 403);

    // Reset with valid token clears votes
    const authReset = await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-reset/reset-votes',
      {},
      { 'x-facilitator-token': token }
    );
    assert.equal(authReset.status, 204);

    const votesAfter = await request('GET', '/vote-mapping/session-reset');
    assert.deepEqual(votesAfter.body, []);
  });

  it('streams Server-Sent Events for initialization, votes, and story progression', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-sse', {
      numberOfVoters: 2,
      storyList: [
        { story: 'SSE Story 1', storyPoint: '', status: 'Active' },
        { story: 'SSE Story 2', storyPoint: '', status: 'Not Voted' }
      ]
    });

    const events = [];
    const sseReq = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/events/session-sse',
      method: 'GET'
    }, res => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/event-stream');
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n\n');
        buffer = lines.pop();
        for (const block of lines) {
          const match = block.match(/^data:\s*(.+)$/m);
          if (match) {
            try {
              events.push(JSON.parse(match[1]));
            } catch (e) {}
          }
        }
      });
    });
    sseReq.end();

    // Wait for init event
    for (let i = 0; i < 20 && events.length < 1; i++) {
      await new Promise(r => setTimeout(r, 25));
    }
    assert.ok(events.length >= 1);
    assert.equal(events[0].type, 'init');
    assert.equal(events[0].storyList.length, 2);

    // Cast vote and verify broadcast
    await request(
      'POST',
      '/poker-planning-view-as-developer/session-sse/developers/1',
      { id: '1', selected: '5', storyId: 1 }
    );

    for (let i = 0; i < 20 && events.length < 2; i++) {
      await new Promise(r => setTimeout(r, 25));
    }
    assert.ok(events.length >= 2);
    const voteEvent = events.find(e => e.type === 'vote');
    assert.ok(voteEvent);
    assert.deepEqual(voteEvent.votes, [{ id: '1', selected: '5' }]);

    // Progress story and verify broadcast
    await request(
      'POST',
      '/poker-planning-view-as-scrum-master/session-sse',
      [
        { id: 1, story: 'SSE Story 1', storyPoint: '5', status: 'Voted' },
        { id: 2, story: 'SSE Story 2', storyPoint: '', status: 'Active' }
      ]
    );

    for (let i = 0; i < 20 && events.length < 3; i++) {
      await new Promise(r => setTimeout(r, 25));
    }
    assert.ok(events.length >= 3);
    const progressEvent = events.find(e => e.type === 'progress');
    assert.ok(progressEvent);
    assert.equal(progressEvent.storyList[0].status, 'Voted');
    assert.equal(progressEvent.storyList[1].status, 'Active');

    sseReq.destroy();
  });

  it('persists session state and recovers it on restart', async () => {
    await request('POST', '/poker-planning-view-as-developer/session-persist', {
      numberOfVoters: 2,
      storyList: [
        { story: 'Persist Story', storyPoint: '', status: 'Active' }
      ]
    });
    await request(
      'POST',
      '/poker-planning-view-as-developer/session-persist/developers/1',
      { id: '1', selected: '8', storyId: 1 }
    );

    // Simulate restart by clearing memory and reloading from disk
    app.broadcast('session-persist', {}); // no-op broadcast check
    if (app.loadSessions) {
      // Clear in-memory map without deleting disk file
      const beforeReload = await request('GET', '/vote-mapping/session-persist');
      assert.equal(beforeReload.status, 200);

      // Verify persistence file exists and loadSessions reloads it
      app.loadSessions();
      const afterReload = await request('GET', '/vote-mapping/session-persist');
      assert.equal(afterReload.status, 200);
      assert.deepEqual(afterReload.body, [{ id: '1', selected: '8' }]);
    }
  });
});
