import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import App from './App/App';

let container;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const render = path => ReactDOM.render(
  <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>, container
);

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  jest.clearAllTimers();
  jest.useRealTimers();
  delete global.fetch;
});

it('explains required setup fields and associates labels with inputs', () => {
  render('/poker-planning-add-story-list');
  expect(container.querySelector('input[name="sessionName"]').id).toBe('sessionName');
  container.querySelector('button').click();
  expect(container.textContent).toContain('Enter a session name');
});

it('loads an empty contributor session safely after a direct navigation', async () => {
  render('/poker-planning-view-as-developer/sprint/developers/1');
  await flush();
  expect(container.textContent).toContain('No stories');
  expect(container.querySelectorAll('button[aria-pressed]').length).toBe(0);
});

it('offers recovery when contributor loading fails', async () => {
  global.fetch.mockImplementation(() => Promise.reject(new Error('offline')));
  render('/poker-planning-view-as-developer/sprint/developers/1');
  await flush();
  expect(container.textContent).toContain('Try again');
});

const response = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
const storyRows = (active = 0) => ['A', 'B'].map((name, i) => ({ id: i + 1, story: 'Story ' + name, storyPoint: '', status: i === active ? 'Active' : 'Not Voted' }));
const button = label => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label);

it('renders the home action as a single link without a nested button', () => {
  render('/');
  const link = container.querySelector('a');
  expect(link.textContent).toBe('Add Story List');
  expect(container.querySelector('a button')).toBeNull();
  expect(container.querySelector('button')).toBeNull();
});

it('associates the story list help text with its textarea', () => {
  render('/poker-planning-add-story-list');
  const textarea = container.querySelector('textarea[name="storyList"]');
  expect(container.querySelector('label[for="storyList"]').textContent).toBe('Story list');
  const help = document.getElementById(textarea.getAttribute('aria-describedby').split(' ')[0]);
  expect(help.textContent).toContain('Paste your story list');
});

it('does not allow entering a session until stories are loaded', async () => {
  render('/poker-planning-view-as-developer/sprint');
  await flush();
  expect(button('View Planning').disabled).toBe(true);
  global.fetch.mockImplementation(() => response(storyRows()));
  button('Refresh stories').click();
  await flush();
  expect(button('View Planning').disabled).toBe(false);
});

it('shows a recoverable error when the join fetch is rejected by the server', async () => {
  global.fetch.mockImplementation(() => response({}, false));
  render('/poker-planning-view-as-developer/sprint');
  await flush();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(button('View Planning').disabled).toBe(true);
});

it('marks the chosen estimate pressed only after the vote is confirmed', async () => {
  global.fetch.mockImplementation((url, options) => (options && options.method === 'POST' ? response({}, false) : response(storyRows())));
  render('/poker-planning-view-as-developer/sprint/developers/1');
  await flush();
  button('5').click();
  await flush();
  expect(button('5').getAttribute('aria-pressed')).toBe('false');
  expect(container.textContent).not.toContain('5 Voted');
  expect(container.querySelector('[role="alert"]').textContent).toContain('not confirmed');
  global.fetch.mockImplementation(() => response(storyRows()));
  button('5').click();
  await flush();
  expect(button('5').getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('5 Voted');
});

it('clears the selected estimate when the active story changes', async () => {
  let rows = storyRows(0);
  global.fetch.mockImplementation(() => response(rows));
  render('/poker-planning-view-as-developer/sprint/developers/1');
  await flush();
  button('5').click();
  await flush();
  expect(button('5').getAttribute('aria-pressed')).toBe('true');
  rows = storyRows(1);
  jest.advanceTimersByTime(2000);
  await flush();
  expect(button('5').getAttribute('aria-pressed')).toBe('false');
  expect(container.textContent).toContain('Please Vote!');
});

it('rejects an invalid voter id in the route', async () => {
  global.fetch.mockImplementation(() => response(storyRows()));
  render('/poker-planning-view-as-developer/sprint/developers/0');
  await flush();
  expect(container.textContent).toContain('Enter a valid voter ID');
  expect(container.querySelectorAll('button[aria-pressed]').length).toBe(0);
});

it('does not start a second poll while a story request is in flight', async () => {
  global.fetch.mockImplementation(() => new Promise(() => {}));
  render('/poker-planning-view-as-developer/sprint/developers/1');
  jest.advanceTimersByTime(10000);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('stops polling after unmount', async () => {
  global.fetch.mockImplementation(() => response(storyRows()));
  render('/poker-planning-view-as-developer/sprint/developers/1');
  await flush();
  ReactDOM.unmountComponentAtNode(container);
  const calls = global.fetch.mock.calls.length;
  jest.advanceTimersByTime(6000);
  await flush();
  expect(global.fetch.mock.calls.length).toBe(calls);
});

it('validates the voter id before entering a session', async () => {
  global.fetch.mockImplementation(() => response(storyRows()));
  render('/poker-planning-view-as-developer/sprint');
  await flush();
  const input = container.querySelector('input[name="id"]');
  input.value = '0';
  Simulate.change(input);
  button('View Planning').click();
  expect(container.textContent).toContain('positive whole-number');
});
