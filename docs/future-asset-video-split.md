Add this as a **future extension module** to your dashboard specification:

---

# Future Extension: Timeline Video Editor

After the Assets module is completed, add a dedicated **Timeline Video Editor** module.

The goal of this module is to give me a lightweight CapCut/Premiere-style editing experience directly inside the dashboard while remaining focused on YouTube Shorts production.

This module should be designed around speed and simplicity, not professional video editing complexity.

---

## Purpose

The Assets module is responsible for gathering and assigning visuals to scenes.

The Timeline Video Editor is responsible for transforming those assets into a final polished video.

The editor should work independently from asset generation.

Once assets are assigned to scenes, the editor should automatically build a timeline that can be reviewed and customized before rendering.

---

## Timeline Layout

Create a horizontal timeline view.

Each scene should appear as a visual card/block.

Example:

```text
[Scene 1] → [Scene 2] → [Scene 3] → [Scene 4]
```

Each block should display:

* Scene Number
* Scene Thumbnail
* Asset Type
* Duration
* Effect Applied
* Transition Applied

---

## Drag and Drop Reordering

The timeline should support drag-and-drop reordering.

Example:

```text
Scene 1
Scene 2
Scene 3
```

can become:

```text
Scene 1
Scene 3
Scene 2
```

and the timeline should update automatically.

All timestamps should be recalculated automatically.

---

## Automatic Timeline Creation

As soon as assets are assigned to scenes:

```text
Scene 1 → Image
Scene 2 → Video
Scene 3 → Image
Scene 4 → Video
```

the system should automatically generate a complete timeline.

No manual setup should be required.

---

## Automatic Random Transitions

This is extremely important.

By default, every scene transition should automatically receive a randomly selected transition.

Example:

```text
Scene 1 → Fade → Scene 2
Scene 2 → Slide Left → Scene 3
Scene 3 → Zoom → Scene 4
Scene 4 → Crossfade → Scene 5
```

The user should not be forced to manually configure transitions.

The editor should intelligently pre-populate transitions during timeline creation.

The goal is:

```text
Import Assets
↓
Create Timeline
↓
Looks Good Immediately
```

without requiring extra work.

---

## Transition Library

Supported transitions:

* Fade
* Crossfade
* Zoom
* Slide Left
* Slide Right
* Push
* Blur Transition
* Scale Transition

Every transition should support:

* Duration
* Preview
* Replacement

The user should be able to override any automatically selected transition.

---

## Scene Effects

Each scene should support effects.

Available effects:

### Image Effects

* Zoom In
* Zoom Out
* Pan Left
* Pan Right
* Ken Burns
* Parallax
* Slow Rotate
* Depth Effect

### Video Effects

* Slow Zoom
* Crop and Scale
* Speed Adjustment
* Motion Blur
* Dynamic Focus

### Animation Effects

* Particle Background
* Glow Effect
* Question Reveal
* Floating Elements
* Science Style Motion Graphics

The user should be able to select effects from a dropdown.

---

## Effect Presets

Add one-click presets.

Examples:

```text
Mystery
History
Science
Space
Technology
Ancient India
```

Each preset automatically chooses:

* Scene effects
* Motion style
* Transition style

This allows fast editing.

---

## Scene Settings Panel

Clicking any scene should open a side panel.

Allow editing:

* Duration
* Transition
* Effect
* Asset
* Zoom Level
* Motion Style
* Animation Intensity

Changes should update instantly.

---

## Live Preview

The editor should contain a real-time preview player.

Whenever:

* Duration changes
* Transition changes
* Effect changes

the preview should update automatically.

The user should be able to scrub through the timeline.

---

## Audio Integration

Display:

### Narration Track

Generated voiceover.

### Music Track

Optional background music.

Allow:

* Upload music
* Select music
* Adjust music volume
* Fade in
* Fade out

Narration should always remain the primary audio source.

---

## Caption Integration

Captions generated in the Caption module should automatically appear in the timeline.

Allow:

* Enable/Disable captions
* Change style
* Change position
* Preview captions live

---

## Render Queue

The editor should support rendering multiple versions.

Example:

```text
Render 1
Render 2
Render 3
```

Each render should store:

* Timestamp
* Resolution
* Duration
* Render Settings

---

## Version History

Every timeline change should be recoverable.

Example:

```text
Version 1
Version 2
Version 3
```

Allow restoring previous timeline versions.

---

## Future-Proof Design

The Timeline Video Editor should be designed so future features can be added easily:

* Multi-track editing
* Asset trimming
* Overlay layers
* Picture-in-picture
* AI-generated B-roll
* Auto-generated effects
* Auto-generated transitions
* Advanced motion graphics

For now, focus only on a clean, fast, Shorts-focused editing experience where the user can quickly review scenes, adjust transitions and effects, preview the result, and render a final video.

The most important requirement is that timelines should feel nearly complete immediately after asset assignment, thanks to automatic random transitions and sensible default effects. This minimizes manual editing and keeps the content creation workflow extremely fast.
