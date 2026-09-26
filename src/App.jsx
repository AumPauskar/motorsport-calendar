import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import raceData from '../data.json';
import './styles.css';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const rangeDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const localTimezone = () => timezone.replaceAll('_', ' ');
const formatOrNull = (formatter, value) => value ? formatter.format(value) : 'null';

function getRounds(data, year, series) {
  const championship = data?.[year]?.[series] ?? {};
  return (championship.rounds ?? []).map((round) => {
    const sessions = Object.entries(round.details ?? {}).map(([name, iso]) => ({
      name,
      date: iso ? new Date(iso) : null,
      iso,
      duration: getSessionDuration(round, name, championship),
    }));
    const datedSessions = sessions.filter((session) => session.date);
    return { ...round, sessions, start: datedSessions[0]?.date ?? null, finish: datedSessions.at(-1)?.date ?? null };
  }).sort((a, b) => Number(a.round) - Number(b.round));
}

function isRoundElapsed(round, now) {
  const datedSessions = round.sessions.filter((session) => session.date && !Number.isNaN(session.date.getTime()));
  if (!datedSessions.length) return false;
  const lastSession = datedSessions.reduce((latest, session) => session.date > latest.date ? session : latest);
  return isSessionElapsed(lastSession, now);
}

function isSessionElapsed(session, now) {
  if (!session?.date || Number.isNaN(session.date.getTime())) return false;
  const completion = Number.isFinite(session.duration)
    ? new Date(session.date.getTime() + session.duration * 60000)
    : session.date;
  return completion <= now;
}

function getDurationMap(championship) {
  const configured = championship?.['round-duration'];
  if (Array.isArray(configured)) return configured.find((item) => item && typeof item === 'object') ?? {};
  return configured && typeof configured === 'object' ? configured : {};
}

