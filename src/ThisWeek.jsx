import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import html2canvas from 'html2canvas';
import { formatDuration, getLiveSessions, getSessionDuration, isSessionLive } from './utils/schedule.js';
import './styles/this-week.css';

export function getAllWeekSessions(data, year, currentDate, weekOffset = 0) {
  const rounds = Object.entries(data?.[year] ?? {}).flatMap(([seriesName, championship]) => (championship.rounds ?? []).map((round) => ({ ...round, series: seriesName === 'More Racing' && round.category ? round.category : seriesName, parentSeries: seriesName, championship })));
  const start = new Date(currentDate); const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day + (weekOffset * 7)); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 8);
  return rounds.flatMap((round) => Object.entries(round.details ?? {}).map(([name, iso]) => ({ name, date: iso ? new Date(iso) : null, iso, round, series: round.series, duration: getSessionDuration(round, name, round.championship) }))).filter((session) => session.date && session.date >= start && session.date < end).sort((a, b) => a.date - b.date);
}

function getWeekTitle(sessions, rangeDateFormat) {
  if (!sessions.length) return 'No Races this week :('; 
  const first = new Date(sessions[0].date); const last = new Date(sessions.at(-1).date);
  const today = new Date(); const currentDay = (today.getDay() + 6) % 7; const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - currentDay); thisMonday.setHours(0, 0, 0, 0);
  const offset = Math.round((new Date(first.getFullYear(), first.getMonth(), first.getDate()) - thisMonday) / 604800000);
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return `${rangeDateFormat.format(first)} – ${rangeDateFormat.format(last)}`;
}

