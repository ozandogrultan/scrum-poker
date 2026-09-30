import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route } from 'react-router-dom';
import App from '../../App';

const SETUP_PATH = '/poker-planning-add-story-list';
const MASTER_PATH = '/poker-planning-view-as-scrum-master/sprint1';
const STORAGE_KEY = 'scrum-poker:session:sprint1';
const stories = [
  { id: 1, story: 'Story A', storyPoint: '', status: 'Active' },
  { id: 2, story: 'Story B', storyPoint: '', status: 'Not Voted' }
];

let container;
let currentPath;
let currentLocation;
let currentHistory;
let fetchMock;
let serverStories;
let serverVotes;
let postOk;

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const render = entry => {
  ReactDOM.render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <Route
        render={({ location, history }) => {
          currentPath = location.pathname;
          currentLocation = location;
          currentHistory = history;
          return null;
        }}
      />
    </MemoryRouter>,
    container
  );
};

const posts = () =>
  fetchMock.mock.calls.filter(([, options]) => options && options.method === 'POST');

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
  serverStories = stories;
  serverVotes = [];
  postOk = true;
  fetchMock = jest.fn((url, options) => {
    const isPost = options && options.method === 'POST';
    return Promise.resolve({
      ok: isPost ? postOk : true,
      status: isPost && !postOk ? 500 : isPost ? 204 : 200,
      json: () =>
        Promise.resolve(
          url.startsWith('/vote-mapping') ? serverVotes : serverStories
        )
    });
  });
  global.fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.removeChild(container);
  jest.clearAllTimers();
  jest.useRealTimers();
  console.error.mockRestore();
});

it('redirects to setup without posting when there is no route state or saved session', async () => {
  render(MASTER_PATH);
  await flush();
  expect(currentPath).toBe(SETUP_PATH);
  expect(posts()).toHaveLength(0);
});

it('recovers a saved session on refresh using GET and no initial POST', async () => {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ numberOfVoters: '2' }));
  render(MASTER_PATH);
  jest.advanceTimersByTime(2000);
  await flush();
  expect(currentPath).toBe(MASTER_PATH);
  expect(posts()).toHaveLength(0);
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
    '/poker-planning-view-as-scrum-master/sprint1'
  );
  expect(container.textContent).toContain('Voter 2:');
  expect(container.textContent).toContain('Story A');
});

it('treats unmarked route state as a new session even when a saved record exists', async () => {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ numberOfVoters: '2' }));
  render({
    pathname: MASTER_PATH,
    state: {
      data: [{ story: 'Fresh Story', storyPoint: '', status: 'Active' }],
      numberOfVoters: '4',
      sessionName: 'sprint1'
    }
  });
  await flush();
  expect(posts()).toHaveLength(1);
  const setupPayload = JSON.parse(posts()[0][1].body);
  const setupStories = setupPayload.storyList || setupPayload;
  expect(setupStories[0].story).toBe('Fresh Story');
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
    numberOfVoters: '4'
  });
  expect(container.textContent).toContain('Voter 4:');
});

it('recovers an initialized route entry with GET, no POST and the saved voter count', async () => {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ numberOfVoters: '2' }));
  render({
    pathname: MASTER_PATH,
    state: {
      data: [{ story: 'Stale Story', storyPoint: '', status: 'Active' }],
      numberOfVoters: '5',
      sessionName: 'sprint1',
      initialized: true
    }
  });
  await flush();
  jest.advanceTimersByTime(2000);
  await flush();
  expect(posts()).toHaveLength(0);
  expect(container.textContent).toContain('Voter 2:');
  expect(container.textContent).not.toContain('Voter 3:');
  expect(container.textContent).toContain('Story A');
  expect(container.textContent).not.toContain('Stale Story');
});

it('recovers an initialized route entry with lost storage using the route voter count', async () => {
  render({
    pathname: MASTER_PATH,
    state: {
      data: stories,
      numberOfVoters: '3',
      sessionName: 'sprint1',
      initialized: true
    }
  });
  await flush();
  jest.advanceTimersByTime(2000);
  await flush();
  expect(posts()).toHaveLength(0);
  expect(container.textContent).toContain('Voter 3:');
  expect(container.textContent).toContain('Story A');
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
    numberOfVoters: '3'
  });
});