function getSessionDuration(round, name, championship) {
  const isRace = name.toLowerCase() === 'race';
  if (isRace && Number.isFinite(Number(round?.['race-duration']))) return Number(round['race-duration']);
  const durationMap = getDurationMap(championship);
  if (Number.isFinite(Number(durationMap[name]))) return Number(durationMap[name]);
  const baseName = name.replace(/_[0-9]+$/, '');
  return Number.isFinite(Number(durationMap[baseName])) ? Number(durationMap[baseName]) : null;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return null;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes} min`;
}

function isSessionLive(session, now) {
  return session?.date && Number.isFinite(session.duration)
    && session.date <= now
    && now < new Date(session.date.getTime() + session.duration * 60000);
}

function getLiveSessions(sessions, now) {
  return sessions.filter((session) => isSessionLive(session, now)).sort((a, b) => a.date - b.date);
}

function getNextSession(sessions, now) {
  return sessions.filter((session) => session.date && session.date > now).sort((a, b) => a.date - b.date)[0] ?? null;
}

function googleCalendarUrl(session, roundName) {
  if (!session?.date) return null;
  const end = Number.isFinite(session.duration)
    ? new Date(session.date.getTime() + session.duration * 60000)
    : new Date(session.date.getTime() + 60 * 60000);
  const dateValue = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.000Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${roundName} — ${session.name.replaceAll('_', ' ')}`,
    dates: `${dateValue(session.date)}/${dateValue(end)}`,
    details: `Motorsport session${formatDuration(session.duration) ? ` · ${formatDuration(session.duration)}` : ''}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function App() {
  const [data, setData] = useState(null);
  const [year, setYear] = useState('');
  const [series, setSeries] = useState('');
  const [selectedRound, setSelectedRound] = useState(null);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('beetstop-theme') || 'auto');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState('calendar');
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedSeries, setExpandedSeries] = useState('');
  const weekCaptureRef = useRef(null);

  useEffect(() => { const years = Object.keys(raceData).sort((a, b) => b - a); const initialYear = years.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : years[0]; setData(raceData); setYear(initialYear); setSeries(Object.keys(raceData[initialYear] ?? {})[0] ?? ''); }, []);
  const dark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('beetstop-theme', themeMode); }, [dark, themeMode]);
  useEffect(() => { const media = window.matchMedia?.('(prefers-color-scheme: dark)'); if (!media) return undefined; const update = (event) => setSystemDark(event.matches); media.addEventListener?.('change', update); return () => media.removeEventListener?.('change', update); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const previous = () => setWeekOffset((offset) => Math.max(0, offset - 1)); const next = () => setWeekOffset((offset) => offset + 1); window.addEventListener('beetstop:previous-week', previous); window.addEventListener('beetstop:next-week', next); return () => { window.removeEventListener('beetstop:previous-week', previous); window.removeEventListener('beetstop:next-week', next); }; }, []);

  const years = useMemo(() => Object.keys(data ?? {}).sort((a, b) => b - a), [data]);
  const championships = useMemo(() => Object.keys(data?.[year] ?? {}), [data, year]);
  const championshipGroups = useMemo(() => getChampionshipGroups(data?.[year] ?? {}), [data, year]);
  const rounds = useMemo(() => getRounds(data, year, series), [data, year, series]);
  const activeRounds = useMemo(() => rounds.filter((round) => !isRoundElapsed(round, now)), [rounds, now]);
  const elapsedRounds = useMemo(() => rounds.filter((round) => isRoundElapsed(round, now)), [rounds, now]);
  const seriesSessions = useMemo(() => rounds.flatMap((round) => round.sessions.map((session) => ({ ...session, round }))), [rounds]);
  const liveSeriesSessions = useMemo(() => getLiveSessions(seriesSessions, now), [seriesSessions, now]);
  const nextSession = useMemo(() => getNextSession(seriesSessions, now), [seriesSessions, now]);
  const weekSessions = useMemo(() => getAllWeekSessions(data, year, now, weekOffset), [data, year, now, weekOffset]);
  const [weekSeriesFilter, setWeekSeriesFilter] = useState('all');
  const [weekFilterInverted, setWeekFilterInverted] = useState(false);
  const filteredWeekSessions = useMemo(() => {
    if (weekSeriesFilter === 'all') return weekSessions;
    return weekSessions.filter((session) => weekFilterInverted ? session.series !== weekSeriesFilter : session.series === weekSeriesFilter);
  }, [weekSessions, weekSeriesFilter, weekFilterInverted]);

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
      <div className="brand-row"><a className="brand" href="/"><span className="brand-mark">B</span><span>🅱️eetstop</span></a><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button></div>
      <div className="sidebar-scroll">
        <div className="sidebar-section"><p className="eyebrow">Season</p><label className="select-wrap"><span className="sr-only">Select season</span><select value={year} onChange={(event) => changeYear(event.target.value)}>{years.map((item) => <option value={item} key={item}>{item} season</option>)}</select><span className="select-chevron">⌄</span></label></div>
        <div className="sidebar-section"><button className={`series-item week-sidebar-item ${page === 'week' ? 'active' : ''}`} onClick={() => { setPage('week'); setWeekOffset(0); setSidebarOpen(false); }}><span className="series-logo">↗</span><span>This week</span></button></div>
        <div className="sidebar-section"><div className="section-heading"><p className="eyebrow">Championships</p><span className="count-pill">{championships.length}</span></div><ChampionshipList groups={championshipGroups} page={page} series={series} expandedSeries={expandedSeries} setExpandedSeries={setExpandedSeries} onSelect={(item) => { setSeries(item); setPage('calendar'); setSelectedRound(null); setSidebarOpen(false); }} /></div>
        <div className="sidebar-note"><span className="note-icon">◒</span><div><strong>Your local time</strong><p>{localTimezone()}</p></div></div>
      </div><div className="sidebar-footer"><span>Race calendar</span><span className="live-dot" /></div>
    </aside>
    <main className="main-content"><header className="topbar"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button><div className="breadcrumb">{page === 'week' ? <strong>This week</strong> : <><span>Calendar</span><span className="slash">/</span><strong>{series}</strong></>}</div><div className="top-actions"><button className={`theme-toggle ${themeMode}`} onClick={() => setThemeMode((mode) => mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light')} aria-label={`Theme: ${themeMode}. Click to switch.`}><span>☼</span><span className={`theme-track mode-${themeMode}`}><i /></span><span className="auto-label">A</span><span>☾</span></button></div></header>
      <div className="content-wrap">{page === 'calendar' ? <><NextEventBanner sessions={liveSeriesSessions.length ? liveSeriesSessions : nextSession ? [nextSession] : []} now={now} onClick={goToRound} /><section className="page-heading"><div><p className="eyebrow accent">Race calendar <span className="heading-rule" /></p><h1>{series} <span>{year}</span></h1><p className="subheading">{rounds.length} race weekends · Times shown in {localTimezone()}</p></div></section><RaceWeekendSection title="Race weekends" rounds={activeRounds} onSelect={setSelectedRound} emptyMessage="No upcoming race weekends" />{elapsedRounds.length > 0 && <RaceWeekendSection title="Elapsed race weekends" rounds={elapsedRounds} onSelect={setSelectedRound} elapsed />}</> : <><NextEventBanner sessions={getLiveSessions(filteredWeekSessions, now).length ? getLiveSessions(filteredWeekSessions, now) : (() => { const next = getNextSession(filteredWeekSessions, now); return next ? [next] : []; })()} now={now} onClick={goToRound} /><VerticalWeekTimeline captureRef={weekCaptureRef} sessions={filteredWeekSessions} now={now} weekOffset={weekOffset} seriesGroups={championshipGroups} seriesFilter={weekSeriesFilter} setSeriesFilter={(value) => { setWeekSeriesFilter(value); setWeekFilterInverted(false); }} filterInverted={weekFilterInverted} setFilterInverted={setWeekFilterInverted} onClick={goToRound} /></>}
        </div></main><div className={`scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />{selectedRound && <RaceDetails round={selectedRound} now={now} onClose={() => setSelectedRound(null)} />}
  </div>;
}