export function ScreenshotButton({ targetRef, filename }) {
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
        if (target.classList.contains('details-panel')) { target.style.maxHeight = 'none'; target.style.height = 'auto'; target.style.overflow = 'visible'; }
        const watermark = clonedDocument.createElement('div');
        watermark.textContent = 'taken on 🅱️eetstop';
        watermark.style.cssText = 'position:absolute;right:18px;bottom:14px;padding:6px 9px;border-radius:4px;background:rgba(23,23,23,.82);color:#fff;font:10px "DM Mono",monospace;letter-spacing:.04em;z-index:20;';
        target.appendChild(watermark);
      } });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Screenshot could not be created');
      const file = new File([blob], `${filename}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ title: 'Beetstop race schedule', text: 'Taken on 🅱️eetstop', files: [file] });
      else { const link = document.createElement('a'); link.download = file.name; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href); }
    } catch (error) { if (error.name !== 'AbortError') console.error('Screenshot failed', error); }
    finally { if (targetRef.current?.dataset.screenshotTarget === captureId) delete targetRef.current.dataset.screenshotTarget; setBusy(false); }
  };
  return <button className="screenshot-button" type="button" data-html2canvas-ignore="true" onClick={capture} disabled={busy} aria-label="Share or download a screenshot">{busy ? 'Preparing…' : 'Share snapshot'}</button>;
}

export default function ThisWeek({ displaySettings, captureRef, sessions, totalWeekSessions = 0, now, onClick, weekOffset = 0, weekendChampionships = [], isAllSelected = true, activeSelectedSet = new Set(), onToggleAll, onToggleSeries, onPrevious = () => window.dispatchEvent(new CustomEvent('beetstop:previous-week')), onNext = () => window.dispatchEvent(new CustomEvent('beetstop:next-week')) }) {
  const { timezoneLabel, timeFormat, fullDateFormat, rangeDateFormat } = displaySettings;
  const liveSessions = getLiveSessions(sessions, now);
  const next = liveSessions[0] ?? sessions.find((session) => session.date > now);
  const currentSessionIndex = weekOffset === 0 ? sessions.findIndex((session) => session.date > now) : -1;
  const liveSessionIndex = sessions.findIndex((session) => isSessionLive(session, now));
  const markerSessionIndex = liveSessionIndex >= 0 ? liveSessionIndex : currentSessionIndex === -1 ? sessions.length - 1 : currentSessionIndex;
  const hasCurrentMarker = weekOffset === 0 && markerSessionIndex >= 0;
  const selectedSubtitle = useMemo(() => {
    if (weekendChampionships.length === 0) return 'No championships scheduled';
    if (isAllSelected) return 'All championships';
    return `${activeSelectedSet.size} of ${weekendChampionships.length} championships`;
  }, [weekendChampionships, isAllSelected, activeSelectedSet]);
  const scrollToToday = () => { const marker = document.getElementById('current-time-marker'); if (!marker) return; window.scrollTo({ top: marker.getBoundingClientRect().top + window.scrollY - (window.innerHeight / 2), behavior: 'smooth' }); };

  return <section className="vertical-week"><div className="page-heading week-heading"><div><p className="eyebrow accent">Live schedule <span className="heading-rule" /></p><h1>{getWeekTitle(sessions, rangeDateFormat)}</h1><p className="subheading">{selectedSubtitle} · {timezoneLabel} · Monday through next Monday</p></div><div className="week-toolbar"><button className="today-filter" type="button" disabled={!hasCurrentMarker} onClick={scrollToToday}>Today</button><ScreenshotButton targetRef={captureRef} filename="beetstop-this-week" /><div className="week-controls"><button onClick={onPrevious} aria-label="Previous week"><ChevronLeft size={17} strokeWidth={2.25} aria-hidden="true" /></button><span className="week-session-count">{sessions.length} sessions</span><button onClick={onNext} aria-label="Next week"><ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" /></button></div></div></div>{weekendChampionships.length > 0 && <div className="category-filter-bar week-filter-bar"><button type="button" className={`category-filter-pill ${isAllSelected ? 'active' : ''}`} onClick={onToggleAll}>All championships <span className="count-pill">{totalWeekSessions}</span></button>{weekendChampionships.map((champ) => { const isSelected = !isAllSelected && activeSelectedSet.has(champ.name); return <button type="button" key={champ.name} className={`category-filter-pill ${isSelected ? 'active' : ''}`} onClick={() => onToggleSeries(champ.name)}><span className="pill-logo">{champ.name.slice(0, 2).toUpperCase()}</span><span>{champ.name}</span><span className="count-pill">{champ.count}</span></button>; })}</div>}<div className="tree-timeline" ref={captureRef} data-screenshot-target>{sessions.map((session, index) => { const live = isSessionLive(session, now); return <button className={`tree-event ${index % 2 ? 'tree-right' : 'tree-left'} ${session === next ? 'tree-next' : ''} ${live ? 'tree-live' : ''}`} key={`${session.iso}-${session.series}-${session.name}`} onClick={() => onClick(session.round)}>{index === markerSessionIndex && hasCurrentMarker && <span id="current-time-marker" className="current-week-marker" aria-label={`Current local time: ${timeFormat.format(now)}`}><span>{timeFormat.format(now)}</span></span>}<span className="tree-node">{session.name.toLowerCase() === 'race' ? '◆' : '•'}</span><span className="tree-card"><small>{fullDateFormat.format(session.date)} · {timeFormat.format(session.date)}</small><strong>{session.round.name}</strong><em>{session.name.replaceAll('_', ' ')} · {session.series}{formatDuration(session.duration) ? ` · ${formatDuration(session.duration)}` : ''}</em>{live && <span className="live-badge">Live now</span>}</span></button>; })}</div>{!sessions.length && <div className="empty-state timeline-empty"><span>◎</span><h3>{weekendChampionships.length > 0 && activeSelectedSet.size === 0 ? 'No championships selected' : 'No sessions this week'}</h3><p>{weekendChampionships.length > 0 && activeSelectedSet.size === 0 ? 'Click one or more championships above to view scheduled sessions.' : weekendChampionships.length > 0 ? 'No sessions match the selected championships.' : 'There are no scheduled sessions from Monday through next Monday.'}</p></div>}</section>;
}