it('marks the entry initialized in history and a remount from it does not post', async () => {
  render({
    pathname: MASTER_PATH,
    state: { data: stories, numberOfVoters: '2', sessionName: 'sprint1' }
  });
  await flush();
  expect(posts()).toHaveLength(1);
  expect(currentLocation.pathname).toBe(MASTER_PATH);
  expect(currentLocation.state).toMatchObject({
    data: stories,
    numberOfVoters: '2',
    initialized: true
  });
  const resultingState = currentLocation.state;
  ReactDOM.unmountComponentAtNode(container);
  render({ pathname: MASTER_PATH, state: resultingState });
  await flush();
  jest.advanceTimersByTime(2000);
  await flush();
  expect(posts()).toHaveLength(1);
  expect(container.textContent).toContain('Voter 2:');
  expect(container.textContent).toContain('Story A');
});

it('does not post when navigating back to an initialized entry', async () => {
  render({
    pathname: MASTER_PATH,
    state: { data: stories, numberOfVoters: '2', sessionName: 'sprint1' }
  });
  await flush();
  expect(posts()).toHaveLength(1);
  currentHistory.push('/elsewhere');
  await flush();
  expect(currentPath).toBe('/elsewhere');
  currentHistory.goBack();
  await flush();
  expect(currentPath).toBe(MASTER_PATH);
  expect(posts()).toHaveLength(1);
  expect(container.textContent).toContain('Voter 2:');
});

it('redirects to setup when the saved session is malformed', async () => {
  window.sessionStorage.setItem(STORAGE_KEY, '{not json');
  render(MASTER_PATH);
  await flush();
  expect(currentPath).toBe(SETUP_PATH);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('posts the initial stories once for a new setup and stops polling on unmount', async () => {
  render({
    pathname: MASTER_PATH,
    state: { data: stories, numberOfVoters: '2', sessionName: 'sprint1' }
  });
  await flush();
  expect(posts()).toHaveLength(1);
  expect(posts()[0][0]).toBe('/poker-planning-view-as-developer/sprint1');
  ReactDOM.unmountComponentAtNode(container);
  const calls = fetchMock.mock.calls.length;
  jest.advanceTimersByTime(4000);
  await flush();
  expect(fetchMock.mock.calls.length).toBe(calls);
});

it('saves the setup from route state into sessionStorage', async () => {
  render({
    pathname: MASTER_PATH,
    state: { data: stories, numberOfVoters: '3', sessionName: 'sprint1' }
  });
  await flush();
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toMatchObject({
    numberOfVoters: '3'
  });
});

it('renders without crashing when the story list is empty', async () => {
  serverStories = [];
  render({
    pathname: MASTER_PATH,
    state: { data: [], numberOfVoters: '1', sessionName: 'sprint1' }
  });
  jest.advanceTimersByTime(2000);
  await flush();
  expect(currentPath).toBe(MASTER_PATH);
  expect(container.textContent).toContain('Voter 1:');
});

const newSetup = (numberOfVoters = '1') => ({
  pathname: MASTER_PATH,
  state: { data: stories, numberOfVoters, sessionName: 'sprint1' }
});

const voteButton = label =>
  Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === label
  );

it('exposes the master vote buttons as a pressed toggle', async () => {
  render(newSetup());
  await flush();
  const button = container.querySelector('button[aria-pressed]');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  button.click();
  expect(button.getAttribute('aria-pressed')).toBe('true');
});

it('reports a failed session initialization and does not mark it initialized', async () => {
  postOk = false;
  render(newSetup());
  await flush();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(currentLocation.state.initialized).toBeUndefined();
});

it('retries a failed session initialization', async () => {
  postOk = false;
  render(newSetup());
  await flush();
  postOk = true;
  voteButton('Try again').click();
  await flush();
  expect(posts()).toHaveLength(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(currentLocation.state.initialized).toBe(true);
});

const finishVoting = async () => {
  serverStories = stories;
  render(newSetup());
  await flush();
  serverVotes = [{ id: '1', selected: '3' }];
  container.querySelector('button[aria-pressed]').click();
  jest.advanceTimersByTime(2000);
  await flush();
};

it('labels the final score field', async () => {
  await finishVoting();
  const input = container.querySelector('input[name="finalScore"]');
  expect(input).not.toBeNull();
  const label = container.querySelector('label[for="' + input.id + '"]');
  expect(label.textContent).toBe('Final score');
});

it('keeps the story and final score when ending the vote fails', async () => {
  await finishVoting();
  const input = container.querySelector('input[name="finalScore"]');
  input.value = '5';
  Simulate.change(input);
  postOk = false;
  voteButton('End Voting For Story A').click();
  await flush();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('input[name="finalScore"]').value).toBe('5');
  expect(container.textContent).toContain('Story A is active');
});

it('advances to the next story only after the server confirms', async () => {
  await finishVoting();
  const input = container.querySelector('input[name="finalScore"]');
  input.value = '5';
  Simulate.change(input);
  voteButton('End Voting For Story A').click();
  await flush();
  const body = JSON.parse(posts()[posts().length - 1][1].body);
  expect(body.map(r => r.status)).toEqual(['Voted', 'Active']);
  expect(body).toEqual([
    { id: 1, story: 'Story A', storyPoint: '5', status: 'Voted' },
    { id: 2, story: 'Story B', storyPoint: '', status: 'Active' }
  ]);
  expect(container.textContent).toContain('Story B is active');
});

it('does not overlap story polls while a request is in flight', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ numberOfVoters: '2' }));
  render(MASTER_PATH);
  jest.advanceTimersByTime(10000);
  await flush();
  const storyGets = fetchMock.mock.calls.filter(
    ([url]) => url === '/poker-planning-view-as-scrum-master/sprint1'
  );
  expect(storyGets).toHaveLength(1);
});

