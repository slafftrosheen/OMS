import { derived } from 'svelte/store';
import { STATIONS, type StationTag } from '$lib/order/stages';
import { users } from './user-store';

export type StationAssignment = {
  station: StationTag;
  userIds: string[];
};

export const stationAssignments = derived(users, ($users) => {
  const map = new Map<StationTag, string[]>();
  for (const station of STATIONS) {
    map.set(station, []);
  }

  for (const user of $users) {
    if (!user.stations) continue;
    for (const station of user.stations) {
      const list = map.get(station);
      if (!list) {
        map.set(station, [user.id]);
        continue;
      }
      if (!list.includes(user.id)) {
        list.push(user.id);
      }
    }
  }

  return STATIONS.map((station) => ({ station, userIds: map.get(station) ?? [] })).filter(
    (assignment) => assignment.userIds.length > 0
  );
});
