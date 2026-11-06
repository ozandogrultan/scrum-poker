import { afterEach, describe, expect, it, vi } from 'vitest';
import { act as reactAct } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { RoomView } from './RoomPage';
import { snapshot } from './test-fixtures';
import type { RoomSnapshot } from '../shared/types';

afterEach(cleanup);
const act_advance = (ms: number) => reactAct(async () => { await vi.advanceTimersByTimeAsync(ms); });
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
    await user.click(screen.getByRole('radio', { name: 'Estimate 5' }));
    expect(act).toHaveBeenCalledWith({ type: 'vote', estimate: '5' });
    const team = screen.getByRole('complementary', { name: 'Team participants' });
    expect(within(team).getByText('Voted')).toBeInTheDocument();
    expect(within(team).queryByText('Estimate')).not.toBeInTheDocument();
    expect(within(team).queryByText('Participant')).not.toBeInTheDocument();
  });

  it('shows your authoritative selection and allows changing it', async () => {
    const user = userEvent.setup();
    const { act } = view(snapshot({ self: { id: 'host', facilitator: true, vote: '3' } }));
    expect(screen.getByRole('radio', { name: 'Estimate 3' })).toBeChecked();
    expect(screen.getByText('Your estimate is 3. Only you can see it.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Estimate 8' }));
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
    expect(screen.getByRole('radio', { name: 'Estimate 5' })).toBeEnabled();
  });

  it('blocks commands during disconnect and offers reconnect', async () => {
    const user = userEvent.setup();
    const { retry } = view(snapshot(), { connection: 'reconnecting' });
    expect(screen.getByRole('radio', { name: 'Estimate 5' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reveal estimates/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reconnect now' }));
    expect(retry).toHaveBeenCalled();
  });

  it('does not claim invite copy success when clipboard access fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    view();
    await user.click(screen.getByRole('button', { name: 'Invite team' }));
    expect(screen.getAllByText(/Clipboard access is unavailable/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Link copied' })).not.toBeInTheDocument();
  });
});

describe('Estimate deck keyboard', () => {
  it('is a radiogroup with one tab stop and a legend', () => {
    view();
    const group = screen.getByRole('radiogroup', { name: 'Choose your estimate' });
    const cards = within(group).getAllByRole('radio');
    expect(cards).toHaveLength(10);
    expect(cards.filter(card => card.tabIndex === 0)).toHaveLength(1);
    expect(group).toHaveAccessibleDescription(/unsure or needs discussion/);
  });

  it('moves focus with arrows, Home and End without voting, and picks with Space', async () => {
    const user = userEvent.setup();
    const { act } = view();
    screen.getByRole('radio', { name: 'Estimate 0' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Estimate 1' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Estimate 1' }).tabIndex).toBe(0);
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Estimate unsure' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Estimate 0' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{Home}');
    expect(act).not.toHaveBeenCalled();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight} ');
    expect(act).toHaveBeenCalledWith({ type: 'vote', estimate: '3' });
  });

  it('picks a card with its number or ? key', async () => {
    const user = userEvent.setup();
    const { act } = view();
    screen.getByRole('radio', { name: 'Estimate 0' }).focus();
    await user.keyboard('8');
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '8' });
    await user.keyboard('?');
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '?' });
  });

  it('keeps one polite live region for announcements', () => {
    view();
    expect(screen.getAllByRole('status')).toHaveLength(2);
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
    const choices = screen.getByRole('group', { name: 'Agreed estimate' });
    expect(within(choices).getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual(['3', '8']);
    expect(screen.queryByRole('radio', { name: '5' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Other' }));
    expect(screen.getByRole('button', { name: 'Other' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('group', { name: 'Other values' })).getAllByRole('radio')).toHaveLength(7);
    await user.click(screen.getByRole('radio', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '5' });
  });

  it('records a voted value in one tap of the choice', async () => {
    const user = userEvent.setup();
    const { act } = view(revealed());
    await user.click(screen.getByRole('radio', { name: '8' }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '8' });
  });

  it('notes a wide spread of votes as guidance without blocking', () => {
    view(revealed());
    expect(screen.getByText('Votes run from 3 to 8. Talk through the gap before you settle.')).toBeVisible();
    const close = revealed();
    close.participants[1].estimate = '5';
    cleanup(); view(close);
    expect(screen.queryByText(/Talk through the gap/)).not.toBeInTheDocument();
  });

  it('ignores ? when judging spread and shows all values when no number was voted', () => {
    const room = revealed();
    room.participants[0].estimate = '?'; room.participants[1].estimate = '?';
    view(room);
    expect(screen.queryByText(/Talk through the gap/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Other values' })).getAllByRole('radio')).toHaveLength(9);
  });

  it('confirms a saved score with undo, then restores the story', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(revealed());
    await user.click(screen.getByRole('radio', { name: '8' }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '8' });
    rerender(<RoomView {...props} act={act} room={snapshot({ currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }, { id: 'second', title: 'Add saved filters', score: null }] })} />);
    const status = screen.getByText('Saved 8 for Improve search relevance');
    expect(status).toHaveAttribute('role', 'status');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(act).toHaveBeenLastCalledWith({ type: 'undoFinalize' });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('drops the undo offer once the next round has a vote', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(revealed());
    await user.click(screen.getByRole('radio', { name: '8' }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    const next = snapshot({ currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }, { id: 'second', title: 'Add saved filters', score: null }] });
    rerender(<RoomView {...props} act={act} room={next} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    next.participants[1].hasVoted = true;
    rerender(<RoomView {...props} act={act} room={{ ...next, revision: 3 }} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('expires the undo offer after about ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { act, rerender, ...props } = view(revealed());
      await user.click(screen.getByRole('radio', { name: '8' }));
      await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
      rerender(<RoomView {...props} act={act} room={snapshot({ currentStory: 1, revision: 2 })} />);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      await act_advance(10100);
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('never offers undo to a participant', () => {
    view(snapshot({ phase: 'revealed', self: { id: 'guest', facilitator: false, vote: null } }));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('group', { name: 'Agreed estimate' })).toBeVisible();
  });

  it('replaces the voting controls with agreed results when complete', () => {
    view(snapshot({ phase: 'completed', currentStory: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '5' }, { id: 'second', title: 'Add saved filters', score: '3' }] }));
    expect(screen.getByRole('heading', { name: 'That’s a shared understanding.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export agreed estimates' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Choose your estimate' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getAllByText('Add saved filters')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: /./ })).not.toBeInTheDocument();
  });
});
