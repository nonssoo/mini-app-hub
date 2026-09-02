# Pip Animation Pipeline — Quick Start

Complete end-to-end workflow from 2D image to rendered animation.

## Prerequisites

- **Google Colab** (free, for Stage 1)
- **Mixamo account** (free, for manual rigging)
- **Blender 3.0+** (free, for Stages 3–4)
- **Python 3.8+** (local machine)

## 5-Minute Overview

```
2D Reference Image
    ↓
Stage 1: TripoSR on Colab → 3D mesh (GLB)
    ↓
Stage 2: Validate & export (FBX)
    ↓
Manual: Mixamo auto-rig + download
    ↓
Stage 3: Blender scene template
    ↓
Stage 4: Configure shots + render
    ↓
Output: MP4 videos ready for YouTube
```

## Step-by-Step

### 1. Reference Image (You already have this! ✓)

Located at: `assets/reference/pip_reference.png`

### 2. Stage 1: Image-to-3D via Colab

**Time:** ~5–10 minutes (mostly waiting for Colab)

```bash
# No local command needed; Colab does the work
# 1. Go to colab.research.google.com
# 2. Upload: notebooks/triposr_colab.ipynb
# 3. Enable GPU: Runtime > Change runtime type > GPU
# 4. Run all cells
# 5. Download pip_model.glb to assets/meshes/
```

### 3. Stage 2: Mesh Prep

**Time:** ~2 minutes

```bash
# Setup (one-time)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Validate & convert
python scripts/prep_for_mixamo.py assets/meshes/pip_model.glb
```

**Output:** `assets/meshes/pip_model.fbx` + instructions

### 4. Manual: Mixamo Rigging

**Time:** ~10 minutes

```
1. Go to mixamo.com
2. Upload FBX
3. Mark: chin, wrists, knees, groin
4. Download rigged character → assets/rigged/pip_rigged.fbx
5. (Optional) Download animations → assets/rigged/pip_walk.fbx, pip_idle.fbx, etc.
```

### 5. Stage 3: Blender Setup

**Time:** ~1 minute

```bash
blender --background assets/pip_template.blend --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx \
  --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx \
  --output assets/pip_template.blend
```

**Output:** `assets/pip_template.blend` (reusable scene)

### 6. Stage 4: Render

**Time:** 5–30 min per shot (depends on resolution/quality)

#### Single Shot

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --shot-config shots/example_single_shot.json
```

#### Multiple Shots (Batch)

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --batch shots/example_episode.json
```

**Output:** `output/renders/` (MP4 files)

---

## Common Tasks

### Render a quick preview (fast)

Edit `shots/example_single_shot.json`:
```json
{
  "engine": "EEVEE",
  "samples": 16,
  "resolution": [1280, 720]
}
```

### Add a new animation

1. Download from Mixamo: `pip_jump.fbx`
2. Update Stage 3:
   ```bash
   --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx assets/rigged/pip_jump.fbx
   ```
3. Add to shot config:
   ```json
   { "animation": "pip_jump", ... }
   ```

### Change camera angle

In shot config, modify `camera.location` and `camera.rotation`:

```json
"camera": {
  "location": [3, 0, 1.5],      // Move right side
  "rotation": [1.1, 0, 1.57]    // Look at from right
}
```

### Render overnight

Queue all shots to batch file, then:
```bash
nohup blender --background assets/pip_template.blend --python scripts/render.py -- \
  --batch shots/full_episode.json &
```

---

## File Structure

```
pip-pipeline/
├── assets/
│   ├── reference/pip_reference.png       ← Your 2D image
│   ├── meshes/pip_model.glb              ← TripoSR output (Stage 1)
│   ├── meshes/pip_model.fbx              ← Stage 2 output
│   └── rigged/pip_rigged.fbx             ← Mixamo output (manual)
├── notebooks/triposr_colab.ipynb         ← Stage 1 (Colab)
├── scripts/
│   ├── prep_for_mixamo.py                ← Stage 2
│   ├── import_and_animate.py             ← Stage 3
│   └── render.py                         ← Stage 4
├── shots/
│   ├── example_single_shot.json          ← Single shot template
│   └── example_episode.json              ← Batch template
├── output/
│   └── renders/                          ← Final MP4s (Stage 4 output)
├── assets/pip_template.blend             ← Blender template (Stage 3 output)
├── README.md                             ← Full documentation
├── QUICKSTART.md                         ← This file
└── requirements.txt                      ← Python dependencies
```

---

## Troubleshooting

**Stage 1: Colab TripoSR not working?**
- Check Colab GPU: Runtime > Change runtime type > GPU (T4 or V100)
- If model errors, try lower quality: `quality="low"`

**Stage 2: Blender not found?**
- Install Blender from blender.org
- Or use `--no-convert` to export OBJ instead

**Stage 3: No armature found?**
- Make sure the FBX is a rigged character from Mixamo (not just a mesh)

**Stage 4: Render is black/frozen?**
- Test template manually: `blender assets/pip_template.blend`
- Check lighting and camera are visible

---

## Next Episode

Once you have the pipeline working:

1. Create a new reference image
2. Run Stages 1–4
3. Reuse `assets/pip_template.blend` (skip Stage 3)
4. Just create new shot configs and render

**Estimated time:** 30–60 min per episode (mostly waiting for renders)

---

## Support

- **Full documentation:** See `README.md`
- **Script help:** `python scripts/prep_for_mixamo.py --help`, etc.
- **Example configs:** `shots/example_*.json`
