const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TIME_PATTERN.test(trimmed) ? trimmed : null;
}

function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function isValidSchedule(startTime, endTime) {
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);

  return Boolean(start && end && start !== end);
}

function isWithinSchedule(date, startTime, endTime) {
  if (!isValidSchedule(startTime, endTime)) return false;

  const current = (date.getHours() * 60) + date.getMinutes();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function getRadioStatus(date, enabled, startTime, endTime) {
  if (!enabled) {
    return { canPlay: false, mode: 'stopped', message: 'Radio is stopped by the administrator.' };
  }

  if (!isValidSchedule(startTime, endTime)) {
    return { canPlay: false, mode: 'invalid_schedule', message: 'Radio schedule is invalid.' };
  }

  if (isWithinSchedule(date, startTime, endTime)) {
    return { canPlay: true, mode: 'active', message: 'Radio is active.' };
  }

  return { canPlay: false, mode: 'outside_schedule', message: 'Radio is outside the allowed schedule.' };
}

module.exports = {
  normalizeTime,
  isValidSchedule,
  isWithinSchedule,
  getRadioStatus,
};