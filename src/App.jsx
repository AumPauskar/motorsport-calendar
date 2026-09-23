import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const rangeDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const localTimezone = () => timezone.replaceAll('_', ' ');

function getRounds(data, year, series) {
  return (data?.[year]?.[series]?.rounds ?? []).map((round) => {
    const sessions = Object.entries(round.details ?? {}).map(([name, iso]) => ({ name, date: new Date(iso), iso }));
    return { ...round, sessions, start: sessions[0]?.date, finish: sessions.at(-1)?.date };
  }).sort((a, b) => a.start - b.start);
}

export default function App() {
  const [data, setData] = useState(null);
  const [year, setYear] = useState('');
  const [series, setSeries] = useState('');
  const [selectedRound, setSelectedRound] = useState(null);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('pitwall-theme') || 'auto');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState('calendar');
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedSeries, setExpandedSeries] = useState('');

  useEffect(() => { fetch('/data.json').then((response) => response.json()).then((json) => { const years = Object.keys(json).sort((a, b) => b - a); const initialYear = years.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : years[0]; setData(json); setYear(initialYear); setSeries(Object.keys(json[initialYear] ?? {})[0] ?? ''); }); }, []);
  const dark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('pitwall-theme', themeMode); }, [dark, themeMode]);
  useEffect(() => { const media = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!media) return undefined; const update = (event) => setSystemDark(event.matches); media.addEventListener?.('change', update); return () => media.removeEventListener?.('change', update); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const previous = () => setWeekOffset((offset) => Math.max(0, offset - 1)); const next = () => setWeekOffset((offset) => offset + 1); window.addEventListener('pitwall:previous-week', previous); window.addEventListener('pitwall:next-week', next); return () => { window.removeEventListener('pitwall:previous-week', previous); window.removeEventListener('pitwall:next-week', next); }; }, []);

  const years = useMemo(() => Object.keys(data ?? {}).sort((a, b) => b - a), [data]);
  const championships = useMemo(() => Object.keys(data?.[year] ?? {}), [data, year]);
  const championshipGroups = useMemo(() => getChampionshipGroups(data?.[year] ?? {}), [data, year]);
  const rounds = useMemo(() => getRounds(data, year, series), [data, year, series]);
  const nextSession = useMemo(() => rounds.flatMap((round) => round.sessions.map((session) => ({ ...session, round }))).filter((session) => session.date > now).sort((a, b) => a.date - b.date)[0], [rounds, now]);
  const weekSessions = useMemo(() => getAllWeekSessions(data, year, now, weekOffset), [data, year, now, weekOffset]);

  function changeYear(nextYear) { setYear(nextYear); setSeries(Object.keys(data?.[nextYear] ?? {})[0] ?? ''); setSelectedRound(null); }
  function goToRound(round) {
    if (round.series && round.series !== series) {
      setSeries(round.series);
      window.setTimeout(() => goToRound({ ...round, series: undefined }), 80);
      return;
    }
    document.getElementById(`race-round-${round.round}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const card = document.getElementById(`race-round-${round.round}`);
    card?.classList.add('is-target');
    window.setTimeout(() => card?.classList.remove('is-target'), 1800);
  }
  if (!data) return <div className="loading-screen">Loading race data<span>•</span></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand-row"><a className="brand" href="/"><span className="brand-mark">P</span><span>PITWALL</span></a><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button></div>
      <div className="sidebar-scroll">
        <div className="sidebar-section"><p className="eyebrow">Season</p><label className="select-wrap"><span className="sr-only">Select season</span><select value={year} onChange={(event) => changeYear(event.target.value)}>{years.map((item) => <option value={item} key={item}>{item} season</option>)}</select><span className="select-chevron">⌄</span></label></div>
        <div className="sidebar-section"><button className={`series-item week-sidebar-item ${page === 'week' ? 'active' : ''}`} onClick={() => { setPage('week'); setWeekOffset(0); setSidebarOpen(false); }}><span className="series-logo">↗</span><span>This week</span></button></div>
        <div className="sidebar-section"><div className="section-heading"><p className="eyebrow">Championships</p><span className="count-pill">{championships.length}</span></div><ChampionshipList groups={championshipGroups} page={page} series={series} expandedSeries={expandedSeries} setExpandedSeries={setExpandedSeries} onSelect={(item) => { setSeries(item); setPage('calendar'); setSelectedRound(null); setSidebarOpen(false); }} /></div>
        <div className="sidebar-note"><span className="note-icon">◒</span><div><strong>Your local time</strong><p>{localTimezone()}</p></div></div>
      </div><div className="sidebar-footer"><span>Race calendar</span><span className="live-dot" /></div>
    </aside>
    <main className="main-content"><header className="topbar"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button><div className="breadcrumb">{page === 'week' ? <strong>This week</strong> : <><span>Calendar</span><span className="slash">/</span><strong>{series}</strong></>}</div><div className="top-actions"><button className={`theme-toggle ${themeMode}`} onClick={() => setThemeMode((mode) => mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light')} aria-label={`Theme: ${themeMode}. Click to switch.`}><span>☼</span><span className={`theme-track mode-${themeMode}`}><i /></span><span className="auto-label">A</span><span>☾</span></button></div></header>
      <div className="content-wrap">{page === 'calendar' ? <><NextEventBanner session={nextSession} now={now} onClick={goToRound} /><section className="page-heading"><div><p className="eyebrow accent">Race calendar <span className="heading-rule" /></p><h1>{series} <span>{year}</span></h1><p className="subheading">{rounds.length} race weekends · Times shown in {localTimezone()}</p></div></section>
        <section className="race-section"><div className="section-heading large"><div><p className="eyebrow accent">The season</p><h2>Race weekends</h2></div><span className="race-count">{rounds.length} rounds</span></div>{rounds.length ? <div className="race-grid">{rounds.map((round) => <RaceCard key={round.round} round={round} onClick={() => setSelectedRound(round)} />)}</div> : <div className="empty-state"><span>◎</span><h3>No races scheduled yet</h3><p>Add rounds to data.json to see them here.</p></div>}</section></> : <><NextEventBanner session={weekSessions.find((session) => session.date > now)} now={now} onClick={goToRound} /><VerticalWeekTimeline sessions={weekSessions} now={now} onClick={goToRound} /></>}
        </div></main><div className={`scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />{selectedRound && <RaceDetails round={selectedRound} onClose={() => setSelectedRound(null)} />}
  </div>;
}

function NextEventBanner({ session, now, onClick }) {
  if (!session) return <div className="next-event-banner empty"><span className="next-event-kicker">Next up</span><strong>No upcoming sessions in this season</strong></div>;
  const remaining = Math.max(0, session.date - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return <button className="next-event-banner" onClick={() => onClick(session.round)}><span className="next-event-kicker"><i />Next session</span><span className="next-event-copy"><strong>{session.round.name}</strong><small>{session.name.replaceAll('_', ' ')} · {fullDateFormat.format(session.date)} at {timeFormat.format(session.date)}</small></span><span className="countdown" aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds remaining`}><b>{String(days).padStart(2, '0')}</b><em>d</em><b>{String(hours).padStart(2, '0')}</b><em>h</em><b>{String(minutes).padStart(2, '0')}</b><em>m</em><b>{String(seconds).padStart(2, '0')}</b><em>s</em></span><span className="next-event-arrow">↗</span></button>;
}

function RaceCard({ round, onClick }) {
  const mainRace = round.sessions.find((session) => session.name.toLowerCase() === 'race') ?? round.sessions.at(-1);
  return <button id={`race-round-${round.round}`} className="race-card" onClick={onClick}><div className="card-topline"><span>Round {String(round.round).padStart(2, '0')}</span><span className="card-arrow">↗</span></div><h3>{round.name}</h3><div className="card-date-range"><span>{rangeDateFormat.format(round.start)}</span><span className="range-line" /><span>{rangeDateFormat.format(round.finish)}</span></div><div className="main-race"><span className="race-flag">◆</span><span><small>Main race</small><strong>{fullDateFormat.format(mainRace.date)} · {timeFormat.format(mainRace.date)}</strong></span></div></button>;
}

function getAllWeekSessions(data, year, currentDate, weekOffset = 0) {
  const rounds = Object.entries(data?.[year] ?? {}).flatMap(([seriesName, championship]) => (championship.rounds ?? []).map((round) => ({ ...round, series: seriesName })));
  const start = new Date(currentDate); const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day + (weekOffset * 7)); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 8);
  return rounds.flatMap((round) => Object.entries(round.details ?? {}).map(([name, iso]) => ({ name, date: new Date(iso), iso, round, series: round.series }))).filter((session) => session.date >= start && session.date < end).sort((a, b) => a.date - b.date);
}

function getChampionshipGroups(championships) {
  const groups = new Map();
  Object.entries(championships).forEach(([name, config]) => { if (!config.feeder) groups.set(name, { name, children: [] }); });
  Object.entries(championships).forEach(([name, config]) => { if (config.feeder && config.parent) { if (!groups.has(config.parent)) groups.set(config.parent, { name: config.parent, children: [] }); groups.get(config.parent).children.push(name); } });
  return [...groups.values()];
}

function ChampionshipList({ groups, page, series, expandedSeries, setExpandedSeries, onSelect }) {
  return <div className="series-list">{groups.map((group) => <div className="series-group" key={group.name}><button className={`series-item ${page === 'calendar' && series === group.name ? 'active' : ''}`} onClick={() => { onSelect(group.name); setExpandedSeries((current) => current === group.name ? '' : group.name); }}><span className="series-logo">{group.name.slice(0, 2).toUpperCase()}</span><span>{group.name}</span>{group.children.length > 0 && <span className={`feeder-chevron ${expandedSeries === group.name ? 'expanded' : ''}`}>⌄</span>}</button>{group.children.length > 0 && expandedSeries === group.name && <div className="feeder-list">{group.children.map((child) => <button className={`series-item feeder-item ${page === 'calendar' && series === child ? 'active' : ''}`} key={child} onClick={() => onSelect(child)}><span className="series-logo">{child.slice(0, 2).toUpperCase()}</span><span>{child}</span></button>)}</div>}</div>)}</div>;
}

function VerticalWeekTimeline({ sessions, now, onClick, onPrevious = () => window.dispatchEvent(new CustomEvent('pitwall:previous-week')), onNext = () => window.dispatchEvent(new CustomEvent('pitwall:next-week')) }) {
  const next = sessions.find((session) => session.date > now);
  return <section className="vertical-week"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>{getWeekTitle(sessions)}</h1><p className="subheading">All championships · {localTimezone()} · Monday through next Monday</p></div><div className="week-controls"><button onClick={onPrevious} aria-label="Previous week">‹</button><span className="week-session-count">{sessions.length} sessions</span><button onClick={onNext} aria-label="Next week">›</button></div></div><div className="tree-timeline">{sessions.map((session, index) => <button className={`tree-event ${index % 2 ? 'tree-right' : 'tree-left'} ${session === next ? 'tree-next' : ''}`} key={`${session.iso}-${session.series}-${session.name}`} onClick={() => onClick(session.round)}><span className="tree-node">{session.name.toLowerCase() === 'race' ? '◆' : '•'}</span><span className="tree-card"><small>{fullDateFormat.format(session.date)} · {timeFormat.format(session.date)}</small><strong>{session.round.name}</strong><em>{session.name.replaceAll('_', ' ')} · {session.series}</em></span></button>)}</div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>No sessions this week</h3><p>There are no scheduled sessions from Monday through next Monday.</p></div>}</section>;
}

function LegacyWeekTimeline({ sessions, now, onClick }) {
  const next = sessions.find((session) => session.date > now);
  return <section className="vertical-week"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>{getWeekTitle(sessions)}</h1><p className="subheading">All championships · {localTimezone()} · Monday through next Monday</p></div><div className="week-controls"><button onClick={() => window.dispatchEvent(new CustomEvent('pitwall:previous-week'))} aria-label="Previous week">‹</button><span className="week-session-count">{sessions.length} sessions</span><button onClick={() => window.dispatchEvent(new CustomEvent('pitwall:next-week'))} aria-label="Next week">›</button></div></div><div className="tree-timeline">{sessions.map((session, index) => <button className={`tree-event ${index % 2 ? 'tree-right' : 'tree-left'} ${session === next ? 'tree-next' : ''}`} key={`${session.iso}-${session.series}-${session.name}`} onClick={() => onClick(session.round)}><span className="tree-node">{session.name.toLowerCase() === 'race' ? '◆' : '•'}</span><span className="tree-card"><small>{fullDateFormat.format(session.date)} · {timeFormat.format(session.date)}</small><strong>{session.round.name}</strong><em>{session.name.replaceAll('_', ' ')} · {session.series}</em></span></button>)}</div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>No sessions this week</h3><p>There are no scheduled sessions from Monday through next Monday.</p></div>}</section>;
}

function getWeekTitle(sessions) {
  if (!sessions.length) return 'No Races this week :(';
  const first = new Date(sessions[0].date); const last = new Date(sessions.at(-1).date);
  const today = new Date(); const currentDay = (today.getDay() + 6) % 7; const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - currentDay); thisMonday.setHours(0, 0, 0, 0);
  const offset = Math.round((new Date(first.getFullYear(), first.getMonth(), first.getDate()) - thisMonday) / 604800000);
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  return `${rangeDateFormat.format(first)} — ${rangeDateFormat.format(last)}`;
}

function WeekTimeline({ sessions, now, onClick }) {
  const start = new Date(now); const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day); start.setHours(0, 0, 0, 0);
  const timelineHours = 8 * 24; const end = new Date(start); end.setHours(timelineHours);
  const days = Array.from({ length: 8 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return date; });
  const currentPosition = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  return <section className="week-page"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>This week</h1><p className="subheading">All championships · {localTimezone()} · Includes next Monday overflow</p></div><span className="week-session-count">{sessions.length} sessions</span></div><div className="timeline-shell"><div className="timeline-head"><div className="timeline-spacer" />{days.map((date, index) => <div className={`timeline-day ${date.toDateString() === now.toDateString() ? 'today' : ''}`} key={date.toISOString()}><span>{index === 7 ? 'Next Mon' : date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.getDate()}</strong></div>)}</div><div className="timeline-body"><div className="time-axis">{[0, 6, 12, 18].map((hour) => <span style={{ top: `${(hour / 24) * 100}%` }} key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div><div className="timeline-track">{days.map((_, index) => <span className="day-grid-line" style={{ left: `${(index / 8) * 100}%` }} key={index} />)}<span className="day-grid-line" style={{ left: '100%' }} />{now >= start && now < end && <span className="current-time-line" style={{ left: `${currentPosition}%` }}><i>NOW</i></span>}{sessions.map((session) => { const position = ((session.date - start) / (end - start)) * 100; return <button className={`timeline-event ${session.name.toLowerCase() === 'race' ? 'race-session' : ''}`} style={{ left: `${position}%` }} onClick={() => onClick(session.round)} key={`${session.iso}-${session.name}-${session.series}`} title={`${session.round.name} · ${session.name}`}><span className="event-point" /><span className="event-label"><strong>{session.name.replaceAll('_', ' ')}</strong><small>{session.round.name} · {session.series}</small><em>{timeFormat.format(session.date)}</em></span></button>; })}</div></div></div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>No sessions this week</h3><p>There are no scheduled sessions from Monday through next Monday.</p></div>}</section>;
}

function RaceDetails({ round, onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="details-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${round.name} details`}><div className="details-header"><div><p className="eyebrow accent">Round {String(round.round).padStart(2, '0')} · {rangeDateFormat.format(round.start)}</p><h2>{round.name}</h2></div><button className="close-button" onClick={onClose} aria-label="Close details">×</button></div><p className="details-timezone">All times in <strong>{localTimezone()}</strong></p><div className="session-list">{round.sessions.map((session) => <div className={`session-row ${session.name.toLowerCase() === 'race' ? 'featured' : ''}`} key={`${session.name}-${session.iso}`}><span className="session-dot" /><span className="session-name">{session.name.replaceAll('_', ' ')}</span><span className="session-date">{fullDateFormat.format(session.date)}</span><strong className="session-time">{timeFormat.format(session.date)}</strong></div>)}</div></section></div>;
}
