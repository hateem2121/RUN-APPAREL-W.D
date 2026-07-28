import * as migration_20260720_185735_initial from './20260720_185735_initial';
import * as migration_20260721_084024_add_events from './20260721_084024_add_events';
import * as migration_20260724_100420_add_raw_uploads from './20260724_100420_add_raw_uploads';
import * as migration_20260728_055135_add_raw_upload_detail from './20260728_055135_add_raw_upload_detail';

export const migrations = [
  {
    up: migration_20260720_185735_initial.up,
    down: migration_20260720_185735_initial.down,
    name: '20260720_185735_initial',
  },
  {
    up: migration_20260721_084024_add_events.up,
    down: migration_20260721_084024_add_events.down,
    name: '20260721_084024_add_events',
  },
  {
    up: migration_20260724_100420_add_raw_uploads.up,
    down: migration_20260724_100420_add_raw_uploads.down,
    name: '20260724_100420_add_raw_uploads',
  },
  {
    up: migration_20260728_055135_add_raw_upload_detail.up,
    down: migration_20260728_055135_add_raw_upload_detail.down,
    name: '20260728_055135_add_raw_upload_detail'
  },
];
