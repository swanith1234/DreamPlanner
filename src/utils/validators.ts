export const validateEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

export const validateTimeFormat = (time: string): boolean => {
  const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(time);
};

export const isWithinQuietHours = (
  quietHours: any[],
  currentTime: string // "HH:MM"
): boolean => {
  if (!Array.isArray(quietHours) || quietHours.length === 0) return false;

  const [hours, mins] = currentTime.split(':').map(Number);
  const currentMinutes = hours * 60 + mins;

  return quietHours.some((period: any) => {
    const [startH, startM] = period.start.split(':').map(Number);
    const [endH, endM] = period.end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    return currentMinutes >= startMins && currentMinutes < endMins;
  });
};

export const isWithinSleepCycle = (
  sleepStart: string, // "23:30"
  sleepEnd: string,   // "06:30"
  currentTime: string // "HH:MM"
): boolean => {
  const [hours, mins] = currentTime.split(':').map(Number);
  const currentMinutes = hours * 60 + mins;

  const [startH, startM] = sleepStart.split(':').map(Number);
  const [endH, endM] = sleepEnd.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins > endMins) {
    // Sleep spans midnight (e.g., 23:30 - 06:30)
    return currentMinutes >= startMins || currentMinutes < endMins;
  } else {
    // Sleep within same day
    return currentMinutes >= startMins && currentMinutes < endMins;
  }
};