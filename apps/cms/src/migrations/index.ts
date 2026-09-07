import * as migration_20260720_185735_initial from './20260720_185735_initial';
import * as migration_20260721_084024_add_events from './20260721_084024_add_events';
import * as migration_20260724_100420_add_raw_uploads from './20260724_100420_add_raw_uploads';
import * as migration_20260728_055135_add_raw_upload_detail from './20260728_055135_add_raw_upload_detail';
import * as migration_20260729_070548_inline_colourways from './20260729_070548_inline_colourways';
import * as migration_20260729_120855_add_raw_upload_retry from './20260729_120855_add_raw_upload_retry';
import * as migration_20260803_090000_add_file_colour_details from './20260803_090000_add_file_colour_details';
import * as migration_20260803_140000_add_artwork_verdict from './20260803_140000_add_artwork_verdict';
import * as migration_20260811_163415_catalogue_defaults from './20260811_163415_catalogue_defaults';
import * as migration_20260811_190000_folders_on_media from './20260811_190000_folders_on_media';
import * as migration_20260817_120000_build_process_and_description from './20260817_120000_build_process_and_description';
import * as migration_20260905_090000_site_logo from './20260905_090000_site_logo';
import * as migration_20260905_150000_footer_facts from './20260905_150000_footer_facts';
import * as migration_20260907_120000_add_inquiries from './20260907_120000_add_inquiries'

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
    name: '20260728_055135_add_raw_upload_detail',
  },
  {
    up: migration_20260729_070548_inline_colourways.up,
    down: migration_20260729_070548_inline_colourways.down,
    name: '20260729_070548_inline_colourways',
  },
  {
    up: migration_20260729_120855_add_raw_upload_retry.up,
    down: migration_20260729_120855_add_raw_upload_retry.down,
    name: '20260729_120855_add_raw_upload_retry'
  },
  {
    up: migration_20260803_090000_add_file_colour_details.up,
    down: migration_20260803_090000_add_file_colour_details.down,
    name: '20260803_090000_add_file_colour_details',
  },
  {
    up: migration_20260803_140000_add_artwork_verdict.up,
    down: migration_20260803_140000_add_artwork_verdict.down,
    name: '20260803_140000_add_artwork_verdict',
  },
  {
    up: migration_20260811_163415_catalogue_defaults.up,
    down: migration_20260811_163415_catalogue_defaults.down,
    name: '20260811_163415_catalogue_defaults',
  },
  {
    up: migration_20260811_190000_folders_on_media.up,
    down: migration_20260811_190000_folders_on_media.down,
    name: '20260811_190000_folders_on_media',
  },
  {
    up: migration_20260817_120000_build_process_and_description.up,
    down: migration_20260817_120000_build_process_and_description.down,
    name: '20260817_120000_build_process_and_description',
  },
  {
    up: migration_20260905_090000_site_logo.up,
    down: migration_20260905_090000_site_logo.down,
    name: '20260905_090000_site_logo',
  },
  {
    up: migration_20260905_150000_footer_facts.up,
    down: migration_20260905_150000_footer_facts.down,
    name: '20260905_150000_footer_facts',
  },
  {
    up: migration_20260907_120000_add_inquiries.up,
    down: migration_20260907_120000_add_inquiries.down,
    name: '20260907_120000_add_inquiries',
  },
];
