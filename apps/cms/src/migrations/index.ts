import * as migration_20260720_185735_initial from './20260720_185735_initial';

export const migrations = [
  {
    up: migration_20260720_185735_initial.up,
    down: migration_20260720_185735_initial.down,
    name: '20260720_185735_initial'
  },
];