it('does not store the setup or mark the entry initialized when setup fails', async () => {
  postOk = false;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ numberOfVoters: '2' }));
  render(newSetup('4'));
  await flush();
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
    numberOfVoters: '2'
  });
  expect(currentLocation.state.initialized).toBeUndefined();
  jest.advanceTimersByTime(4000);
  await flush();
  expect(fetchMock.mock.calls.filter(([, o]) => !o)).toHaveLength(0);
});

it('stores nothing for a failed first setup and writes it after a successful retry', async () => {
  postOk = false;
  render(newSetup('3'));
  await flush();
  expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  postOk = true;
  voteButton('Try again').click();
  await flush();
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
    numberOfVoters: '3'
  });
  expect(currentLocation.state.initialized).toBe(true);
});

const votesFinish = async (votes, voters = '2') => {
  serverStories = stories;
  render(newSetup(voters));
  await flush();
  serverVotes = votes;
  container.querySelector('button[aria-pressed]').click();
  jest.advanceTimersByTime(2000);
  await flush();
};

const endButton = () => voteButton('End Voting For Story A');

it('finishes voting when every expected voter id has a valid vote', async () => {
  await votesFinish([
    { id: '2', selected: '5' },
    { id: '1', selected: '3' }
  ]);
  expect(endButton().disabled).toBe(false);
  expect(container.textContent).toContain('Voter 1:3');
  expect(container.textContent).toContain('Voter 2:5');
});

it.each([
  ['duplicate ids', [{ id: '1', selected: '3' }, { id: '1', selected: '5' }]],
  ['an unexpected id', [{ id: '1', selected: '3' }, { id: '9', selected: '5' }]],
  ['a missing id', [{ id: '1', selected: '3' }]],
  ['an extra id', [{ id: '1', selected: '3' }, { id: '2', selected: '5' }, { id: '3', selected: '8' }]],
  ['a non-numeric id', [{ id: '1', selected: '3' }, { id: 'x', selected: '5' }]],
  ['an invalid estimate', [{ id: '1', selected: '3' }, { id: '2', selected: '' }]]
])('does not finish or crash with %s', async (name, votes) => {
  await votesFinish(votes);
  expect(endButton().disabled).toBe(true);
  expect(container.textContent).toContain('Voter 2:');
});

