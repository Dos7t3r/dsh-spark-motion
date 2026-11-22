# NOTICE — artwork, attribution, and disclaimer

## Short version

This plugin's **code** is MIT. The **Claude animations it bundles are not mine and are not MIT** — they are Anthropic PBC's artwork, extracted from a locally-installed copy of Claude Desktop so the indicator can be reproduced faithfully. Read the sections below before you redistribute, fork, or ship this anywhere.

This project is **unofficial**. It is not affiliated with, endorsed by, or sponsored by Anthropic PBC or DeepSeek.

---

## 1. What is Anthropic's

Inside `assets/` and inlined into `lib/client.js`:

| Item | Origin |
|---|---|
| `assets/classic-*.svg` | SVG sprite strips from Claude Desktop's `ion-dist.asar` (`Spark` component states) |
| `assets/new-dots.webp` | The `think.loop` sprite sheet from Claude Desktop's `WorkingMark` component |

Copyright in all of that remains with **Anthropic PBC**. It is reproduced here for **interoperability and preservation** — so a UI can display the animation the user already owned a licence to see inside Anthropic's own client — with attribution. It is **not** covered by this repository's MIT license, and no license to redistribute it is granted by this repository.

"Claude" and "Claude Code" are trademarks of Anthropic PBC, used here descriptively.

## 2. What is NOT Anthropic's

| Item | Origin |
|---|---|
| `src/`, `scripts/`, `test/`, `lib/index.js` | Original work, MIT |
| The CSS mask/stepping technique, the build and test harness | Original work, MIT |
| The tail glyph drawn in the settings preview (`TailGlyph` in `src/client.js`) | Drawn for this plugin, MIT. Deliberately **not** DSH's own icon path. |

The **"DeepSeek original" option copies nothing.** It only stops hiding DSH's own `RunningWhaleTail` element, so the animation DeepSeek already ships plays untouched. No DeepSeek artwork is redistributed by this plugin.

This plugin also does not copy DSH's source: it targets stable class-name *suffixes* through CSS attribute selectors.

## 3. What you are agreeing to by using this

- If you do not want third-party artwork in your build, use the removal recipe below — the plugin still works and just offers the DeepSeek option.
- If you fork and publish this, the same obligations travel with the artwork. Redistributing Anthropic's animation assets publicly is your call and your risk; the safe pattern is to publish the code and let each user generate the frames from their own installation.
- Reverse-engineering a desktop client may be limited by its Terms of Service. That is a separate question from copyright, and nothing here is legal advice.

## 4. Removing the artwork (cleanest public posture)

```bash
# 1. Delete the bundled art
rm assets/classic-*.svg assets/new-dots.webp

# 2. Drop those sources from the build
#    in scripts/build.mjs, empty the SOURCES array:
#      const SOURCES = [];
#    (or keep only entries for assets you generated yourself)

# 3. Rebuild — the settings page keeps working, with the DeepSeek option only
node scripts/build.mjs
node test/smoke.mjs   # expected to fail the two data-URI / keyframe assertions
```

To offer your own animation instead, drop any vertical sprite strip at `assets/<name>.svg`
(or `.webp`) and add one line to `SOURCES` in `scripts/build.mjs`:

```js
['myanim', 'assets/myanim.svg', 12, 80],  // key, file, frameCount, frameMs
```

Then add a matching entry to `OPTIONS` in `src/client.js`. The build handles the mask sizing,
the per-frame keyframes and the timing for you.

## 5. Takedown

If you hold rights to any bundled asset and want it removed from this repository, open an issue
and it will be removed. The removal in §4 is designed to be fast precisely so this is cheap to
honour.
