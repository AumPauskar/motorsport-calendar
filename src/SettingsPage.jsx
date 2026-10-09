import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

function getTimezoneOffset(timeZone) {
  try {
    const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    return offset === 'GMT' ? 'UTC+00:00' : offset.replace(/^GMT/, 'UTC');
  } catch {
    return 'UTC+00:00';
  }
}

function getTimezoneOptions() {
  const fallback = ['UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Athens', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : fallback;
  return Array.from(new Set(['UTC', ...zones])).map((value) => {
    const offset = getTimezoneOffset(value);
    const match = offset.match(/^UTC([+-])(\d{2}):(\d{2})$/);
    const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 0;
    return { value, label: value.replaceAll('_', ' '), offset, offsetMinutes };
  }).sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label));
}

const timezoneOptions = getTimezoneOptions();

export default function SettingsPage({ settings, setSettings, championships, onLandingPage, timezoneLabel }) {
  return <section className="settings-page">
    <header className="page-heading settings-page-heading"><div><p className="eyebrow accent">Preferences <span className="heading-rule" /></p><h1>Settings</h1></div></header>
    <div className="settings-groups">
      <section className="settings-group"><div><p className="eyebrow accent">Startup</p><h2>Landing page</h2></div><label className="settings-field"><span>Open on</span><StyledDropdown id="landing-page" label="Landing page" value={settings.landingPage === 'week' ? 'week' : championships.includes(settings.landingPage) ? settings.landingPage : championships[0] ?? 'week'} options={[{ value: 'week', label: 'This week', description: 'Weekly overview' }, ...championships.map((name) => ({ value: name, label: name, description: 'Season calendar' }))]} onChange={onLandingPage} /></label></section>
      <section className="settings-group"><div><p className="eyebrow accent">Display</p><h2>Date &amp; time</h2></div><label className="settings-field"><span>Format</span><StyledDropdown id="date-time-format" label="Date and time format" value={settings.dateTimeFormat} options={[{ value: 'auto', label: 'Automatic', description: 'Use browser preferences' }, { value: 'manual', label: 'Manual override', description: 'Choose date and clock formats' }]} onChange={(value) => setSettings((current) => ({ ...current, dateTimeFormat: value }))} /></label>{settings.dateTimeFormat === 'manual' && <><label className="settings-field"><span>Date order</span><StyledDropdown id="date-order" label="Date order" value={settings.dateStyle} options={[{ value: 'dmy', label: 'DD / MM / YYYY', description: 'Day, month, year' }, { value: 'mdy', label: 'MM / DD / YYYY', description: 'Month, day, year' }, { value: 'ymd', label: 'YYYY / MM / DD', description: 'Year, month, day' }]} onChange={(value) => setSettings((current) => ({ ...current, dateStyle: value }))} /></label><label className="settings-field"><span>Clock</span><StyledDropdown id="clock-format" label="Clock format" value={settings.timeStyle} options={[{ value: '12', label: '12-hour', description: 'AM / PM clock' }, { value: '24', label: '24-hour', description: '00:00 clock' }]} onChange={(value) => setSettings((current) => ({ ...current, timeStyle: value }))} /></label></>}</section>
      <section className="settings-group"><div><p className="eyebrow accent">Time</p><h2>Timezone</h2></div><label className="settings-field"><span>Timezone</span><StyledDropdown id="timezone-mode" label="Timezone mode" value={settings.timezoneMode} options={[{ value: 'auto', label: 'Automatic', description: timezoneLabel }, { value: 'manual', label: 'Manual override', description: 'Choose an IANA timezone' }]} onChange={(value) => setSettings((current) => ({ ...current, timezoneMode: value }))} /></label>{settings.timezoneMode === 'manual' && <label className="settings-field"><span>IANA timezone</span><TimezoneSelect value={settings.manualTimezone} onChange={(value) => setSettings((current) => ({ ...current, manualTimezone: value }))} /></label>}</section>
    </div>
  </section>;
}

