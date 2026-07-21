import * as migration_20260720_185735_initial from './20260720_185735_initial';
import * as migration_20260721_084024_add_events from './20260721_084024_add_events';

export const migrations = [
  {
    up: migration_20260720_185735_initial.up,
    down: migration_20260720_185735_initial.down,
    name: '20260720_185735_initial',
  },
  {
    up: migration_20260721_084024_add_events.up,
    down: migration_20260721_084024_add_events.down,
    name: '20260721_084024_add_events'
  },
];
