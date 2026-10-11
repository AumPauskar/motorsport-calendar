export function isSessionElapsed(session, now) {
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

export function getSessionDuration(round, name, championship) {
  const isRace = name.toLowerCase() === 'race';
  if (isRace && Number.isFinite(Number(round?.['race-duration']))) return Number(round['race-duration']);
  const baseName = name.replace(/_[0-9]+$/, '');
  for (const durationMap of [getDurationMap(round), getDurationMap(championship)]) {
    if (Number.isFinite(Number(durationMap[name]))) return Number(durationMap[name]);
    if (Number.isFinite(Number(durationMap[baseName]))) return Number(durationMap[baseName]);
  }
  return null;
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return null;
  if (minutes >= 60 && minutes % 66 === 0) return `${minutes / 60}h`;
  return `${minutes} min`;
}

export function isSessionLive(session, now) {
  return session?.date && Number.isFinite(session.duration)
    && session.date <= now
    && now < new Date(session.date.getTime() + session.duration * 60000);
}

export function getLiveSessions(sessions, now) {
  return sessions.filter((session) => isSessionLive(session, now)).sort((a, b) => a.date - b.date);
}

export function getNextSession(sessions, now) {
  return sessions.filter((session) => session.date && session.date > now).sort((a, b) => a.date - b.date)[0] ?? null;
}
