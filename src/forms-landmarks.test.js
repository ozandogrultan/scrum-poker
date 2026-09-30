import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route } from 'react-router-dom';
import App from './App/App';

const SETUP_PATH = '/poker-planning-add-story-list';
const JOIN_PATH = '/poker-planning-view-as-developer/sprint';
const stories = [
  { id: 1, story: 'Story A', storyPoint: '', status: 'Active' },
  { id: 2, story: 'Story B', storyPoint: '', status: 'Not Voted' }
];
const masterEntry = {
  pathname: '/poker-planning-view-as-scrum-master/sprint',
  state: { data: stories, numberOfVoters: '2', sessionName: 'sprint' }
};

let container;
let history;
let path;
let serverOk;

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

const render = entry => {
  ReactDOM.render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <Route
        render={props => {
          history = props.history;
          path = props.location.pathname;
          return null;
        }}
      />
    </MemoryRouter>,
    container
  );
};

const change = (selector, value) => {
  const field = container.querySelector(selector);
  field.value = value;
  Simulate.change(field, {
    target: { value, name: field.name, maxLength: field.tagName === 'TEXTAREA' ? -1 : field.maxLength }
  });
};

const posts = () => global.fetch.mock.calls.filter(([, options]) => options && options.method === 'POST');

const submitEvent = () => new Event('submit', { bubbles: true, cancelable: true });

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
  serverOk = true;
  global.fetch = jest.fn((url, options) =>
    Promise.resolve({
      ok: serverOk,
      status: serverOk ? 200 : 500,
      json: () => Promise.resolve(options && options.method === 'POST' ? {} : stories)
    })
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.clearAllTimers();
  jest.useRealTimers();
  console.error.mockRestore();
  delete global.fetch;
});

describe('landmarks and headings', () => {
  const routes = [
    ['home', '/', 'Scrum Poker Planning'],
    ['setup', SETUP_PATH, 'Start a session'],
    ['join', JOIN_PATH, 'Join a session'],
    ['vote', `${JOIN_PATH}/developers/1`, 'Vote on stories'],
    ['facilitate', masterEntry, 'Facilitate planning']
  ];

  routes.forEach(([name, entry, heading]) => {
    it(`${name} has one main landmark and one "${heading}" h1`, async () => {
      render(entry);
      await flush();
      expect(container.querySelectorAll('main')).toHaveLength(1);
      const headings = container.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
      expect(headings[0].textContent).toBe(heading);
      expect(container.querySelector('main').contains(headings[0])).toBe(true);
    });
  });
});

