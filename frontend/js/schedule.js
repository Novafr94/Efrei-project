// frontend/js/schedule.js
// Static schedule — replaced by /api/radio/schedule in Bloc 3

const schedule = {
  today: [
    { time: '06:00', label: 'Morning Jazz' },
    { time: '09:00', label: 'Swing & Big Band' },
    { time: '12:00', label: 'Blues Hour' },
    { time: '15:00', label: 'Bebop Session' },
    { time: '18:00', label: "Soul & R'n'B" },
    { time: '21:00', label: 'Evening Standards' },
    { time: '23:00', label: 'Late Night Bossa' },
  ],
  tomorrow: [
    { time: '06:00', label: 'Morning Jazz' },
    { time: '09:00', label: 'Boogie & Ragtime' },
    { time: '12:00', label: 'Gospel & Soul' },
    { time: '15:00', label: 'Classic Bebop' },
    { time: '18:00', label: "Soul & R'n'B" },
    { time: '21:00', label: 'Crooners & Ballads' },
    { time: '23:00', label: 'Late Night Bossa' },
  ]
};

function activeIndex(slots) {
  const now = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  let idx = 0;
  slots.forEach((s, i) => { if (s.time <= now) idx = i; });
  return idx;
}

const panel = document.getElementById('schedule-panel');

function renderSchedule(day) {
  const slots  = schedule[day];
  const actIdx = day === 'today' ? activeIndex(slots) : -1;

  panel.innerHTML = slots.map((slot, i) => {
    const isNow = i === actIdx;
    return `<li class="schedule-item${isNow ? ' is-now' : ''}">
      <span class="schedule-time">${slot.time}</span>
      <span class="schedule-label">${slot.label}</span>
      ${isNow ? '<span class="now-dot" aria-label="Now playing"></span>' : ''}
    </li>`;
  }).join('');

  if (actIdx > -1) {
    const el = panel.querySelectorAll('.schedule-item')[actIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}

document.querySelectorAll('.schedule-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.schedule-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    panel.setAttribute('aria-labelledby', tab.id);
    renderSchedule(tab.dataset.day);
  });
});

renderSchedule('today');
