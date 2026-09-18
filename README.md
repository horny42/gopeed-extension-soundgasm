# gopeed-extension-soundgasm

Gopeed extension to download audio from [soundgasm.net](https://soundgasm.net).

- Single track: `https://soundgasm.net/u/<user>/<slug>` → 1 audio file
- User profile: `https://soundgasm.net/u/<user>/` → all audios of the user
- Direct audio URL ending in `.mp3`/`.m4a`/etc. → passed through

## Project setup

```
npm install
```

### Compiles and hot-reloads for development

```
npm run dev
```

### Compiles and minifies for production

```
npm run build
```

## Local debugging (Gopeed desktop, macOS)

1. `npm run dev` (watch mode, outputs `dist/index.js`)
2. Gopeed → Extensions page → click the Install button 5 times to enable developer mode
3. Choose this folder (`/Users/ajitshrestha/Desktop/extension`) in the directory picker
4. Create tasks to test:
   - Single: `https://soundgasm.net/u/soundspell/M4A-Master-Makes-You-His-Edgepuppet-Cock-Version`
   - Profile: `https://soundgasm.net/u/soundspell/`
5. Watch logs: `tail -f <gopeed-data>/logs/extension.log`

## Publish (fresh account, keeps work/personal GitHub separate)

1. Create a new GitHub account, then a public repo named `gopeed-extension-soundgasm`
2. Set `repository.url` in `manifest.json`:
   ```json
   { "repository": { "url": "https://github.com/<new-user>/gopeed-extension-soundgasm" } }
   ```
3. Set `author` in `manifest.json` to `<new-user>` (extension id is `<author>@<name>`)
4. `npm run build`, commit `manifest.json` + `dist/`, push, add GitHub topic `gopeed-extension`
5. In Gopeed → Extensions → paste `https://github.com/<new-user>/gopeed-extension-soundgasm` → Install

## Archive after download (optional)

The extension only resolves download URLs; zipping is done by Gopeed's hook system:

1. `chmod +x scripts/archive-soundgasm.sh`
2. Gopeed → Settings → Advanced → Developer → Script Execution → enable → add full path to `scripts/archive-soundgasm.sh`
3. After each successful task, Gopeed runs the script with `GOPEED_TASK_PATH` (file for single track, folder for profile) and it creates a `.zip` next to the download.

Alternatively use Webhook (`Settings → Advanced → Developer → Webhook`) with `DOWNLOAD_DONE` events to trigger your own archiving service.