describe('explicit button types', () => {
  const types = () => Array.from(container.querySelectorAll('button')).map(b => b.getAttribute('type'));

  it('keeps the home link free of a type attribute', () => {
    render('/');
    const link = container.querySelector('a');
    expect(link.hasAttribute('type')).toBe(false);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('types the setup button as submit', () => {
    render(SETUP_PATH);
    expect(types()).toEqual(['submit']);
  });

  it('types the join button as submit and the recovery buttons as button', async () => {
    serverOk = false;
    render(JOIN_PATH);
    await flush();
    expect(container.textContent).toContain('Try again');
    expect(types()).toEqual(['button', 'submit']);
  });

  it('types every vote and retry button on the voting page as button', async () => {
    serverOk = false;
    render(`${JOIN_PATH}/developers/1`);
    await flush();
    expect(container.textContent).toContain('Try again');
    expect(types().every(type => type === 'button')).toBe(true);
    serverOk = true;
    Simulate.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Try again'));
    await flush();
    const all = types();
    expect(all.length).toBeGreaterThan(1);
    expect(all.every(type => type === 'button')).toBe(true);
  });

  it('types every facilitator button as button', async () => {
    render(masterEntry);
    await flush();
    const all = types();
    expect(all.length).toBeGreaterThan(1);
    expect(all.every(type => type === 'button')).toBe(true);
  });
});

describe('setup form', () => {
  it('submits from the form, prevents the native submit and shows errors when empty', () => {
    render(SETUP_PATH);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form.contains(container.querySelector('button[type="submit"]'))).toBe(true);
    const event = submitEvent();
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toContain('Enter a session name');
    expect(container.textContent).toContain('Enter a positive whole number of voters');
    expect(container.textContent).toContain('Enter at least one story');
    expect(history.length).toBe(1);
    expect(path).toBe(SETUP_PATH);
  });

  it('navigates once on a valid submit', async () => {
    render(SETUP_PATH);
    change('input[name="sessionName"]', 'sprint');
    change('input[name="numberOfVoters"]', '2');
    change('textarea[name="storyList"]', 'Story A\nStory B');
    const event = submitEvent();
    container.querySelector('form').dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(path).toBe('/poker-planning-view-as-scrum-master/sprint');
    expect(history.length).toBe(2);
    expect(posts()).toHaveLength(1);
  });

  it('encodes a complex session name when creating the story list', async () => {
    const name = 'Sprint #1 / 2026? 🚀';
    const encoded = encodeURIComponent(name);
    render(SETUP_PATH);
    change('input[name="sessionName"]', name);
    change('input[name="numberOfVoters"]', '2');
    change('textarea[name="storyList"]', 'Story A\nStory B');
    container.querySelector('form').dispatchEvent(submitEvent());
    await flush();
    expect(posts()[0][0]).toBe(`/poker-planning-view-as-developer/${encoded}`);
    expect(JSON.parse(posts()[0][1].body).storyList).toEqual(stories);
    expect(decodeURIComponent(path.split('/').pop())).toBe(name);
    expect(path).toContain('%23');
    expect(path).toContain('%2F');
    expect(path).toContain('%3F');
  });

  it('runs validation once per click of the submit button', () => {
    render(SETUP_PATH);
    const submit = jest.fn(e => e.preventDefault());
    container.querySelector('form').addEventListener('submit', submit);
    container.querySelector('button[type="submit"]').click();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Enter a session name');
  });

  it('keeps Enter in the story textarea as a newline', () => {
    render(SETUP_PATH);
    const textarea = container.querySelector('textarea[name="storyList"]');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(history.length).toBe(1);
    expect(container.textContent).not.toContain('Enter a session name');
  });
});

describe('join form', () => {
  it('submits from the form and shows the voter id error for an invalid id', async () => {
    render(JOIN_PATH);
    await flush();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form.contains(container.querySelector('input[name="id"]'))).toBe(true);
    change('input[name="id"]', '0');
    const event = submitEvent();
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toContain('positive whole-number');
    expect(history.length).toBe(1);
  });

  it('navigates once to the voting page on a valid submit', async () => {
    render(JOIN_PATH);
    await flush();
    change('input[name="id"]', '2');
    const event = submitEvent();
    container.querySelector('form').dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(path).toBe(`${JOIN_PATH}/developers/2`);
    expect(history.length).toBe(2);
  });

  it('encodes the session segment when reading and joining a complex session', async () => {
    const name = 'Sprint #1 / 2026? 🚀';
    const encoded = encodeURIComponent(name);
    render(`/poker-planning-view-as-developer/${encoded}`);
    await flush();
    expect(global.fetch.mock.calls[0][0]).toBe(`/poker-planning-view-as-developer/${encoded}`);
    change('input[name="id"]', '2');
    container.querySelector('form').dispatchEvent(submitEvent());
    await flush();
    expect(decodeURIComponent(path.split('/developers/')[0].split('/').pop())).toBe(name);
    expect(path).toContain('%23');
    expect(path).toContain('%2F');
    expect(path).toContain('%3F');
    expect(global.fetch.mock.calls.map(([url]) => url)).toContain(`/poker-planning-view-as-developer/${encoded}/developers/2`);
    const vote = Array.from(container.querySelectorAll('button[aria-pressed]')).find(button => button.textContent === '5');
    vote.click();
    await flush();
    const votePost = posts()[0];
    expect(votePost[0]).toBe(`/poker-planning-view-as-developer/${encoded}/developers/2`);
    expect(JSON.parse(votePost[1].body)).toEqual({ id: '2', selected: '5', story: 'Story A', storyId: 1 });
  });

  it('does not navigate from a submit while stories are not loaded', async () => {
    serverOk = false;
    render(JOIN_PATH);
    await flush();
    change('input[name="id"]', '2');
    const event = submitEvent();
    container.querySelector('form').dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(path).toBe(JOIN_PATH);
    expect(history.length).toBe(1);
  });
});
