import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CheckCheck, Layers2, LockKeyhole, UsersRound } from 'lucide-react';
import type { Admission } from '../shared/types';
import { createRoom, friendlyError, joinRoom, readIdentity, saveIdentity } from './api';
import { RoomPage } from './RoomPage';

export function Header() {
  return <header className="site-header"><a className="brand" href="/" aria-label="Scrum Poker home"><span className="brand-mark"><Layers2 size={18} strokeWidth={1.6} /></span>scrum poker<span className="muted" aria-hidden="true"> / </span></a><span className="header-note"><UsersRound size={15} />A little space to think together.</span></header>;
}

export function ErrorMessage({ message }: { message: string }) {
  return <div className="error" role="alert">{message}</div>;
}

export function Home({ onAdmission }: { onAdmission: (admission: Admission) => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [stories, setStories] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const storyList = stories.split(/\r?\n/).map(story => story.trim()).filter(Boolean);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !title.trim() || storyList.length === 0) { setError('Add your name, a session name, and at least one story to begin.'); return; }
    if (storyList.length > 100 || storyList.some(story => story.length > 500)) { setError('Use up to 100 stories, with no more than 500 characters per story.'); return; }
    setBusy(true); setError('');
    try { onAdmission(await createRoom({ name: name.trim(), title: title.trim(), stories: storyList })); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { setBusy(false); }
  }

  return <main className="home-grid">
    <section className="intro" aria-labelledby="home-title">
      <h1 id="home-title">Good estimates start with a little perspective.</h1>
      <p>Bring your team and your next stories. Think independently, turn the cards, and find a number together.</p>
      <div className="ritual">
        <div className="ritual-row"><LockKeyhole size={18} /><div><strong>Think first. Reveal together.</strong><p>Everyone’s estimate stays private until the reveal.</p></div></div>
        <div className="ritual-row"><UsersRound size={18} /><div><strong>A shared room, not another account.</strong><p>Invite your team with a link. Join with a name.</p></div></div>
        <div className="ritual-row"><CheckCheck size={18} /><div><strong>Leave with an agreed plan.</strong><p>Record each score and take your estimates with you.</p></div></div>
      </div>
    </section>
    <section className="paper setup-paper" aria-labelledby="create-title">
      <div className="section-heading"><h2 id="create-title">Set the table.</h2><Layers2 size={21} color="var(--teal)" strokeWidth={1.5} /></div>
      <p className="muted">You’ll facilitate the session. Everyone gets a vote.</p>
      <form className="setup-form" onSubmit={submit}>
        <div className="field"><label htmlFor="host-name">Your name</label><input id="host-name" autoComplete="given-name" maxLength={60} placeholder="What should your team call you?" required value={name} onChange={event => setName(event.target.value)} /></div>
        <div className="field"><label htmlFor="room-title">Session name</label><input id="room-title" maxLength={120} placeholder="e.g. Next sprint planning" required value={title} onChange={event => setTitle(event.target.value)} /></div>
        <div className="field"><div className="label-row"><label htmlFor="stories">Stories to estimate</label><span className="count">{storyList.length} / 100</span></div><textarea id="stories" required placeholder={'One story per line\nPaste a title or a ticket reference'} aria-describedby="stories-help" value={stories} onChange={event => setStories(event.target.value)} /><small id="stories-help">One story per line. Keep it short; discuss the details together.</small></div>
        {error && <ErrorMessage message={error} />}
        <button className="button primary full" disabled={busy} type="submit">{busy ? 'Creating your room…' : 'Create session'}{!busy && <ArrowRight size={16} />}</button>
        <p className="form-footnote">No sign-up. Just a name and a shared link.</p>
      </form>
    </section>
  </main>;
}

export function Join({ id, onAdmission }: { id: string; onAdmission: (admission: Admission) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError('Enter your name to join the team.'); return; }
    setBusy(true); setError('');
    try { onAdmission(await joinRoom(id, name.trim())); } catch (failure) { setError(friendlyError(failure)); } finally { setBusy(false); }
  }
  return <main className="page-centered"><section className="paper join-paper"><h1>Pull up a chair.</h1><p className="muted">You’ve been invited to estimate with your team. Add your name to join the room.</p><form onSubmit={submit}><div className="field"><label htmlFor="join-name">Your name</label><input id="join-name" required autoComplete="given-name" maxLength={60} value={name} placeholder="How your team knows you" onChange={event => setName(event.target.value)} /></div>{error && <ErrorMessage message={error} />}<button className="button primary full" disabled={busy}>{busy ? 'Joining the room…' : 'Join session'}<ArrowRight size={16} /></button></form><p className="form-footnote">Your vote is private until the facilitator reveals it.</p></section></main>;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const id = /^\/rooms\/([a-f0-9]{32})\/?$/.exec(path)?.[1] ?? null;
  const [access, setAccess] = useState(() => id ? readIdentity(id) : { identity: null, storageWarning: false });
  useEffect(() => { const update = () => { setPath(window.location.pathname); const nextId = /^\/rooms\/([a-f0-9]{32})\/?$/.exec(window.location.pathname)?.[1]; setAccess(nextId ? readIdentity(nextId) : { identity: null, storageWarning: false }); }; window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  function admit(admission: Admission) {
    const stored = saveIdentity(admission.room.id, admission.identity);
    setAccess({ identity: admission.identity, storageWarning: !stored });
    const nextPath = `/rooms/${admission.room.id}`;
    window.history.pushState({}, '', nextPath); setPath(nextPath);
  }
  const validHome = path === '/';
  return <div className="app-shell"><Header />
    {access.storageWarning && <div className="notice" role="status">Your browser couldn’t save room access. Keep this tab open. Reloading may lose your identity{access.identity ? ' and facilitator controls' : ''}.</div>}
    {id ? access.identity ? <RoomPage key={`${id}:${access.identity.participantId}`} id={id} identity={access.identity} onRejoin={() => setAccess({ identity: null, storageWarning: access.storageWarning })} /> : <Join id={id} onAdmission={admit} /> : validHome ? <Home onAdmission={admit} /> : <main className="page-centered"><section className="join-paper"><h1>That link needs another look.</h1><p className="muted">Ask your facilitator for the full room link, or start a session of your own.</p><a className="button primary" href="/">Start a session<ArrowRight size={16} /></a></section></main>}
    <footer className="site-footer"><span>Independent thinking. Shared understanding.</span><span><Check size={12} aria-hidden="true" /> Made for the conversation.</span></footer>
  </div>;
}
