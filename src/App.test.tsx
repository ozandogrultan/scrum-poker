import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Home, Join } from './App';
import { ApiError, createRoom, friendlyError, joinRoom } from './api';
import { admission } from './test-fixtures';

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), createRoom: vi.fn(), joinRoom: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('Create session', () => {
  it('collects a facilitator, title and trimmed newline stories', async () => {
    const user = userEvent.setup();
    const onAdmission = vi.fn();
    vi.mocked(createRoom).mockResolvedValue(admission());
    render(<Home onAdmission={onAdmission} />);
    await user.type(screen.getByLabelText('Your name'), ' Robin ');
    await user.type(screen.getByLabelText('Session name'), ' Platform planning ');
    await user.type(screen.getByLabelText('Stories to estimate'), ' Improve search relevance \n\n Add saved filters ');
    expect(screen.getByText('2 / 100')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(createRoom).toHaveBeenCalledWith({ name: 'Robin', title: 'Platform planning', stories: ['Improve search relevance', 'Add saved filters'] });
    expect(onAdmission).toHaveBeenCalledWith(admission());
  });

  it('retains form content and shows a recoverable network error', async () => {
    const user = userEvent.setup();
    vi.mocked(createRoom).mockRejectedValue(new TypeError('offline'));
    render(<Home onAdmission={vi.fn()} />);
    await user.type(screen.getByLabelText('Your name'), 'Robin');
    await user.type(screen.getByLabelText('Session name'), 'Planning');
    await user.type(screen.getByLabelText('Stories to estimate'), 'Search');
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection');
    expect(screen.getByLabelText('Stories to estimate')).toHaveValue('Search');
    expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
  });

  it('rejects whitespace-only story content without a request', async () => {
    const user = userEvent.setup();
    render(<Home onAdmission={vi.fn()} />);
    await user.type(screen.getByLabelText('Your name'), 'Robin');
    await user.type(screen.getByLabelText('Session name'), 'Planning');
    await user.type(screen.getByLabelText('Stories to estimate'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least one story');
    expect(createRoom).not.toHaveBeenCalled();
  });
});

describe('Join session', () => {
  it('replaces completed admission with worksheet guidance and no futile join retry', async () => {
    vi.mocked(joinRoom).mockRejectedValue(new ApiError(409, 'unsafe upstream message', 'session_completed'));
    const user = userEvent.setup();
    render(<Join id={'a'.repeat(32)} onAdmission={vi.fn()} />);
    await user.type(screen.getByLabelText('Your name'), 'Late visitor');
    await user.click(screen.getByRole('button', { name: 'Join session' }));
    expect(screen.getByRole('heading', { name: 'This session is complete.' })).toBeVisible();
    expect(screen.getByText(/Ask the facilitator for the exported worksheet/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Join session' })).not.toBeInTheDocument();
    expect(screen.queryByText(/unsafe upstream/)).not.toBeInTheDocument();
  });

  it('distinguishes safe admission errors from stale command conflicts', () => {
    expect(friendlyError(new ApiError(409, 'unsafe', 'room_full'))).toBe('This room has reached its 50-person limit. Ask the facilitator for the exported worksheet.');
    expect(friendlyError(new ApiError(409, 'unsafe', 'unknown'))).toMatch(/round changed/);
    expect(friendlyError(new ApiError(409, 'unsafe'))).toMatch(/round changed/);
  });
  it('joins the requested room with a named identity', async () => {
    const user = userEvent.setup();
    const onAdmission = vi.fn();
    vi.mocked(joinRoom).mockResolvedValue(admission());
    render(<Join id={'a'.repeat(32)} onAdmission={onAdmission} />);
    await user.type(screen.getByLabelText('Your name'), ' Sam ');
    await user.click(screen.getByRole('button', { name: 'Join session' }));
    expect(joinRoom).toHaveBeenCalledWith('a'.repeat(32), 'Sam');
    expect(onAdmission).toHaveBeenCalled();
  });
});
