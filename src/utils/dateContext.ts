/**
 * Add current date and time context to prompts
 */
export function addDateContext(prompt: string): string {
  const now = new Date();
  
  // Get various date/time formats
  const dateContext = `
=== Current Date and Time Context ===
Current date and time: ${now.toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  timeZoneName: 'short'
})}

Day of week: ${now.toLocaleDateString('en-US', { weekday: 'long' })}
Current year: ${now.getFullYear()}
Current month: ${now.toLocaleDateString('en-US', { month: 'long' })}
Current date: ${now.getDate()}
Current time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
=== End Date Context ===

${prompt}`;
  
  return dateContext;
}

/**
 * Get relative time descriptions
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Check if a message needs temporal context
 */
export function needsDateContext(message: string): boolean {
  const temporalPatterns = [
    /\b(today|tonight|tomorrow|yesterday|now|current|latest)\b/i,
    /\b(this week|last week|next week|this month|last month|this year)\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(morning|afternoon|evening|night|noon|midnight)\b/i,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /what time/i,
    /when is/i,
    /\b(date|day|time)\b/i,
    /\b(schedule|calendar|appointment)\b/i
  ];
  
  return temporalPatterns.some(pattern => pattern.test(message));
}

/**
 * Parse natural language time references
 */
export function parseTimeReference(text: string): Date | null {
  const now = new Date();
  const lowercaseText = text.toLowerCase();
  
  // Handle relative days
  if (lowercaseText.includes('today')) {
    return now;
  }
  
  if (lowercaseText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  if (lowercaseText.includes('yesterday')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  
  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = now.getDay();
  
  for (let i = 0; i < days.length; i++) {
    if (lowercaseText.includes(days[i])) {
      const targetDay = i;
      let daysToAdd = targetDay - currentDay;
      
      // If the day has passed this week, get next week's
      if (daysToAdd <= 0 && !lowercaseText.includes('last')) {
        daysToAdd += 7;
      }
      // If looking for last week's day
      if (lowercaseText.includes('last')) {
        daysToAdd -= 7;
      }
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      return targetDate;
    }
  }
  
  return null;
}

/**
 * Format date for display in responses
 */
export function formatDateForResponse(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString();
  
  if (isToday) return 'today';
  if (isTomorrow) return 'tomorrow';
  if (isYesterday) return 'yesterday';
  
  // For dates within a week, use day name
  const daysDiff = Math.floor((date.getTime() - now.getTime()) / 86400000);
  if (daysDiff > 0 && daysDiff <= 7) {
    return `this ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  if (daysDiff < 0 && daysDiff >= -7) {
    return `last ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  
  // Otherwise use full date
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}