function NextEventBanner({ sessions, now, onClick }) {
  if (!sessions.length) return <div className="next-event-banner empty"><span className="next-event-kicker">Next up</span><strong>No upcoming sessions in this season</strong></div>;
  return <div className={`next-event-banner ${sessions.length > 1 ? 'has-multiple' : ''}`}>{sessions.map((session) => {
    const live = isSessionLive(session, now);
    const end = live ? new Date(session.date.getTime() + session.duration * 60000) : null;
    const remaining = Math.max(0, (live ? end : session.date) - now);
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return <button className={`next-event-item ${live ? 'is-live' : ''}`} onClick={() => onClick(session.round)} key={`${session.series ?? ''}-${session.iso}-${session.name}`}><span className="next-event-kicker"><i />{live ? 'Live now' : 'Next session'}</span><span className="next-event-copy"><strong>{session.round.name}</strong><small>{session.name.replaceAll('_', ' ')} · {live ? `ends ${timeFormat.format(end)}` : `${fullDateFormat.format(session.date)} at ${timeFormat.format(session.date)}`}{formatDuration(session.duration) ? ` · ${formatDuration(session.duration)}` : ''}</small></span>{live ? <span className="live-status">LIVE</span> : <span className="countdown" aria-label={`Starts in ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`}><b>{String(days).padStart(2, '0')}</b><em>d</em><b>{String(hours).padStart(2, '0')}</b><em>h</em><b>{String(minutes).padStart(2, '0')}</b><em>m</em><b>{String(seconds).padStart(2, '0')}</b><em>s</em></span>}<span className="next-event-arrow">↗</span></button>;
  })}</div>;
}

function RaceCard({ round, onClick }) {
  const mainRace = round.sessions.find((session) => session.name.toLowerCase() === 'race') ?? round.sessions.at(-1);
  return <button id={`race-round-${round.round}`} className="race-card" onClick={onClick}><div className="card-topline"><span>Round {String(round.round).padStart(2, '0')}</span><span className="card-arrow">↗</span></div><h3>{round.name}</h3><div className="card-date-range"><span>{formatOrNull(rangeDateFormat, round.start)}</span><span className="range-line" /><span>{formatOrNull(rangeDateFormat, round.finish)}</span></div><div className="main-race"><span className="race-flag">◆</span><span><small>Main race{formatDuration(mainRace?.duration) ? ` · ${formatDuration(mainRace.duration)}` : ''}</small><strong>{formatOrNull(fullDateFormat, mainRace?.date)} · {formatOrNull(timeFormat, mainRace?.date)}</strong></span></div></button>;
}

function RaceWeekendSection({ title, rounds, onSelect, elapsed = false, emptyMessage = 'No races scheduled yet' }) {
  return <section className={`race-section ${elapsed ? 'elapsed-race-section' : ''}`}><div className="section-heading large"><div><p className="eyebrow accent">{elapsed ? 'History' : 'The season'}</p><h2>{title}</h2></div><span className="race-count">{rounds.length} rounds</span></div>{rounds.length ? <div className="race-grid">{rounds.map((round) => <RaceCard key={round.round} round={round} onClick={() => onSelect(round)} />)}</div> : <div className="empty-state"><span>◎</span><h3>{emptyMessage}</h3><p>{elapsed ? 'Completed race weekends will appear here.' : 'Add rounds to data.json to see them here.'}</p></div>}</section>;
}

