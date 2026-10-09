import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Contract enforced without requiring production database credentials.
describe('calendar loading association contract', () => {
  it('uses calendar events as the bridge from loading days to order links', () => {
    const code = readFileSync('src/lib/server/calendar/CalendarService.ts', 'utf8');
    const method = code.split('async generateLoadingCalendar()')[1]?.split('Create calendar subscription token')[0];
    expect(method).toBeDefined();
    expect(method).toContain(".from('calendar_events')");
    expect(method).toContain(".from('loading_event_pos')");
    expect(method).toContain("loading_event_id");
    expect(method).toContain('return calendar.toString()');
    expect(method).not.toContain("assume event id = loading_days.id");
  });
});
