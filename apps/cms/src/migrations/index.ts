import * as migration_20261109_175559_initial from './20261109_175559_initial';
import * as migration_20261109_180220_content_model from './20261109_180220_content_model';

export const migrations = [
  {
    up: migration_20261109_175559_initial.up,
    down: migration_20261109_175559_initial.down,
    name: '20261109_175559_initial',
  },
  {
    up: migration_20261109_180220_content_model.up,
    down: migration_20261109_180220_content_model.down,
    name: '20261109_180220_content_model'
  },
];