function getAllWeekSessions(data, year, currentDate, weekOffset = 0) {
  const rounds = Object.entries(data?.[year] ?? {}).flatMap(([seriesName, championship]) => (championship.rounds ?? []).map((round) => ({ ...round, series: seriesName, championship })));
  const start = new Date(currentDate); const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day + (weekOffset * 7)); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 8);
  return rounds.flatMap((round) => Object.entries(round.details ?? {}).map(([name, iso]) => ({ name, date: iso ? new Date(iso) : null, iso, round, series: round.series, duration: getSessionDuration(round, name, round.championship) }))).filter((session) => session.date && session.date >= start && session.date < end).sort((a, b) => a.date - b.date);
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

function ScreenshotButton({ targetRef, filename }) {
  const [busy, setBusy] = useState(false);
  const captureId = useRef(`screenshot-${Math.random().toString(36).slice(2)}`).current;
  const capture = async () => {
    if (!targetRef.current || busy) return;
    setBusy(true);
    targetRef.current.dataset.screenshotTarget = captureId;
    try {
      const canvas = await html2canvas(targetRef.current, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fbfaf7', scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, onclone: (clonedDocument) => {
        const target = clonedDocument.querySelector(`[data-screenshot-target="${captureId}"]`);
        if (!target) return;
        target.style.position = 'relative';
        const watermark = clonedDocument.createElement('div');
        watermark.textContent = 'taken on 🅱️eetstop';
        watermark.style.cssText = 'position:absolute;right:18px;bottom:14px;padding:6px 9px;border-radius:4px;background:rgba(23,23,23,.82);color:#fff;font:10px "DM Mono",monospace;letter-spacing:.04em;z-index:20;';
        target.appendChild(watermark);
      } });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Screenshot could not be created');
      const file = new File([blob], `${filename}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Beetstop race schedule', text: 'Taken on 🅱️eetstop', files: [file] });
      } else {
        const link = document.createElement('a');
        link.download = file.name;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Screenshot failed', error);
    } finally {
      if (targetRef.current?.dataset.screenshotTarget === captureId) delete targetRef.current.dataset.screenshotTarget;
      setBusy(false);
    }
  };
  return <button className="screenshot-button" type="button" data-html2canvas-ignore="true" onClick={capture} disabled={busy} aria-label="Share or download a screenshot">{busy ? 'Preparing…' : 'Share snapshot'}</button>;
}

function VerticalWeekTimeline({ captureRef, sessions, now, onClick, weekOffset = 0, seriesGroups = [], seriesFilter, setSeriesFilter, filterInverted, setFilterInverted, onPrevious = () => window.dispatchEvent(new CustomEvent('beetstop:previous-week')), onNext = () => window.dispatchEvent(new CustomEvent('beetstop:next-week')) }) {
  const liveSessions = getLiveSessions(sessions, now);
  const next = liveSessions[0] ?? sessions.find((session) => session.date > now);
  const currentSessionIndex = weekOffset === 0 ? sessions.findIndex((session) => session.date > now) : -1;
  const liveSessionIndex = sessions.findIndex((session) => isSessionLive(session, now));
  const markerSessionIndex = liveSessionIndex >= 0 ? liveSessionIndex : currentSessionIndex === -1 ? sessions.length - 1 : currentSessionIndex;
  const hasCurrentMarker = weekOffset === 0 && markerSessionIndex >= 0;
  const scrollToToday = () => {
    const marker = document.getElementById('current-time-marker');
    if (!marker) return;
    const target = marker.getBoundingClientRect().top + window.scrollY - (window.innerHeight / 2);
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };
  return <section className="vertical-week"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>{getWeekTitle(sessions)}</h1><p className="subheading">{seriesFilter === 'all' ? 'All championships' : `${filterInverted ? 'All except' : 'Only'} ${seriesFilter}`} · {localTimezone()} · Monday through next Monday</p></div><div className="week-toolbar"><label className="week-filter"><span>Series</span><select value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)} aria-label="Filter this week by series"><option value="all">All series</option>{seriesGroups.map((group) => <optgroup label={group.name} key={group.name}><option value={group.name}>All {group.name}</option>{group.children.map((child) => <option value={child} key={child}>↳ {child}</option>)}</optgroup>)}</select></label><button className="invert-filter" type="button" disabled={seriesFilter === 'all'} aria-pressed={filterInverted} onClick={() => setFilterInverted((value) => !value)}>Invert</button><button className="today-filter" type="button" disabled={!hasCurrentMarker} onClick={scrollToToday}>Today</button><ScreenshotButton targetRef={captureRef} filename="beetstop-this-week" /><div className="week-controls"><button onClick={onPrevious} aria-label="Previous week">‹</button><span className="week-session-count">{sessions.length} sessions</span><button onClick={onNext} aria-label="Next week">›</button></div></div></div><div className="tree-timeline" ref={captureRef} data-screenshot-target>{sessions.map((session, index) => { const live = isSessionLive(session, now); return <button className={`tree-event ${index % 2 ? 'tree-right' : 'tree-left'} ${session === next ? 'tree-next' : ''} ${live ? 'tree-live' : ''}`} key={`${session.iso}-${session.series}-${session.name}`} onClick={() => onClick(session.round)}>{index === markerSessionIndex && hasCurrentMarker && <span id="current-time-marker" className="current-week-marker" aria-label={`Current local time: ${timeFormat.format(now)}`}><span>{timeFormat.format(now)}</span></span>}<span className="tree-node">{session.name.toLowerCase() === 'race' ? '◆' : '•'}</span><span className="tree-card"><small>{fullDateFormat.format(session.date)} · {timeFormat.format(session.date)}</small><strong>{session.round.name}</strong><em>{session.name.replaceAll('_', ' ')} · {session.series}{formatDuration(session.duration) ? ` · ${formatDuration(session.duration)}` : ''}</em>{live && <span className="live-badge">Live now</span>}</span></button>; })}</div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>No sessions this week</h3><p>{seriesFilter === 'all' ? 'There are no scheduled sessions from Monday through next Monday.' : 'No sessions match this series filter.'}</p></div>}</section>;
}

function LegacyWeekTimeline({ sessions, now, onClick }) {
  const next = sessions.find((session) => session.date > now);
  return <section className="vertical-week"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>{getWeekTitle(sessions)}</h1><p className="subheading">All championships · {localTimezone()} · Monday through next Monday</p></div><div className="week-controls"><button onClick={() => window.dispatchEvent(new CustomEvent('beetstop:previous-week'))} aria-label="Previous week">‹</button><span className="week-session-count">{sessions.length} sessions</span><button onClick={() => window.dispatchEvent(new CustomEvent('beetstop:next-week'))} aria-label="Next week">›</button></div></div><div className="tree-timeline">{sessions.map((session, index) => <button className={`tree-event ${index % 2 ? 'tree-right' : 'tree-left'} ${session === next ? 'tree-next' : ''}`} key={`${session.iso}-${session.series}-${session.name}`} onClick={() => onClick(session.round)}><span className="tree-node">{session.name.toLowerCase() === 'race' ? '◆' : '•'}</span><span className="tree-card"><small>{fullDateFormat.format(session.date)} · {timeFormat.format(session.date)}</small><strong>{session.round.name}</strong><em>{session.name.replaceAll('_', ' ')} · {session.series}</em></span></button>)}</div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>No sessions this week</h3><p>There are no scheduled sessions from Monday through next Monday.</p></div>}</section>;
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

function RaceDetails({ round, now, onClose }) {
  const detailsRef = useRef(null);
  return <div className="modal-backdrop" onClick={onClose}><section ref={detailsRef} data-screenshot-target className="details-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${round.name} details`}><div className="details-header"><div><p className="eyebrow accent">Round {String(round.round).padStart(2, '0')} · {formatOrNull(rangeDateFormat, round.start)}</p><h2>{round.name}</h2></div><div className="details-actions"><ScreenshotButton targetRef={detailsRef} filename={`${round.name.replaceAll(' ', '-').toLowerCase()}-details`} /><button className="close-button" onClick={onClose} aria-label="Close details">×</button></div></div><p className="details-timezone">All times in <strong>{localTimezone()}</strong></p><div className="session-list">{round.sessions.map((session) => { const calendarUrl = isSessionElapsed(session, now) ? null : googleCalendarUrl(session, round.name); return <div className={`session-row ${session.name.toLowerCase() === 'race' ? 'featured' : ''}`} key={`${session.name}-${session.iso}`}><span className="session-dot" /><span className="session-name">{session.name.replaceAll('_', ' ')}{calendarUrl && <a className="calendar-icon" href={calendarUrl} target="_blank" rel="noreferrer" data-html2canvas-ignore="true" aria-label={`Add ${session.name.replaceAll('_', ' ')} to Google Calendar`}>📅</a>}</span><span className="session-date">{formatOrNull(fullDateFormat, session.date)}</span><strong className="session-time">{formatOrNull(timeFormat, session.date)}{formatDuration(session.duration) ? <small className="session-duration">{formatDuration(session.duration)}</small> : null}</strong></div>; })}</div></section></div>;
}
