import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Check, CheckCheck, Circle, Copy, Download, Eye, LoaderCircle, LockKeyhole, RotateCcw, UsersRound } from 'lucide-react';
import { DECK, SCORES, type Estimate, type Identity, type PublicParticipant, type RoomSnapshot, type Score } from '../shared/types';
import { downloadCsv } from './export';
import { useRoom, type Connection, type RoomAction } from './useRoom';

type RoomViewProps = { room: RoomSnapshot; connection: Connection; busy: boolean; error: string; act: (action: RoomAction) => Promise<boolean>; retry: () => void };

export function RoomPage({ id, identity, onRejoin }: { id: string; identity: Identity; onRejoin: () => void }) {
  const state = useRoom(id, identity);
  if (state.fatal) return <main className="page-centered"><section className="paper join-paper"><h1>{state.fatal === 404 || state.fatal === 410 ? 'This room is no longer here.' : 'Let’s check your access.'}</h1><div role="alert" className="error">{state.error}</div><div className="actions-row">{state.fatal === 401 || state.fatal === 403 ? <button className="button primary" onClick={onRejoin}>Rejoin with your name</button> : <a className="button primary" href="/">Start a new session<ArrowRight size={16} /></a>}<button className="button subtle" onClick={state.retry}>Try again</button></div></section></main>;
  if (!state.room) return <main className="page-centered"><div><div className="loading-state" role="status"><LoaderCircle className="spin" size={21} />{state.connection === 'reconnecting' ? 'Waiting for a connection to your room…' : 'Opening your room…'}</div>{state.connection === 'reconnecting' && <><p className="muted">Check your connection. We’ll keep trying.</p><button className="button" onClick={state.retry}>Retry connection</button></>}</div></main>;
  return <RoomView {...state} room={state.room} />;
}


const truncate = (text: string, max = 48) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

function spreadNote(participants: PublicParticipant[]) {
  const ranks = participants.flatMap(person => person.estimate && person.estimate !== '?' ? [DECK.indexOf(person.estimate)] : []);
  if (ranks.length < 2) return '';
  const low = DECK[Math.min(...ranks)]; const high = DECK[Math.max(...ranks)];
  return Math.max(...ranks) - Math.min(...ranks) >= 2 ? `Votes run from ${low} to ${high}. Talk through the gap before you settle.` : '';
}

const DIGIT_WAIT = 600;

function Deck({ vote, offline, busy, onVote }: { vote: Estimate | null; offline: boolean; busy: boolean; onVote: (value: Estimate) => void }) {
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const buffer = useRef({ keys: '', timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const latest = useRef({ offline, busy, onVote });
  latest.current = { offline, busy, onVote };
  const [tabStop, setTabStop] = useState(() => Math.max(0, vote ? DECK.indexOf(vote) : 0));
  useEffect(() => { if (vote) setTabStop(DECK.indexOf(vote)); }, [vote]);
  useEffect(() => () => clearTimeout(buffer.current.timer), []);
  function focusCard(index: number) { setTabStop(index); cards.current[index]?.focus(); }
  function clearBuffer() { clearTimeout(buffer.current.timer); buffer.current = { keys: '', timer: undefined }; }
  function pick(value: Estimate) {
    const index = DECK.indexOf(value);
    if (latest.current.offline) return;
    focusCard(index);
    if (!latest.current.busy) latest.current.onVote(value);
  }
  function flush() { const keys = buffer.current.keys; clearBuffer(); if (keys) pick(keys as Estimate); }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const index = cards.current.findIndex(card => card === document.activeElement);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step && index >= 0) { event.preventDefault(); clearBuffer(); focusCard((index + step + DECK.length) % DECK.length); return; }
    if (event.key === 'Home') { event.preventDefault(); clearBuffer(); focusCard(0); return; }
    if (event.key === 'End') { event.preventDefault(); clearBuffer(); focusCard(DECK.length - 1); return; }
    const key = event.key === 'h' || event.key === 'H' || event.key === '/' ? '½' : event.key;
    if (!DECK.some(value => value === key) && !/^\d$/.test(key)) return;
    event.preventDefault();
    if (event.repeat) return;
    const pending = buffer.current.keys;
    if (pending && DECK.some(value => value === pending + key)) { clearBuffer(); pick((pending + key) as Estimate); return; }
    flush();
    if (key === '1' || key === '2') {
      buffer.current.keys = key;
      buffer.current.timer = setTimeout(flush, DIGIT_WAIT);
      return;
    }
    if (DECK.some(value => value === key)) pick(key as Estimate);
  }
  return <div className="estimate-grid" role="radiogroup" aria-label="Choose your estimate" aria-describedby="deck-legend" onKeyDown={onKeyDown}>{DECK.map((value, index) => <button className="estimate-card" key={value} ref={node => { cards.current[index] = node; }} type="button" role="radio" aria-label={value === '?' ? 'Estimate unsure' : `Estimate ${value}`} aria-checked={vote === value} aria-disabled={busy || undefined} tabIndex={index === tabStop ? 0 : -1} disabled={offline} onFocus={() => setTabStop(index)} onClick={() => { if (!busy) onVote(value); }}><span className="estimate-value">{value}</span>{vote === value ? <Check size={12} aria-hidden="true" /> : <span aria-hidden="true" style={{ height: 12 }} />}</button>)}</div>;
}

