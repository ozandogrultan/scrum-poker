import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CheckCheck, Circle, Copy, Download, Eye, LoaderCircle, LockKeyhole, RotateCcw, UsersRound } from 'lucide-react';
import { DECK, SCORES, type Estimate, type Identity, type RoomSnapshot, type Score } from '../shared/types';
import { downloadCsv } from './export';
import { useRoom, type Connection, type RoomAction } from './useRoom';

type RoomViewProps = { room: RoomSnapshot; connection: Connection; busy: boolean; error: string; act: (action: RoomAction) => Promise<boolean>; retry: () => void };

export function RoomPage({ id, identity, onRejoin }: { id: string; identity: Identity; onRejoin: () => void }) {
  const state = useRoom(id, identity);
  if (state.fatal) return <main className="page-centered"><section className="paper join-paper"><h1>{state.fatal === 404 || state.fatal === 410 ? 'This room is no longer here.' : 'Let’s check your access.'}</h1><div role="alert" className="error">{state.error}</div><div className="actions-row">{state.fatal === 401 || state.fatal === 403 ? <button className="button primary" onClick={onRejoin}>Rejoin with your name</button> : <a className="button primary" href="/">Start a new session<ArrowRight size={16} /></a>}<button className="button subtle" onClick={state.retry}>Try again</button></div></section></main>;
  if (!state.room) return <main className="page-centered"><div><div className="loading-state" role="status"><LoaderCircle className="spin" size={21} />{state.connection === 'reconnecting' ? 'Waiting for a connection to your room…' : 'Opening your room…'}</div>{state.connection === 'reconnecting' && <><p className="muted">Check your connection. We’ll keep trying.</p><button className="button" onClick={state.retry}>Retry connection</button></>}</div></main>;
  return <RoomView {...state} room={state.room} />;
}

