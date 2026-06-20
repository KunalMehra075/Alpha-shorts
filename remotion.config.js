// Remotion CLI config (used by `npx remotion studio` / `npx remotion render`).
// Programmatic rendering via `npm run generate-video` configures these options
// directly in src/lib/remotion-render.js and does not depend on this file.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setPublicDir('remotion/public');
Config.setEntryPoint('remotion/index.js');
Config.overrideWebpackConfig((current) => current);