function FinalizeForm({ participants, busy, locked, last, onSave }: { participants: PublicParticipant[]; busy: boolean; locked: boolean; last: boolean; onSave: (score: Score) => void }) {
  const voted = SCORES.filter(value => participants.some(person => person.estimate === value));
  const rest = SCORES.filter(value => !voted.includes(value));
  const [score, setScore] = useState<Score | ''>('');
  const [other, setOther] = useState(voted.length === 0);
  const choice = (value: Score) => <label className="score-choice" key={value}><input type="radio" name="final-score" value={value} checked={score === value} disabled={locked} onChange={() => setScore(value)} /><span>{value}</span></label>;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (score) onSave(score); }
  return <form className="finalize-form" onSubmit={submit}>
    <fieldset className="field score-field"><legend>Agreed estimate</legend>
      <div className="score-choices">{voted.map(choice)}{rest.length > 0 && voted.length > 0 && <button className="score-other" type="button" aria-expanded={other} aria-controls="other-scores" onClick={() => setOther(!other)}>Other</button>}</div>
      {other && rest.length > 0 && <div className="score-choices" id="other-scores" role="group" aria-label="Other values">{rest.map(choice)}</div>}
      <small>Choose a score after discussion. This records the estimate for everyone.</small></fieldset>
    <div className="action-bar"><button className="button primary" disabled={locked || !score} aria-describedby={score ? undefined : 'score-hint'}>{busy ? 'Saving…' : last ? 'Save estimate & finish' : 'Save estimate & next story'}<ArrowRight size={15} /></button>
    {!score && <p className="score-hint" id="score-hint">Choose an agreed estimate first</p>}</div>
  </form>;
}

function SavedBanner({ saved, disabled, onUndo, inCard }: { saved: { score: Score; title: string }; disabled: boolean; onUndo: () => void; inCard?: boolean }) {
  return <div className={`saved-note ${inCard ? 'in-card' : ''}`}><span className="saved-text" title={saved.title}>Saved {saved.score} for {truncate(saved.title)}</span><button className="button subtle" type="button" disabled={disabled} aria-label={`Undo saving ${saved.score} for ${truncate(saved.title)}`} onClick={onUndo}>Undo</button><span className="saved-timer" aria-hidden="true" /></div>;
}

function Status({ person, done, revealed }: { person: PublicParticipant; done: boolean; revealed: boolean }) {
  if (done) return <><CheckCheck size={16} aria-hidden="true" /><span className="sr-only">Session complete</span></>;
  if (revealed) return person.estimate ? <><span className="sr-only">Estimate </span>{person.estimate}</> : <><span aria-hidden="true">—</span><span className="sr-only">Did not vote</span></>;
  return person.hasVoted ? <><Check size={16} aria-hidden="true" /><span className="sr-only">Voted</span></> : <><Circle size={12} aria-hidden="true" /><span className="sr-only">Not voted yet</span></>;
}

const RESTART_MESSAGE = 'The facilitator restarted this round. Vote again.';