it('encodes session names with spaces, Unicode, ?, #, and slashes in all requests', async () => {
  const complexName = 'Sprint #1 / 2026? 🚀';
  const encoded = encodeURIComponent(complexName);
  render({
    pathname: `/poker-planning-view-as-scrum-master/${encoded}`,
    state: { data: stories, numberOfVoters: '2', sessionName: complexName }
  });
  await flush();
  expect(posts()).toHaveLength(1);
  expect(posts()[0][0]).toBe(`/poker-planning-view-as-developer/${encoded}`);

  jest.advanceTimersByTime(2000);
  await flush();
  const calledUrls = fetchMock.mock.calls.map(([url]) => url);
  expect(calledUrls).toContain(
    `/poker-planning-view-as-scrum-master/${encoded}`
  );
  expect(calledUrls).toContain(`/vote-mapping/${encoded}`);
  expect(container.textContent).toContain(
    `${window.location.origin}/poker-planning-view-as-developer/${encoded}`
  );
  serverVotes = [{ id: '1', selected: '3' }, { id: '2', selected: '5' }];
  container.querySelector('button[aria-pressed]').click();
  jest.advanceTimersByTime(2000);
  await flush();
  const input = container.querySelector('input[name="finalScore"]');
  input.value = '8';
  Simulate.change(input);
  voteButton('End Voting For Story A').click();
  await flush();
  const progress = posts()[1];
  expect(progress[0]).toBe(`/poker-planning-view-as-scrum-master/${encoded}`);
  expect(JSON.parse(progress[1].body)).toEqual([
    { id: 1, story: 'Story A', storyPoint: '8', status: 'Voted' },
    { id: 2, story: 'Story B', storyPoint: '', status: 'Active' }
  ]);
});

it('captures facilitator token on initialization and sends it when ending vote', async () => {
  fetchMock.mockImplementation((url, options) => {
    const isPost = options && options.method === 'POST';
    return Promise.resolve({
      ok: true,
      status: isPost ? 204 : 200,
      headers: {
        get: name => (name.toLowerCase() === 'x-facilitator-token' ? 'secret-token-123' : null)
      },
      json: () =>
        Promise.resolve(
          url.startsWith('/vote-mapping') ? [{ id: '1', selected: '3' }] : stories
        )
    });
  });

  render({
    pathname: MASTER_PATH,
    state: {
      data: stories,
      numberOfVoters: '1',
      sessionName: 'sprint1'
    }
  });
  await flush();
  expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
    numberOfVoters: '1',
    facilitatorToken: 'secret-token-123'
  });

  jest.advanceTimersByTime(2000);
  await flush();
  // Scrum master votes 5 while voter 1 voted 3 (unequal votes renders final score input)
  container.querySelector('button[aria-pressed]').click();
  const input = container.querySelector('input[name="finalScore"]');
  expect(input).not.toBeNull();
  input.value = '5';
  Simulate.change(input);
  voteButton('End Voting For Story A').click();
  await flush();

  const progressCall = posts()[1];
  expect(progressCall[1].headers['X-Facilitator-Token']).toBe('secret-token-123');
});

it('receives real-time updates via EventSource when available', async () => {
  let eventSourceListener = null;
  const mockClose = jest.fn();
  window.EventSource = jest.fn().mockImplementation(() => ({
    close: mockClose,
    set onmessage(fn) {
      eventSourceListener = fn;
    }
  }));

  render({
    pathname: MASTER_PATH,
    state: {
      data: stories,
      numberOfVoters: '1',
      sessionName: 'sprint1'
    }
  });
  await flush();

  expect(window.EventSource).toHaveBeenCalledWith('/events/sprint1');
  expect(eventSourceListener).not.toBeNull();

  // Simulate incoming real-time vote
  eventSourceListener({
    data: JSON.stringify({
      type: 'vote',
      votes: [{ id: '1', selected: '8' }]
    })
  });
  await flush();

  expect(container.textContent).toContain('Voter 1:Voted');

  // Scrum master votes, finishing the vote and revealing the estimate
  container.querySelector('button[aria-pressed]').click();
  await flush();

  expect(container.textContent).toContain('Voter 1:8');
  delete window.EventSource;
});
