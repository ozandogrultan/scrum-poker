import { ACTIVE, VOTED, NOT_VOTED } from './storyStatus';

export const isPositiveInteger = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export const decodeSessionName = val => {
  if (!val) return '';
  try {
    return decodeURIComponent(val);
  } catch (e) {
    return val;
  }
};

export default class Api {
  constructor() {
    this.controllers = new Set();
    this.eventSources = new Set();
  }

  async request(url, options = {}, readJson = true) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const messages = {
          400: 'The server rejected this input. Check your entries and try again.',
          401: 'This session requires authorization. Contact the facilitator.',
          403: 'You do not have permission to update this session.',
          404: 'This session could not be found. Check the link with the facilitator.',
          429: 'Too many requests. Wait a moment and try again.'
        };
        throw new Error(messages[response.status] || 'The server could not complete the request. Try again.');
      }
      return readJson ? await response.json() : response;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw new Error('Could not reach the server. Check your connection and try again.');
      }
      if (error instanceof SyntaxError) {
        throw new Error('The server returned an unreadable response. Try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  subscribeEvents(url, onMessage, onError, onOpen) {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return null;
    }
    try {
      const es = new window.EventSource(url);
      this.eventSources.add(es);
      if (onOpen) {
        es.onopen = () => onOpen();
      }
      es.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (onMessage) onMessage(data);
        } catch (e) {}
      };
      if (onError) {
        es.onerror = err => onError(err);
      }
      return es;
    } catch (e) {
      return null;
    }
  }

  close() {
    this.controllers.forEach(controller => controller.abort());
    this.controllers.clear();
    this.eventSources.forEach(es => {
      try {
        es.close();
      } catch (e) {}
    });
    this.eventSources.clear();
  }
}

export const validateStories = data => {
  if (!Array.isArray(data) || data.some(row => !row || typeof row.story !== 'string' || ![ACTIVE, VOTED, NOT_VOTED].includes(row.status))) {
    throw new Error('The server returned an invalid story list. Try again.');
  }
  return data;
};