export function RoomView({ room, connection, busy, error, act, retry }: RoomViewProps) {
  const [clipboard, setClipboard] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportError, setExportError] = useState('');
  const [saved, setSaved] = useState<{ score: Score; title: string; story: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const [restarted, setRestarted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const revealHeading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const seen = useRef({ roundId: room.roundId, story: room.currentStory, phase: room.phase });
  const previousRound = useRef({ roundId: room.roundId, story: room.currentStory, phase: room.phase });
  const previousConnection = useRef(connection);
  const self = room.participants.find(person => person.id === room.self.id);
  const done = room.phase === 'completed';
  const revealed = room.phase === 'revealed';
  const votes = room.participants.filter(person => person.hasVoted).length;
  const completedCount = room.stories.filter(story => story.score !== null).length;
  const currentStory = room.stories[room.currentStory];
  const total = room.participants.length;
  const missingVotes = total - votes;
  const locked = busy || connection !== 'live';
  const distribution = DECK.map(value => ({ value, count: room.participants.filter(person => person.estimate === value).length })).filter(item => item.count > 0);
  const spread = spreadNote(room.participants);
  const roundStarted = !done && (revealed || votes > 0);

  useEffect(() => { setConfirmReveal(false); setConfirmReset(false); }, [room.roundId, room.phase]);
  useEffect(() => { if (clipboard === 'idle') return; const timeout = setTimeout(() => setClipboard('idle'), 5000); return () => clearTimeout(timeout); }, [clipboard]);
  useEffect(() => { if (!saved) return; const timeout = setTimeout(() => setSaved(null), 10000); return () => clearTimeout(timeout); }, [saved]);
  useEffect(() => { if (saved && room.currentStory > saved.story && roundStarted) setSaved(null); }, [saved, room.currentStory, roundStarted]);
  useEffect(() => {
    if (focusTick === 0) return;
    heading.current?.focus({ preventScroll: true });
    if ((workspace.current?.getBoundingClientRect().top ?? 0) < 0) workspace.current?.scrollIntoView({ block: 'start' });
  }, [focusTick]);
  useEffect(() => {
    const before = seen.current;
    seen.current = { roundId: room.roundId, story: room.currentStory, phase: room.phase };
    const sameRound = before.roundId === room.roundId && before.story === room.currentStory;
    const toRevealed = before.phase !== 'revealed' && room.phase === 'revealed';
    if (sameRound && !toRevealed) return;
    const active = document.activeElement;
    if (active && active !== document.body && !workspace.current?.contains(active)) return;
    if (sameRound) revealHeading.current?.focus({ preventScroll: true });
    else if (!active?.classList.contains('estimate-card')) heading.current?.focus({ preventScroll: true });
  }, [room.roundId, room.currentStory, room.phase]);
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0);
    if (!document.activeElement || document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const before = previousRound.current;
    previousRound.current = { roundId: room.roundId, story: room.currentStory, phase: room.phase };
    if (before.roundId !== room.roundId) {
      const reset = !room.self.facilitator && room.phase === 'voting' && room.currentStory === before.story && before.phase !== 'completed';
      setRestarted(reset);
      if (reset) setAnnouncement(RESTART_MESSAGE);
    } else if (room.self.vote !== null || room.currentStory !== before.story) setRestarted(false);
  }, [room.roundId, room.currentStory, room.phase, room.self.facilitator, room.self.vote]);
  useEffect(() => {
    if (previousConnection.current === connection) return;
    setAnnouncement(connection === 'live' ? 'Live updates resumed.' : previousConnection.current === 'live' ? 'Live updates interrupted. Reconnecting.' : '');
    previousConnection.current = connection;
  }, [connection]);
  useEffect(() => { if (clipboard === 'copied') setAnnouncement('Invite link copied.'); if (clipboard === 'failed') setAnnouncement('Clipboard access is unavailable. Copy the invite link shown on screen.'); }, [clipboard]);
  useEffect(() => { if (room.self.vote !== null) setAnnouncement(`Your estimate is ${room.self.vote}.`); }, [room.self.vote]);

  async function copyInvite() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.id}`); setClipboard('copied'); } catch { setClipboard('failed'); }
  }
  function exportScores() { try { downloadCsv(room); setExportError(''); } catch { setExportError('Your browser couldn’t download the file. Allow downloads and try again.'); } }
  async function reveal() {
    if (missingVotes > 0 && !confirmReveal) { setConfirmReveal(true); return; }
    if (await act({ type: 'reveal' })) setConfirmReveal(false);
  }
  async function finalize(score: Score) {
    const title = currentStory?.title ?? '';
    if (await act({ type: 'finalize', score })) { setSaved({ score, title, story: room.currentStory }); setAnnouncement(`Saved ${score} for ${truncate(title)}.`); setFocusTick(tick => tick + 1); }
  }
  async function undo() { if (await act({ type: 'undoFinalize' })) { setSaved(null); setFocusTick(tick => tick + 1); } }
  async function reset() { if (await act({ type: 'reset' })) setConfirmReset(false); }

  return <main>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="room-top"><div><h1>{room.title}</h1><div className="room-meta"><span className={`connection ${connection !== 'live' ? 'disconnected' : ''}`}>{connection === 'live' ? (done ? 'Complete' : 'Live session') : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}</span><span className="identity">{self?.name ?? 'You'} · {room.self.facilitator ? 'Facilitator' : 'Participant'}</span></div></div><div className="room-actions"><button className="button" onClick={exportScores} aria-label="Export estimates as CSV"><Download size={15} />Export</button><button className={`button ${!done && total === 1 ? 'primary' : ''}`} onClick={copyInvite}><Copy size={15} />{clipboard === 'copied' ? 'Link copied' : 'Invite team'}</button></div></div>
    {clipboard === 'copied' && <div className="notice">Invite link copied. Share it with your team so they can join.</div>}
    {clipboard === 'failed' && <div className="notice">Clipboard access is unavailable. Copy this invite link instead: <a href={`/rooms/${room.id}`}>{window.location.origin}/rooms/{room.id}</a></div>}
    {connection !== 'live' && <div className="notice">Live updates are interrupted. We’re checking for changes while we reconnect. Voting and facilitator controls will return when connected.<button className="button subtle" onClick={retry}>Reconnect now</button></div>}
    {error && <div className="error" role="alert">{error}</div>}
    {exportError && <div className="error" role="alert">{exportError}</div>}
    <div className={`room-layout ${done ? 'complete' : ''}`}>
      <aside className={`paper agenda ${done ? 'complete' : ''}`} aria-label="Story progress"><div className="rail-title"><h2>The story list</h2><span className="count">{completedCount}/{room.stories.length}</span></div><div className="progress-track" role="progressbar" aria-label="Stories completed" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={room.stories.length}><span style={{ width: `${completedCount / room.stories.length * 100}%` }} /></div>{!done && <ol className="story-list">{room.stories.map((story, index) => <li className={`story-item ${index === room.currentStory ? 'active' : ''}`} key={story.id} aria-current={index === room.currentStory ? 'step' : undefined}><span className="story-number">{story.score !== null ? <Check size={13} aria-label="Agreed" /> : String(index + 1).padStart(2, '0')}</span><span className="story-name" title={story.title}>{story.title}</span>{story.score !== null && <span className="story-score" aria-label={`Agreed estimate ${story.score}`}>{story.score}</span>}</li>)}</ol>}</aside>
      <section className="workspace" ref={workspace} aria-label="Estimation workspace">
        {room.self.facilitator && saved && !done && <SavedBanner saved={saved} disabled={connection !== 'live'} onUndo={undo} />}
        <div className="paper round-paper">
          {done ? <>{room.self.facilitator && saved && <SavedBanner saved={saved} disabled={connection !== 'live'} onUndo={undo} inCard />}<div className="round-body completed-summary"><span className="complete-mark"><CheckCheck size={27} strokeWidth={1.5} /></span><h2 ref={heading} tabIndex={-1}>That’s a shared understanding.</h2><p className="muted">Every story has an agreed estimate. Your session is complete.</p><button className="button primary" onClick={exportScores}><Download size={16} />Export agreed estimates</button><div className="completion-list">{room.stories.map(story => <div className="completion-row" key={story.id}><span>{story.title}</span><strong>{story.score}</strong></div>)}</div></div></> : <>
            <div className="round-top"><div className="round-phase"><span>Story {room.currentStory + 1} of {room.stories.length}</span><span className="phase-tag">{revealed ? <><Eye size={13} />Estimates revealed</> : <><Circle size={10} fill="currentColor" />Voting open</>}</span></div><h2 className="round-title" ref={heading} tabIndex={-1}>{currentStory?.title}</h2></div>
            <div className="round-body">
              {revealed ? <><h3 className="reveal-heading" ref={revealHeading} tabIndex={-1}>The cards are on the table.</h3><p className="muted" style={{ marginTop: 9 }}>Compare perspectives before settling on an estimate.</p>{distribution.length ? <div className="distribution" role="img" aria-label={`Revealed estimates: ${distribution.map(item => `${item.value}: ${item.count} ${item.count === 1 ? 'vote' : 'votes'}`).join(', ')}`}>{distribution.map((item, index) => <div className="distribution-row" key={item.value}><strong>{item.value}</strong><div className="distribution-bar"><span style={{ width: `${item.count / Math.max(1, votes) * 100}%`, animationDelay: `${index * 90}ms` }} /></div><small>{item.count} {item.count === 1 ? 'vote' : 'votes'}</small></div>)}</div> : <p className="notice">No votes were submitted before the reveal.</p>}
                {spread && <p className="spread-note">{spread}</p>}
                {room.self.facilitator ? <FinalizeForm key={room.roundId} participants={room.participants} busy={busy} locked={locked} last={room.currentStory === room.stories.length - 1} onSave={score => void finalize(score)} /> : <p className="vote-note"><UsersRound size={14} />Your facilitator will record the agreed estimate.</p>}
              </> : <>{restarted && <p className="notice restart-notice">{RESTART_MESSAGE}</p>}<div className="vote-label"><strong>{room.self.vote !== null ? `Your estimate is ${room.self.vote}` : 'Your estimate'}</strong><span>{room.self.vote !== null ? 'Only you can see it. You can change it before reveal.' : 'Private until the reveal. Pick your card.'}</span></div><Deck vote={room.self.vote} offline={connection !== 'live'} busy={busy} onVote={value => void act({ type: 'vote', estimate: value })} /><div className="deck-legend" id="deck-legend"><p><strong>?</strong> unsure or needs discussion · <strong>½</strong> half a point</p><p className="legend-keys"><span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>Space</kbd> pick</span><span><span><kbd>1</kbd>–<kbd>21</kbd></span> type the number</span><span><kbd>H</kbd> ½</span></p></div></>}
              {room.self.facilitator && <div className="facilitator-controls">{!revealed && <div className="action-bar"><button className="button primary full" type="button" disabled={locked || confirmReveal} onClick={reveal}><Eye size={16} /><span>Reveal <span className="wide-only">estimates</span>{votes !== total && ` · ${votes}/${total} voted`}</span></button>{votes === total && <p>Everyone has voted. Time to compare perspectives.</p>}{confirmReveal && <div className="notice reveal-confirm"><p>{missingVotes} {missingVotes === 1 ? 'person hasn’t' : 'people haven’t'} voted yet. Reveal without {missingVotes === 1 ? 'their estimate' : 'their estimates'}?</p><div className="actions-row"><button className="button primary" disabled={locked} onClick={reveal}>Reveal now</button><button className="button" onClick={() => setConfirmReveal(false)}>Keep voting</button></div></div>}</div>}
                {confirmReset ? <div className="notice"><p>Clear everyone’s estimates and reopen voting for this story?</p><div className="actions-row"><button className="button" disabled={locked} onClick={reset}>Reset this round</button><button className="button subtle" onClick={() => setConfirmReset(false)}>Cancel</button></div></div> : <button className="button subtle" disabled={locked} onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Restart this round</button>}
              </div>}
            </div>
          </>}
        </div>
      </section>
      <aside className="team" aria-label="Team participants"><div className="rail-title"><h2>At the table</h2><span className="count">{total} {total === 1 ? 'person' : 'people'}</span></div><ul className="people">{room.participants.map(person => <li className="person" key={person.id}><span className="avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><div className="person-details"><div className="person-name">{person.name}{person.id === room.self.id ? ' (you)' : ''}</div>{(person.facilitator || !person.online) && <div className="person-role">{[person.facilitator && 'Facilitator', !person.online && 'Away'].filter(Boolean).join(' · ')}</div>}</div><span className={`person-status ${!person.hasVoted ? 'waiting' : ''}`}><Status person={person} done={done} revealed={revealed} /></span></li>)}</ul><p className="team-note">{done ? 'Keep this room link to revisit the agreed estimates. Rooms expire seven days after creation.' : revealed ? 'Different numbers are a good place to start a conversation.' : <><LockKeyhole size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Estimates are hidden until the facilitator reveals them.</>}</p></aside>
    </div>
  </main>;
}