export function RoomView({ room, connection, busy, error, act, retry }: RoomViewProps) {
  const [clipboard, setClipboard] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [score, setScore] = useState<Score | ''>('');
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportError, setExportError] = useState('');
  useEffect(() => { setScore(''); setConfirmReveal(false); setConfirmReset(false); }, [room.roundId, room.phase]);
  useEffect(() => { if (clipboard === 'idle') return; const timeout = setTimeout(() => setClipboard('idle'), 5000); return () => clearTimeout(timeout); }, [clipboard]);
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

  async function copyInvite() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.id}`); setClipboard('copied'); } catch { setClipboard('failed'); }
  }
  function exportScores() { try { downloadCsv(room); setExportError(''); } catch { setExportError('Your browser couldn’t download the file. Allow downloads and try again.'); } }
  async function reveal() {
    if (missingVotes > 0 && !confirmReveal) { setConfirmReveal(true); return; }
    if (await act({ type: 'reveal' })) setConfirmReveal(false);
  }
  async function finalize(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (score) await act({ type: 'finalize', score }); }
  async function reset() { if (await act({ type: 'reset' })) setConfirmReset(false); }

  return <main>
    <div className="room-top"><div><h1>{room.title}</h1><div className="room-meta"><span className={`connection ${connection !== 'live' ? 'disconnected' : ''}`} role="status">{connection === 'live' ? 'Live session' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}</span><span aria-hidden="true">/</span><span>{completedCount} of {room.stories.length} stories agreed</span><span className="identity">{self?.name ?? 'You'} · {room.self.facilitator ? 'Facilitator' : 'Participant'}</span></div></div><div className="room-actions"><button className="button" onClick={exportScores} aria-label="Export estimates as CSV"><Download size={15} />Export</button><button className="button primary" onClick={copyInvite}><Copy size={15} />{clipboard === 'copied' ? 'Link copied' : 'Invite team'}</button></div></div>
    {clipboard === 'copied' && <div className="notice" role="status">Invite link copied. Share it with your team so they can join.</div>}
    {clipboard === 'failed' && <div className="notice" role="status">Clipboard access is unavailable. Copy this invite link instead: <a href={`/rooms/${room.id}`}>{window.location.origin}/rooms/{room.id}</a></div>}
    {connection !== 'live' && <div className="notice" role="status">Live updates are interrupted. We’re checking for changes while we reconnect. Voting and facilitator controls will return when connected.<button className="button subtle" onClick={retry}>Reconnect now</button></div>}
    {error && <div className="error" role="alert">{error}</div>}
    {exportError && <div className="error" role="alert">{exportError}</div>}
    <div className="room-layout">
      <aside className="paper agenda" aria-label="Story progress"><div className="rail-title"><h2>The story list</h2><span className="count">{completedCount}/{room.stories.length}</span></div><div className="progress-track" role="progressbar" aria-label="Stories completed" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={room.stories.length}><span style={{ width: `${completedCount / room.stories.length * 100}%` }} /></div><ol className="story-list">{room.stories.map((story, index) => <li className={`story-item ${index === room.currentStory && !done ? 'active' : ''}`} key={story.id} aria-current={index === room.currentStory && !done ? 'step' : undefined}><span className="story-number">{story.score !== null ? <Check size={13} aria-label="Agreed" /> : String(index + 1).padStart(2, '0')}</span><span className="story-name">{story.title}</span>{story.score !== null && <span className="story-score" aria-label={`Agreed estimate ${story.score}`}>{story.score}</span>}</li>)}</ol></aside>
      <section className="workspace" aria-label="Estimation workspace">
        <div className="paper round-paper">
          {done ? <div className="round-body completed-summary"><span className="complete-mark"><CheckCheck size={27} strokeWidth={1.5} /></span><h2>That’s a shared understanding.</h2><p className="muted">Every story has an agreed estimate. Your session is complete.</p><button className="button primary" onClick={exportScores}><Download size={16} />Export agreed estimates</button><div className="completion-list">{room.stories.map(story => <div className="completion-row" key={story.id}><span>{story.title}</span><strong>{story.score}</strong></div>)}</div></div> : <>
            <div className="round-top"><div className="round-phase"><span>Story {room.currentStory + 1} of {room.stories.length}</span><span className="phase-tag">{revealed ? <><Eye size={13} />Estimates revealed</> : <><Circle size={10} fill="currentColor" />Voting open</>}</span></div><h2 className="round-title">{currentStory?.title}</h2></div>
            <div className="round-body">
              {revealed ? <><h3>The cards are on the table.</h3><p className="muted" style={{ marginTop: 9 }}>Compare perspectives before settling on an estimate.</p>{distribution.length ? <div className="distribution" role="img" aria-label={`Revealed estimates: ${distribution.map(item => `${item.value}: ${item.count} ${item.count === 1 ? 'vote' : 'votes'}`).join(', ')}`}>{distribution.map(item => <div className="distribution-row" key={item.value}><strong>{item.value}</strong><div className="distribution-bar"><span style={{ width: `${item.count / Math.max(1, votes) * 100}%` }} /></div><small>{item.count} {item.count === 1 ? 'vote' : 'votes'}</small></div>)}</div> : <p className="notice">No votes were submitted before the reveal.</p>}
                {room.self.facilitator ? <form className="finalize-form" onSubmit={finalize}><div className="field"><label htmlFor="final-score">Agreed estimate</label><select id="final-score" required value={score} onChange={event => setScore(event.target.value as Score | '')} disabled={locked}><option value="" disabled>Choose the team’s agreed estimate</option>{SCORES.map(value => <option key={value} value={value}>{value}</option>)}</select><small>Choose a score after discussion. This records the estimate for everyone.</small></div><button className="button primary" disabled={locked || !score}>{busy ? 'Saving…' : room.currentStory === room.stories.length - 1 ? 'Save estimate & finish' : 'Save estimate & next story'}<ArrowRight size={15} /></button></form> : <p className="vote-note"><UsersRound size={14} />Your facilitator will record the agreed estimate.</p>}
              </> : <><div className="vote-label"><strong>Your estimate</strong><span>{room.self.vote !== null ? 'You can change it before reveal.' : 'Think it through. Pick your card.'}</span></div><div className="estimate-grid" role="group" aria-label="Choose your estimate">{DECK.map(value => <button className="estimate-card" key={value} type="button" aria-label={value === '?' ? 'Estimate unsure' : `Estimate ${value}`} aria-pressed={room.self.vote === value} disabled={locked} onClick={() => void act({ type: 'vote', estimate: value as Estimate })}><span className="estimate-value">{value}</span>{room.self.vote === value ? <Check size={12} /> : <span aria-hidden="true" style={{ height: 12 }} />}</button>)}</div><p className={`vote-note ${room.self.vote !== null ? 'selected' : ''}`} role="status">{room.self.vote !== null ? <><Check size={14} />Your estimate is {room.self.vote}. Only you can see it.</> : <><LockKeyhole size={13} />Your estimate stays private until the reveal.</>}</p></>}
              {room.self.facilitator && <div className="facilitator-controls">{!revealed && <><button className="button primary full" type="button" disabled={locked || confirmReveal} onClick={reveal}><Eye size={16} />{votes === total ? 'Reveal estimates' : `Reveal estimates · ${votes}/${total} voted`}</button><p>{votes === total ? 'Everyone has voted. Time to compare perspectives.' : 'Give everyone a moment, or reveal early when the team is ready.'}</p>{confirmReveal && <div className="notice reveal-confirm"><p>{missingVotes} {missingVotes === 1 ? 'person hasn’t' : 'people haven’t'} voted yet. Reveal without {missingVotes === 1 ? 'their estimate' : 'their estimates'}?</p><div className="actions-row"><button className="button primary" disabled={locked} onClick={reveal}>Reveal now</button><button className="button" onClick={() => setConfirmReveal(false)}>Keep voting</button></div></div>}</>}
                {confirmReset ? <div className="notice"><p>Clear everyone’s estimates and reopen voting for this story?</p><div className="actions-row"><button className="button" disabled={locked} onClick={reset}>Reset this round</button><button className="button subtle" onClick={() => setConfirmReset(false)}>Cancel</button></div></div> : <button className="button subtle" disabled={locked} onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Restart this round</button>}
              </div>}
            </div>
          </>}
        </div>
      </section>
      <aside className="team" aria-label="Team participants"><div className="rail-title"><h2>At the table</h2><span className="count">{total} {total === 1 ? 'person' : 'people'}</span></div><ul className="people">{room.participants.map(person => <li className="person" key={person.id}><span className="avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><div className="person-details"><div className="person-name">{person.name}{person.id === room.self.id ? ' (you)' : ''}</div><div className="person-role">{person.facilitator ? 'Facilitator' : 'Participant'}{!person.online ? ' · Away' : ''}</div></div><span className={`person-status ${!person.hasVoted ? 'waiting' : ''}`} aria-label={done ? 'Session complete' : revealed ? person.estimate ? `Estimate ${person.estimate}` : 'Did not vote' : person.hasVoted ? 'Voted' : 'Not voted yet'}>{done ? <CheckCheck size={16} /> : revealed ? person.estimate ?? '—' : person.hasVoted ? <Check size={16} /> : <Circle size={12} />}</span></li>)}</ul><p className="team-note">{done ? 'Keep this room link to revisit the agreed estimates. Rooms expire seven days after creation.' : revealed ? 'Different numbers are a good place to start a conversation.' : <><LockKeyhole size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Estimates are hidden until the facilitator reveals them.</>}</p></aside>
    </div>
  </main>;
}