export function StyledDropdown({ id, label, value, options, onChange }) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef(null);
  const listId = `${id}-options`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const choose = (index) => {
    onChange(options[index].value);
    setActiveIndex(index);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => (current + direction + options.length) % options.length);
      }
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return <div className={`landing-select ${open ? 'is-open' : ''}`} ref={rootRef}>
    <button className="landing-select-trigger" type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined} onClick={() => { setActiveIndex(selectedIndex); setOpen((current) => !current); }} onKeyDown={handleKeyDown}>
      <span className="landing-select-copy"><strong>{options[selectedIndex].label}</strong><small>{options[selectedIndex].description}</small></span>
      <span className="landing-select-chevron" aria-hidden="true"><ChevronDown size={16} strokeWidth={2.25} /></span>
    </button>
    {open && <div className="landing-select-menu" id={listId} role="listbox" aria-label={`Choose ${label.toLowerCase()}`}>
      {options.map((option, index) => <div className={`landing-select-option ${index === selectedIndex ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`} id={`${listId}-${index}`} key={option.value} role="option" aria-selected={index === selectedIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)}>
        <span className="landing-option-mark" aria-hidden="true">{index === selectedIndex ? '✓' : index === 0 ? 'W' : option.label.slice(0, 1)}</span>
        <span className="landing-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
        {index === selectedIndex && <span className="landing-option-check" aria-hidden="true">Selected</span>}
      </div>)}
    </div>}
  </div>;
}

function TimezoneSelect({ value, onChange }) {
  const selected = timezoneOptions.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = 'timezone-options';
  const filteredOptions = timezoneOptions.filter((option) => `${option.value} ${option.label} ${option.offset}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    searchRef.current?.focus();
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  const choose = (option) => {
    onChange(option.value);
    close(true);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(Math.max(0, timezoneOptions.findIndex((option) => option.value === value)));
        setOpen(true);
      } else if (filteredOptions.length) {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => (current + direction + filteredOptions.length) % filteredOptions.length);
      }
    } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    }
  };

  const openPicker = () => {
    const selectedIndex = timezoneOptions.findIndex((option) => option.value === value);
    setActiveIndex(Math.max(0, selectedIndex));
    setQuery('');
    setOpen(true);
  };

  return <div className={`landing-select timezone-select ${open ? 'is-open' : ''}`} ref={rootRef}>
    <button className="landing-select-trigger" type="button" aria-label={`Timezone: ${selected?.label ?? value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => open ? close() : openPicker()} ref={triggerRef}>
      <span className="landing-select-copy"><strong>{selected?.offset ?? 'UTC+00:00'}</strong><small>{selected?.label ?? value}</small></span>
      <span className="landing-select-chevron" aria-hidden="true"><ChevronDown size={16} strokeWidth={2.25} /></span>
    </button>
    {open && <div className="landing-select-menu timezone-select-menu">
      <div className="timezone-search-wrap"><input className="timezone-search-input" type="search" role="combobox" aria-label="Search timezones" aria-autocomplete="list" aria-expanded="true" aria-controls={`${listId}-list`} aria-activedescendant={filteredOptions.length ? `${listId}-${activeIndex}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Search city or UTC offset" ref={searchRef} /></div>
      <div className="timezone-results" id={`${listId}-list`} role="listbox" aria-label="Timezones">
        {filteredOptions.length ? filteredOptions.map((option, index) => <div className={`landing-select-option timezone-option ${option.value === value ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`} id={`${listId}-${index}`} key={option.value} role="option" aria-selected={option.value === value} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
          <span className="timezone-offset">{option.offset}</span>
          <span className="landing-option-copy"><strong>{option.label}</strong><small>{option.value}</small></span>
          {option.value === value && <span className="landing-option-check" aria-hidden="true">Selected</span>}
        </div>) : <p className="timezone-no-results">No matching timezones</p>}
      </div>
    </div>}
  </div>;
}
