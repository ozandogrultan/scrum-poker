const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let storyStatusModule;
try {
  storyStatusModule = require('./src/App/common/storyStatus');
} catch (e) {
  storyStatusModule = {};
}
let dayListModule;
try {
  dayListModule = require('./src/App/common/dayList');
} catch (e) {
  dayListModule = {};
}

const ACTIVE = storyStatusModule.ACTIVE || 'Active';
const NOT_VOTED = storyStatusModule.NOT_VOTED || 'Not Voted';
const VOTED = storyStatusModule.VOTED || 'Voted';
const VALID_STATUSES = new Set([ACTIVE, NOT_VOTED, VOTED]);
const dayList = (dayListModule && (dayListModule.default || dayListModule)) || [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233
];

const app = express();
const port = process.env.PORT || 5001;
const sessions = new Map();
const sessionSubscribers = new Map();

const storageFile = process.env.STORAGE_FILE || path.join(__dirname, '.data', 'sessions.json');

const persistSessions = () => {
  if (storageFile === ':memory:') return;
  try {
    const dir = path.dirname(storageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {};
    for (const [key, value] of sessions.entries()) {
      data[key] = value;
    }
    const tmp = `${storageFile}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, storageFile);
  } catch (err) {
    console.error('Failed to persist sessions:', err.message);
  }
};

const loadSessions = () => {
  if (storageFile === ':memory:') return;
  try {
    if (fs.existsSync(storageFile)) {
      const content = fs.readFileSync(storageFile, 'utf8');
      if (content.trim()) {
        const parsed = JSON.parse(content);
        for (const [key, value] of Object.entries(parsed)) {
          sessions.set(key, value);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load sessions from storage:', err.message);
  }
};

const broadcast = (sessionName, data) => {
  const subscribers = sessionSubscribers.get(sessionName);
  if (!subscribers || subscribers.size === 0) return;
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of subscribers) {
    try {
      client.write(message);
    } catch (e) {
      subscribers.delete(client);
    }
  }
};

loadSessions();

app.use(cors({ exposedHeaders: ['X-Facilitator-Token'] }));
app.use(express.json());

const isPositiveInteger = val => {
  const num = Number(val);
  return Number.isInteger(num) && num > 0 && String(val).trim() === String(num);
};

const isValidStoryId = id => {
  if (id === undefined) return true;
  if (typeof id === 'string') return id.trim().length > 0;
  return Number.isInteger(id) && id > 0;
};

const isValidStory = story => {
  if (!story || typeof story !== 'object') return false;
  if (typeof story.story !== 'string' || !story.story.trim()) return false;
  if (!VALID_STATUSES.has(story.status)) return false;
  if (!isValidStoryId(story.id)) return false;
  if (
    story.storyPoint !== undefined &&
    typeof story.storyPoint !== 'string' &&
    typeof story.storyPoint !== 'number'
  ) {
    return false;
  }
  return true;
};

app.post('/poker-planning-view-as-developer/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  if (!sessionName || !sessionName.trim()) {
    return res.status(400).json({ error: 'Session name is required' });
  }
  const body = req.body;
  const stories = body && (body.storyList !== undefined ? body.storyList : body.data);
  const numberOfVoters = body && body.numberOfVoters;

  if (
    body &&
    body.sessionName !== undefined &&
    typeof body.sessionName === 'string' &&
    body.sessionName.trim() !== sessionName
  ) {
    return res.status(400).json({ error: 'Session name in body does not match route' });
  }

  if (!isPositiveInteger(numberOfVoters)) {
    return res.status(400).json({ error: 'numberOfVoters must be a positive integer' });
  }
  if (!Array.isArray(stories) || stories.length === 0) {
    return res.status(400).json({ error: 'storyList must be a non-empty array' });
  }
  if (!stories.every(isValidStory)) {
    return res.status(400).json({ error: 'Invalid story list item shape or status' });
  }
  if (stories.some((story, i) => story.status !== (i === 0 ? ACTIVE : NOT_VOTED) || (story.storyPoint !== undefined && story.storyPoint !== ''))) {
    return res.status(400).json({ error: 'New sessions require one active story followed by unvoted stories' });
  }
  const storyList = stories.map((story, i) => ({ ...story, id: story.id === undefined ? i + 1 : story.id }));
  if (new Set(storyList.map(story => story.id)).size !== storyList.length) {
    return res.status(400).json({ error: 'Story IDs must be unique' });
  }

  const facilitatorToken =
    (body && typeof body.facilitatorToken === 'string' && body.facilitatorToken.trim()) ||
    crypto.randomBytes(16).toString('hex');

  sessions.set(sessionName, {
    sessionName,
    numberOfVoters: Number(numberOfVoters),
    storyList,
    votes: [],
    facilitatorToken
  });
  persistSessions();
  broadcast(sessionName, {
    type: 'init',
    storyList,
    votes: []
  });
  res.setHeader('Access-Control-Expose-Headers', 'X-Facilitator-Token');
  res.setHeader('X-Facilitator-Token', facilitatorToken);
  return res.sendStatus(204);
});

app.get('/poker-planning-view-as-developer/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json(session.storyList);
});

app.get('/poker-planning-view-as-developer/:sessionName/developers/:id', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!isPositiveInteger(req.params.id) || Number(req.params.id) > session.numberOfVoters) {
    return res.status(400).json({ error: 'Invalid voter ID' });
  }
  return res.json(session.storyList);
});

app.post('/poker-planning-view-as-developer/:sessionName/developers/:id', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!isPositiveInteger(req.params.id) || Number(req.params.id) > session.numberOfVoters) {
    return res.status(400).json({ error: 'Invalid voter ID in route' });
  }
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid vote body' });
  }
  if (!isPositiveInteger(body.id) || Number(body.id) !== Number(req.params.id)) {
    return res.status(400).json({ error: 'Body voter ID must match route ID' });
  }
  const estimate = Number(body.selected);
  if (!dayList.includes(estimate)) {
    return res.status(400).json({ error: 'Invalid estimate value' });
  }
  const activeStory = session.storyList.find(s => s.status === ACTIVE);
  if (!activeStory) {
    return res.status(400).json({ error: 'No active story available for voting' });
  }
  if (body.story !== undefined && body.story !== activeStory.story) {
    return res.status(400).json({ error: 'Stale vote: active story has changed' });
  }
  if (body.storyId !== activeStory.id) {
    return res.status(400).json({ error: 'Stale vote: active story ID has changed' });
  }

  const existingVote = session.votes.find(v => Number(v.id) === Number(req.params.id));
  if (existingVote) {
    existingVote.selected = String(estimate);
  } else {
    session.votes.push({ id: String(req.params.id), selected: String(estimate) });
  }
  persistSessions();
  broadcast(sessionName, {
    type: 'vote',
    votes: session.votes,
    storyList: session.storyList
  });
  return res.sendStatus(204);
});

app.get('/poker-planning-view-as-scrum-master/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json(session.storyList);
});

app.post('/poker-planning-view-as-scrum-master/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const clientToken = req.headers['x-facilitator-token'] || (req.body && req.body.facilitatorToken);
  if (session.facilitatorToken && clientToken !== session.facilitatorToken) {
    return res.status(403).json({ error: 'Unauthorized: missing or invalid facilitator token' });
  }
  const body = req.body;
  const stories = Array.isArray(body) ? body : (body && body.storyList);
  if (!Array.isArray(stories)) {
    return res.status(400).json({ error: 'Invalid story list payload' });
  }
  if (stories.length === 0 || !stories.every(isValidStory)) {
    return res.status(400).json({ error: 'Invalid story format' });
  }
  const activeIndex = session.storyList.findIndex(story => story.status === ACTIVE);
  if (activeIndex < 0 || stories.length !== session.storyList.length || !stories.every((story, i) => {
    const previous = session.storyList[i];
    if (story.id !== previous.id || story.story !== previous.story) return false;
    if (i === activeIndex) return story.status === VOTED && dayList.includes(Number(story.storyPoint));
    const status = i === activeIndex + 1 ? ACTIVE : previous.status;
    return story.status === status && story.storyPoint === previous.storyPoint;
  })) {
    return res.status(400).json({ error: 'Progression must score the active story and advance the next story without changing the list' });
  }

  session.storyList = stories;
  session.votes = [];
  persistSessions();
  broadcast(sessionName, {
    type: 'progress',
    storyList: session.storyList,
    votes: []
  });
  return res.sendStatus(204);
});

app.post('/poker-planning-view-as-scrum-master/:sessionName/reset-votes', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const clientToken = req.headers['x-facilitator-token'] || (req.body && req.body.facilitatorToken);
  if (session.facilitatorToken && clientToken !== session.facilitatorToken) {
    return res.status(403).json({ error: 'Unauthorized: missing or invalid facilitator token' });
  }
  session.votes = [];
  persistSessions();
  broadcast(sessionName, {
    type: 'vote',
    votes: [],
    storyList: session.storyList
  });
  return res.sendStatus(204);
});

app.get('/vote-mapping/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json(session.votes);
});

app.get('/vote-mapping', (req, res) => {
  return res.status(400).json({ error: 'Session name is required' });
});

app.get('/events/:sessionName', (req, res) => {
  const sessionName = req.params.sessionName;
  const session = sessions.get(sessionName);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  res.write(`data: ${JSON.stringify({
    type: 'init',
    storyList: session.storyList,
    votes: session.votes
  })}\n\n`);

  if (!sessionSubscribers.has(sessionName)) {
    sessionSubscribers.set(sessionName, new Set());
  }
  const subscribers = sessionSubscribers.get(sessionName);
  subscribers.add(res);

  req.on('close', () => {
    subscribers.delete(res);
    if (subscribers.size === 0) {
      sessionSubscribers.delete(sessionName);
    }
  });
});

app.resetSessions = () => {
  sessions.clear();
  sessionSubscribers.clear();
  if (storageFile !== ':memory:' && fs.existsSync(storageFile)) {
    try {
      fs.unlinkSync(storageFile);
    } catch (e) {}
  }
};
app.loadSessions = loadSessions;
app.persistSessions = persistSessions;
app.broadcast = broadcast;

if (require.main === module) {
  app.listen(port, () => console.log(`Listening on port ${port}`));
}

module.exports = app;
