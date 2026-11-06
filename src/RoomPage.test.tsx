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
    expect(screen.getByText('Your estimate is 3')).toBeVisible();
    expect(screen.getByText(/Only you can see it/)).toBeVisible();
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

  it('buffers digits so 13 and 21 resolve to one vote each', async () => {
    const user = userEvent.setup();
    const { act } = view();
    screen.getByRole('radio', { name: 'Estimate 0' }).focus();
    await user.keyboard('13');
    expect(act).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '13' });
    await user.keyboard('21');
    expect(act).toHaveBeenCalledTimes(2);
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '21' });
    await user.keyboard('3');
    expect(act).toHaveBeenCalledTimes(3);
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '3' });
  });

  it('waits briefly after 1 or 2 and then votes the single digit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { act } = view();
      screen.getByRole('radio', { name: 'Estimate 0' }).focus();
      await user.keyboard('1');
      expect(act).not.toHaveBeenCalled();
      await act_advance(700);
      expect(act).toHaveBeenCalledTimes(1);
      expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '1' });
    } finally { vi.useRealTimers(); }
  });

  it('picks ½ with h or / and sends one command', async () => {
    const user = userEvent.setup();
    const { act } = view();
    screen.getByRole('radio', { name: 'Estimate 0' }).focus();
    await user.keyboard('h');
    expect(act).toHaveBeenCalledTimes(1);
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '½' });
    await user.keyboard('/');
    expect(act).toHaveBeenCalledTimes(2);
    expect(act).toHaveBeenLastCalledWith({ type: 'vote', estimate: '½' });
  });

  it('keeps one polite live region for announcements', () => {
    view();
    expect(screen.getAllByRole('status')).toHaveLength(1);
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
    expect(within(choices).getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual(['0', '½', '1', '2', '3', '5', '8', '13', '21']);
    expect(screen.queryByRole('button', { name: 'Other' })).not.toBeInTheDocument();
    expect(within(choices).getByRole('radio', { name: '3, 1 vote' })).toBeInTheDocument();
    expect(within(choices).getByRole('radio', { name: '8, 1 vote' })).toBeInTheDocument();
    expect(within(choices).getByRole('radio', { name: '5' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^5\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '5' });
  });

  it('records a voted value in one tap of the choice', async () => {
    const user = userEvent.setup();
    const { act } = view(revealed());
    await user.click(screen.getByRole('radio', { name: /^8\b/ }));
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
    expect(within(screen.getByRole('group', { name: 'Agreed estimate' })).getAllByRole('radio')).toHaveLength(9);
  });

  it('confirms a saved score with undo, then restores the story', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(revealed());
    await user.click(screen.getByRole('radio', { name: /^8\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    expect(act).toHaveBeenCalledWith({ type: 'finalize', score: '8' });
    rerender(<RoomView {...props} act={act} room={snapshot({ currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }, { id: 'second', title: 'Add saved filters', score: null }] })} />);
    expect(screen.getByText('Saved 8 for Improve search relevance')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Saved 8 for Improve search relevance.');
    await user.click(screen.getByRole('button', { name: 'Undo saving 8 for Improve search relevance' }));
    expect(act).toHaveBeenLastCalledWith({ type: 'undoFinalize' });
    expect(screen.queryByRole('button', { name: /^Undo saving/ })).not.toBeInTheDocument();
  });

  it('drops the undo offer once the next round has a vote', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(revealed());
    await user.click(screen.getByRole('radio', { name: /^8\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    const next = snapshot({ currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }, { id: 'second', title: 'Add saved filters', score: null }] });
    rerender(<RoomView {...props} act={act} room={next} />);
    expect(screen.getByRole('button', { name: /^Undo saving/ })).toBeVisible();
    next.participants[1].hasVoted = true;
    rerender(<RoomView {...props} act={act} room={{ ...next, revision: 3 }} />);
    expect(screen.queryByRole('button', { name: /^Undo saving/ })).not.toBeInTheDocument();
  });

  it('expires the undo offer after about ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { act, rerender, ...props } = view(revealed());
      await user.click(screen.getByRole('radio', { name: /^8\b/ }));
      await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
      rerender(<RoomView {...props} act={act} room={snapshot({ currentStory: 1, revision: 2 })} />);
      expect(screen.getByRole('button', { name: /^Undo saving/ })).toBeVisible();
      await act_advance(10100);
      expect(screen.queryByRole('button', { name: /^Undo saving/ })).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  const afterSave = (extra: Partial<RoomSnapshot> = {}) => snapshot({ currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }, { id: 'second', title: 'Add saved filters', score: null }], ...extra });

  it('keeps Undo last save available after the banner is gone, until the next round has a vote', () => {
    const { rerender, ...props } = view(afterSave());
    expect(screen.getByRole('button', { name: 'Undo last save' })).toBeVisible();
    const bar = document.querySelector('.action-bar')!;
    expect(bar.parentElement?.lastElementChild).toBe(bar);
    expect(within(bar as HTMLElement).getByRole('button', { name: 'Undo last save' })).toBeVisible();
    expect(within(bar as HTMLElement).getByRole('button', { name: 'Restart this round' })).toBeVisible();
    const voted = afterSave({ revision: 3 });
    voted.participants[1].hasVoted = true;
    rerender(<RoomView {...props} room={voted} />);
    expect(screen.queryByRole('button', { name: 'Undo last save' })).not.toBeInTheDocument();
  });

  it('undoes from the persistent control and preselects the previous score', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(afterSave());
    await user.click(screen.getByRole('button', { name: 'Undo last save' }));
    expect(act).toHaveBeenLastCalledWith({ type: 'undoFinalize' });
    const reopened = snapshot({ phase: 'revealed', roundId: 'round-two', revision: 3 });
    rerender(<RoomView {...props} act={act} room={reopened} />);
    expect(screen.getByRole('radio', { name: '8' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save estimate & next story' })).toBeEnabled();
  });

  it('preselects the previous score after undoing from the banner', async () => {
    const user = userEvent.setup();
    const { act, rerender, ...props } = view(revealed());
    await user.click(screen.getByRole('radio', { name: /^8\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & next story' }));
    rerender(<RoomView {...props} act={act} room={afterSave()} />);
    await user.click(screen.getByRole('button', { name: /^Undo saving/ }));
    rerender(<RoomView {...props} act={act} room={revealed()} />);
    expect(screen.getByRole('radio', { name: /^8\b/ })).toBeChecked();
  });

  it('does not offer Undo last save to participants or on a fresh room', () => {
    view(afterSave({ self: { id: 'guest', facilitator: false, vote: null } }));
    expect(screen.queryByRole('button', { name: 'Undo last save' })).not.toBeInTheDocument();
    cleanup(); view();
    expect(screen.queryByRole('button', { name: 'Undo last save' })).not.toBeInTheDocument();
  });

  it('keeps Restart next to Save once revealed', () => {
    view(revealed());
    const bar = document.querySelector('.action-bar') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Restart this round' })).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Save estimate & next story' })).toBeVisible();
  });

  it('never offers undo to a participant', () => {
    view(snapshot({ phase: 'revealed', self: { id: 'guest', facilitator: false, vote: null } }));
    expect(screen.queryByRole('button', { name: /^Undo saving/ })).not.toBeInTheDocument();
  });

  it('requires confirmation to reset the round and cancels on Escape', async () => {
    const user = userEvent.setup();
    const { act } = view(revealed());
    await user.click(screen.getByRole('button', { name: 'Restart this round' }));
    expect(screen.getByRole('button', { name: 'Reset this round' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Reset this round' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart this round' })).toHaveFocus();
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

  it.each(['offscreen', 'visible', 'unrelated focus'] as const)('restores reset orientation only when needed: %s', async state => {
    const user = userEvent.setup();
    const act = vi.fn().mockImplementation(async () => {
      if (state === 'unrelated focus') screen.getByRole('button', { name: 'Invite team' }).focus();
      return true;
    });
    view(revealed(), { act });
    const title = screen.getByRole('heading', { name: 'Improve search relevance' });
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({ top: state === 'visible' ? 40 : -238, bottom: state === 'visible' ? 80 : -198 } as DOMRect);
    const workspace = screen.getByRole('region', { name: 'Estimation workspace' });
    const scroll = vi.fn();
    workspace.scrollIntoView = scroll;
    await user.click(screen.getByRole('button', { name: 'Restart this round' }));
    await user.click(screen.getByRole('button', { name: 'Reset this round' }));
    expect(scroll).toHaveBeenCalledTimes(state === 'offscreen' ? 1 : 0);
    if (state === 'unrelated focus') expect(screen.getByRole('button', { name: 'Invite team' })).toHaveFocus();
    else expect(title).toHaveFocus();
  });

  it('tells participants when the facilitator restarted the round, until they vote', () => {
    const guest = { id: 'guest', facilitator: false, vote: null as null | '5' };
    const { rerender, ...props } = view(snapshot({ phase: 'revealed', self: guest }));
    expect(screen.queryByText(/restarted this round/)).not.toBeInTheDocument();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', revision: 2, self: guest })} />);
    expect(screen.getAllByText('The facilitator restarted this round. Vote again.')).toHaveLength(2);
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', revision: 3, self: { ...guest, vote: '5' } })} />);
    expect(screen.queryByText(/restarted this round/)).not.toBeInTheDocument();
  });

  it('does not call a finalize or advance a restart', () => {
    const guest = { id: 'guest', facilitator: false, vote: null };
    const { rerender, ...props } = view(snapshot({ phase: 'revealed', self: guest }));
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', currentStory: 1, revision: 2, self: guest })} />);
    expect(screen.queryByText(/restarted this round/)).not.toBeInTheDocument();
  });

  it('moves focus to the revealed heading when Reveal confirms', async () => {
    const user = userEvent.setup();
    const everyone = snapshot({ participants: [
      { id: 'host', name: 'Robin', facilitator: true, online: true, hasVoted: true },
      { id: 'guest', name: 'Sam', facilitator: false, online: true, hasVoted: true },
    ] });
    const { rerender, ...props } = view(everyone);
    await user.click(screen.getByRole('button', { name: /Reveal estimates/ }));
    rerender(<RoomView {...props} room={snapshot({ phase: 'revealed', revision: 2, participants: everyone.participants.map(person => ({ ...person, estimate: '3' as const })) })} />);
    expect(screen.getByRole('heading', { name: 'The cards are on the table.' })).toHaveFocus();
  });

  it('moves a participant’s focus to the reveal heading from the deck, but not from elsewhere', () => {
    const guest = { id: 'guest', facilitator: false, vote: '5' as const };
    const { rerender, ...props } = view(snapshot({ self: guest }));
    screen.getByRole('radio', { name: 'Estimate 5' }).focus();
    const open = snapshot({ phase: 'revealed', revision: 2, self: guest });
    rerender(<RoomView {...props} room={open} />);
    expect(screen.getByRole('heading', { name: 'The cards are on the table.' })).toHaveFocus();
    cleanup();
    const second = view(snapshot({ self: guest }));
    screen.getByRole('button', { name: 'Invite team' }).focus();
    second.rerender(<RoomView {...second} room={open} />);
    expect(screen.getByRole('button', { name: 'Invite team' })).toHaveFocus();
  });

  it('shows the saved banner and Undo at the top of the completed card', async () => {
    const user = userEvent.setup();
    const one = { stories: [{ id: 'first', title: 'Improve search relevance', score: null }] };
    const { act, rerender, ...props } = view(snapshot({ phase: 'revealed', ...one, participants: [{ id: 'host', name: 'Robin', facilitator: true, online: true, hasVoted: true, estimate: '8' }], self: { id: 'host', facilitator: true, vote: '8' } }));
    await user.click(screen.getByRole('radio', { name: /^8\b/ }));
    await user.click(screen.getByRole('button', { name: 'Save estimate & finish' }));
    rerender(<RoomView {...props} act={act} room={snapshot({ phase: 'completed', currentStory: 1, revision: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '8' }] })} />);
    const summary = screen.getByRole('heading', { name: 'That’s a shared understanding.' });
    const banner = screen.getByText('Saved 8 for Improve search relevance');
    expect(banner).toBeVisible();
    expect(banner.closest('.round-paper')).not.toBeNull();
    expect(banner.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Undo saving 8 for Improve search relevance$/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Undo saving/ }));
    expect(act).toHaveBeenLastCalledWith({ type: 'undoFinalize' });
    expect(document.querySelector('.saved-note')).toBeNull();
  });

  it('focuses the story heading on mount and after a reset or story change from the body', () => {
    const guest = { id: 'guest', facilitator: false, vote: null };
    const { rerender, ...props } = view(snapshot({ self: guest }));
    expect(screen.getByRole('heading', { name: 'Improve search relevance' })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', revision: 2, self: guest })} />);
    expect(screen.getByRole('heading', { name: 'Improve search relevance' })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-three', currentStory: 1, revision: 3, self: guest })} />);
    expect(screen.getByRole('heading', { name: 'Add saved filters' })).toHaveFocus();
  });

  it('leaves focus on controls outside the workspace and on the deck card during a story change', () => {
    const guest = { id: 'guest', facilitator: false, vote: null };
    const { rerender, ...props } = view(snapshot({ self: guest }));
    screen.getByRole('button', { name: 'Invite team' }).focus();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', currentStory: 1, revision: 2, self: guest })} />);
    expect(screen.getByRole('button', { name: 'Invite team' })).toHaveFocus();
    screen.getByRole('radio', { name: 'Estimate 5' }).focus();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-three', currentStory: 0, revision: 3, self: guest })} />);
    expect(screen.getByRole('radio', { name: 'Estimate 5' })).toHaveFocus();
  });

  it('moves a participant’s deck focus to the first card when the round is reset', () => {
    const guest = { id: 'guest', facilitator: false, vote: '5' as const };
    const { rerender, ...props } = view(snapshot({ self: guest }));
    screen.getByRole('radio', { name: 'Estimate 5' }).focus();
    rerender(<RoomView {...props} room={snapshot({ roundId: 'round-two', revision: 2, self: { ...guest, vote: null } })} />);
    const first = screen.getByRole('radio', { name: 'Estimate 0' });
    expect(first).toHaveFocus();
    expect(first.tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'Estimate 5' })).not.toBeChecked();
  });

  it('moves focus into inline confirms and back on cancel', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: /Reveal estimates/ }));
    expect(screen.getByRole('button', { name: 'Reveal now' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Keep voting' }));
    expect(screen.getByRole('button', { name: /Reveal estimates/ })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Restart this round' }));
    expect(screen.getByRole('button', { name: 'Reset this round' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Restart this round' })).toHaveFocus();
  });

  it('clamps a long story title behind a toggle only when it overflows', async () => {
    const user = userEvent.setup();
    view();
    expect(screen.queryByRole('button', { name: 'Show full story' })).not.toBeInTheDocument();
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 });
    try {
      view();
      const title = screen.getByRole('heading', { name: 'Improve search relevance' });
      const toggle = screen.getByRole('button', { name: 'Show full story' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls', title.id);
      expect(title).toHaveClass('clamped');
      await user.click(toggle);
      expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
      expect(title).not.toHaveClass('clamped');
    } finally { delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight; }
  });

  it('puts the facilitator’s primary action in a bar and trims redundant notes', () => {
    view();
    const reveal = screen.getByRole('button', { name: /Reveal estimates/ });
    expect(reveal.closest('.action-bar')).not.toBeNull();
    expect(screen.queryByText(/Give everyone a moment/)).not.toBeInTheDocument();
    expect(screen.getByText('Private until the reveal. Pick your card.')).toBeVisible();
    cleanup();
    view(snapshot({ phase: 'revealed', self: { id: 'host', facilitator: true, vote: null } }));
    expect(screen.getByRole('button', { name: 'Save estimate & next story' }).closest('.action-bar')).not.toBeNull();
    cleanup();
    view(snapshot({ self: { id: 'guest', facilitator: false, vote: null } }));
    expect(document.querySelector('.action-bar')).toBeNull();
  });

  it('presents keyboard shortcuts as key caps', () => {
    view();
    const legend = document.getElementById('deck-legend')!;
    expect([...legend.querySelectorAll('kbd')].map(key => key.textContent)).toEqual(['←', '→', 'Space', '1', '21', 'H']);
    expect(legend).toHaveTextContent('half a point');
  });

  it('explains the disabled save button until a score is chosen', async () => {
    const user = userEvent.setup();
    view(snapshot({ phase: 'revealed', self: { id: 'host', facilitator: true, vote: null } }));
    const save = screen.getByRole('button', { name: 'Save estimate & next story' });
    expect(save).toHaveAccessibleDescription('Choose an agreed estimate first');
    await user.click(screen.getByRole('radio', { name: /^5\b/ }));
    expect(save).not.toHaveAccessibleDescription('Choose an agreed estimate first');
    expect(screen.queryByText('Choose an agreed estimate first')).not.toBeInTheDocument();
  });

  it('keeps Invite primary only while alone and hides it when complete', () => {
    const done = { phase: 'completed' as const, currentStory: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '5' as const }, { id: 'second', title: 'Add saved filters', score: '3' as const }] };
    view(snapshot(done));
    expect(screen.getByText('Complete')).toBeVisible();
    expect(screen.queryByText('Live session')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite team' })).not.toBeInTheDocument();
    cleanup(); view();
    expect(screen.getByRole('button', { name: 'Invite team' })).not.toHaveClass('primary');
    cleanup(); view(snapshot({ participants: [{ id: 'host', name: 'Robin', facilitator: true, online: true, hasVoted: false }] }));
    expect(screen.getByRole('button', { name: 'Invite team' })).toHaveClass('primary');
  });

  it('replaces the voting controls with agreed results when complete', () => {
    view(snapshot({ phase: 'completed', currentStory: 2, stories: [{ id: 'first', title: 'Improve search relevance', score: '5' }, { id: 'second', title: 'Add saved filters', score: '3' }] }));
    expect(screen.getByRole('heading', { name: 'That’s a shared understanding.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export agreed estimates' })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Choose your estimate' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getAllByText('Add saved filters')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: /./ })).not.toBeInTheDocument();
    const team = screen.getByRole('complementary', { name: 'Team participants' });
    expect(within(team).getByText('Robin (you)')).toBeVisible();
    expect(team.querySelector('.person-status')).toBeNull();
  });
});
