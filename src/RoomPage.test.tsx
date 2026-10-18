import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { RoomView } from './RoomPage';
import { snapshot } from './test-fixtures';
import type { RoomSnapshot } from '../shared/types';

afterEach(cleanup);
function view(room = snapshot(), overrides: Partial<React.ComponentProps<typeof RoomView>> = {}) {
  const props = { room, connection: 'live' as const, busy: false, error: '', act: vi.fn().mockResolvedValue(true), retry: vi.fn(), ...overrides };
  return { ...render(<RoomView {...props} />), ...props };
}

describe('Room voting', () => {
  it('lets the facilitator vote while concealing everyone else’s vote', async () => {
    const user = userEvent.setup();
    const room = snapshot();
    room.participants[1].hasVoted = true;
    const { act } = view(room);
    await user.click(screen.getByRole('button', { name: 'Estimate 5' }));
    expect(act).toHaveBeenCalledWith({ type: 'vote', estimate: '5' });
    const team = screen.getByRole('complementary', { name: 'Team participants' });
    expect(within(team).getByLabelText('Voted')).toBeVisible();
    expect(within(team).queryByLabelText('Estimate 5')).not.toBeInTheDocument();
  });

  it('shows your authoritative selection and allows changing it', async () => {
    const user = userEvent.setup();
    const { act } = view(snapshot({ self: { id: 'host', facilitator: true, vote: '3' } }));
    expect(screen.getByRole('button', { name: 'Estimate 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Your estimate is 3. Only you can see it.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Estimate 8' }));
    expect(act).toHaveBeenCalledWith({ type: 'vote', estimate: '8' });
  });

  it('requires explicit confirmation before revealing missing votes', async () => {
    const user = userEvent.setup();
    const { act } = view();
    await user.click(screen.getByRole('button', { name: /Reveal estimates/ }));
    expect(act).not.toHaveBeenCalled();
    expect(screen.getByText(/2 people haven’t voted/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reveal now' }));
    expect(act).toHaveBeenCalledWith({ type: 'reveal' });
  });

  it('does not expose facilitator controls to a participant', () => {
    view(snapshot({ self: { id: 'guest', facilitator: false, vote: null } }));
    expect(screen.queryByRole('button', { name: /Reveal estimates/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restart this round/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estimate 5' })).toBeEnabled();
  });

  it('blocks commands during disconnect and offers reconnect', async () => {
    const user = userEvent.setup();
    const { retry } = view(snapshot(), { connection: 'reconnecting' });
    expect(screen.getByRole('button', { name: 'Estimate 5' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reveal estimates/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reconnect now' }));
    expect(retry).toHaveBeenCalled();
  });

  it('does not claim invite copy success when clipboard access fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    view();
    await user.click(screen.getByRole('button', { name: 'Invite team' }));
    expect(screen.getByText(/Clipboard access is unavailable/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Link copied' })).not.toBeInTheDocument();
  });
});

describe('Discussion and completion', () => {
  const revealed = (): RoomSnapshot => snapshot({ phase: 'revealed', participants: [
    { id: 'host', name: 'Robin', facilitator: true, online: true, hasVoted: true, estimate: '3' },
    { id: 'guest', name: 'Sam', facilitator: false, online: true, hasVoted: true, estimate: '8' },
  ], self: { id: 'host', facilitator: true, vote: '3' } });

  it('shows the distribution and records an explicit agreed score', async () => {
    const user = userEvent.setup();
    const { act } = view(revealed());
    expect(screen.getByRole('img', { name: /Revealed estimates: 3: 1 vote, 8: 1 vote/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Estimate 5' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save estimate & next story' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Agreed estimate'), '5');
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '5' });
  });

  it('requires confirmation to reset the round', async () => {
    const user = userEvent.setup();
    const { act } = view(revealed());
    await user.click(screen.getByRole('button', { name: 'Restart this round' }));
    expect(act).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reset this round' }));
    expect(act).toHaveBeenCalledWith({ type: 'reset' });
  });

  it('surfaces command failure without losing the agreed score input', () => {
    view(revealed(), { error: 'The round changed. Review and try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The round changed');
    expect(screen.getByLabelText('Agreed estimate')).toBeVisible();
  });

  it('replaces the voting controls with agreed results when complete', () => {
    view(snapshot({ phase: 'completed', currentStory: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '5' }, { id: 'second', title: 'Add saved filters', score: '3' }] }));
    expect(screen.getByRole('heading', { name: 'That’s a shared understanding.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export agreed estimates' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Choose your estimate' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });
});
