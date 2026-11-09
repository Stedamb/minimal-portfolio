import * as migration_20261109_175559_initial from './20261109_175559_initial';
import * as migration_20261109_180220_content_model from './20261109_180220_content_model';
import * as migration_20261109_193808_demo_guard from './20261109_193808_demo_guard';
import * as migration_20261109_201109_mcp from './20261109_201109_mcp';
import * as migration_20261109_201929_forms from './20261109_201929_forms';

export const migrations = [
  {
    up: migration_20261109_175559_initial.up,
    down: migration_20261109_175559_initial.down,
    name: '20261109_175559_initial',
  },
  {
    up: migration_20261109_180220_content_model.up,
    down: migration_20261109_180220_content_model.down,
    name: '20261109_180220_content_model',
  },
  {
    up: migration_20261109_193808_demo_guard.up,
    down: migration_20261109_193808_demo_guard.down,
    name: '20261109_193808_demo_guard',
  },
  {
    up: migration_20261109_201109_mcp.up,
    down: migration_20261109_201109_mcp.down,
    name: '20261109_201109_mcp',
  },
  {
    up: migration_20261109_201929_forms.up,
    down: migration_20261109_201929_forms.down,
    name: '20261109_201929_forms'
  },
];
