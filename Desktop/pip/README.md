# Pip Animation Pipeline

An automated pipeline to generate a rigged, animated 3D character from a 2D reference image, ready for rendering in Blender.

**Status:** Stage 1 (Image-to-3D) - Ready for testing  
**Hardware:** Runs on 2019 13" MacBook Pro (Intel, no GPU) with Google Colab for GPU-heavy steps.

## Project Structure

```
pip-pipeline/
├── assets/
│   ├── reference/          # Input: 2D reference images
│   ├── meshes/             # Stage 1 output: Raw 3D models from TripoSR
│   └── rigged/             # Stage 2 output: Rigged FBX from Mixamo (manual upload)
├── notebooks/
│   └── triposr_colab.ipynb # Stage 1: Image-to-3D via Google Colab
├── scripts/
│   ├── prep_for_mixamo.py  # Stage 2: Validate & convert mesh
│   ├── import_and_animate.py # Stage 3: Blender scene setup
│   └── render.py           # Stage 4: Batch render
├── output/
│   └── renders/            # Final rendered frames/video
└── README.md
```

---

## Stage 1: Image-to-3D via Google Colab (TripoSR)

### Overview

Since the local machine has no GPU (2019 Intel MacBook), 3D model generation runs on **Google Colab's free GPU tier** using **TripoSR**, an open-source image-to-3D model by Stability AI and Tripo.

**Input:** 2D reference image (e.g., `assets/reference/pip_reference.png`)  
**Output:** 3D mesh in GLB format (e.g., `assets/meshes/pip_model.glb`)  
**Runtime:** ~2–5 minutes on Colab GPU

### How to Use

#### 1. Open the Notebook in Google Colab

- Go to [colab.research.google.com](https://colab.research.google.com)
- Click **File** → **Open notebook**
- Select **GitHub** tab
- Enter: `https://github.com/your-username/your-repo-path` (or upload directly)
- Alternatively: upload `notebooks/triposr_colab.ipynb` directly via **File** → **Upload notebook**

#### 2. Enable GPU

- Click **Runtime** → **Change runtime type**
- Select **GPU** (any option: T4, V100, A100)
- Click **Save**
- Wait ~10 seconds for the runtime to restart

#### 3. Run All Cells

- Ensure you've placed the reference image at `assets/reference/pip_reference.png`
- Click **Runtime** → **Run all** (or press Ctrl+F9 / Cmd+F9)
- Follow prompts:
  - **Step 4** will ask you to upload the reference image (or it will use the one in `assets/reference/`)
  - **Step 5** runs inference (~1–3 minutes)
  - **Step 7** downloads the GLB file directly to your machine

#### 4. Save Output

After the notebook completes:
1. Check your **Downloads** folder for `pip_model.glb`
2. Move it to `assets/meshes/pip_model.glb`

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "CUDA out of memory" | In Step 5, change `quality="medium"` to `quality="low"` for faster inference. Restart runtime if still failing. |
| "No module named tripo_sr" | Re-run Step 1 (Install Dependencies) and wait for completion. Then restart runtime. |
| Background removal looks bad | Remove the `remove_background()` call in Step 5 or pre-process the reference image before uploading. |
| Mesh looks low-quality | Upload a higher-resolution reference image (at least 512×512). Ensure good lighting and clear character boundaries. |

---

## Licensing & Commercial Use

**TripoSR** is released under the **CC BY-NC 4.0 license** by Stability AI / Tripo:
- ✓ Free for research and non-commercial projects
- ✓ Free for personal use
- ⚠ **For monetized YouTube channels:** Check with Stability AI/Tripo regarding commercial licensing before publishing

Verify current license terms at: [github.com/VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR)

---

## Stage 2: Mesh Validation & Mixamo Prep

### Overview

Validates the 3D mesh from Stage 1 (checks connectivity, normals, polycount) and converts it to FBX format for Mixamo upload.

**Input:** GLB mesh from Stage 1 (e.g., `assets/meshes/pip_model.glb`)  
**Output:** FBX file ready for Mixamo (e.g., `assets/meshes/pip_model.fbx`)  
**Runtime:** ~30 seconds–2 minutes (depending on Blender availability)  
**Manual step:** Upload to Mixamo and download rigged character

### Setup

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # on Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### How to Use

#### 1. Validate and Convert Mesh

```bash
python scripts/prep_for_mixamo.py assets/meshes/pip_model.glb
```

This will:
- ✓ Load and validate the mesh
- ✓ Check for common issues (disconnected parts, inverted normals, unusual scale)
- ✓ Report polycount and size
- ✓ Convert to FBX (requires Blender installed)
- ✓ Print Mixamo upload instructions

**Output:** `assets/meshes/pip_model.fbx`

#### 2. (Optional) Decimate High-Polycount Meshes

If the mesh has > 100k faces and Mixamo struggles:

```bash
python scripts/prep_for_mixamo.py assets/meshes/pip_model.glb --decimate 0.5
```

This reduces the mesh to 50% of its original polycount.

#### 3. (Optional) Skip Conversion

If you don't have Blender, export as OBJ first and convert manually in Mixamo:

```bash
python scripts/prep_for_mixamo.py assets/meshes/pip_model.glb --no-convert
```

### Manual Mixamo Step

Once Stage 2 script completes, it prints detailed instructions for:

1. **Upload** to [mixamo.com](https://mixamo.com)
2. **Auto-rig** by marking chin, wrists, elbows, knees, groin
3. **Download** rigged character as FBX
4. **Save** to `assets/rigged/pip_rigged.fbx`

This is a one-time manual step (~5–10 minutes).

### Requirements

- **trimesh, numpy** (installed via `requirements.txt`)
- **Blender** (optional but recommended for FBX conversion)
  - Download from [blender.org](https://www.blender.org)
  - Must be in PATH or specify `blender` command available

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Blender not found" | Install Blender or use `--no-convert` and convert manually in Mixamo |
| "High polycount warning" | Use `--decimate 0.5` to reduce mesh size |
| Mesh has holes | Mixamo can handle minor gaps; if severe, regenerate from a better reference image in Stage 1 |
| FBX conversion fails | Export as OBJ (`--no-convert`) and upload to Mixamo instead |

---

---

## Stage 3: Blender Scene Setup & Animation Import

### Overview

Sets up a reusable Blender scene template with:
- ✓ Imported rigged character
- ✓ Multiple animations loaded into NLA tracks (no re-rigging needed)
- ✓ 3-point lighting rig
- ✓ Camera framed on character
- ✓ Transparent or solid background

**Input:** Rigged FBX from Mixamo (e.g., `assets/rigged/pip_rigged.fbx`) + optional animation FBXs  
**Output:** Reusable Blender template (e.g., `assets/pip_template.blend`)  
**Runtime:** ~30 seconds–2 minutes (Blender runs headless)

### How to Use

#### 1. Basic Setup (Character Only)

```bash
blender --background --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx \
  --output assets/pip_template.blend
```

This creates a scene with:
- Character rigged and centered
- Default 3-point lighting
- Camera positioned
- Transparent background

#### 2. With Animations

If you downloaded animation FBXs from Mixamo:

```bash
blender --background --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx \
  --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx \
  --output assets/pip_template.blend
```

Animations are added to **NLA tracks** so you can:
- Play them individually
- Blend between them
- Adjust timing/speed without modifying the original actions

#### 3. Solid Background

For a non-transparent background (e.g., for web):

```bash
blender --background --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx \
  --output assets/pip_template.blend \
  --no-transparent
```

### Script Details

**Lighting setup:**
- **Key light** (bright, front-right): main illumination
- **Fill light** (moderate, opposite): softens shadows
- **Back light** (right rear): rim lighting for depth

**Camera:**
- Positioned at 45° angle, ~3 units away
- Framed to show full character
- 50mm lens (adjustable in Blender if needed)

**Background:**
- Default: Transparent (alpha = 0) for compositing
- Option: Solid light gray for standalone renders

### Using the Template in Blender

Once saved, you can open and customize:

```bash
blender assets/pip_template.blend
```

In Blender UI:
- **Dope Sheet → NLA Editor** to manage animation tracks
- **Camera properties** to adjust framing
- **Lights** to tweak colors/intensity
- **Render properties** to set output resolution, format, etc.

### Command-Line Reference

```bash
blender --background --python scripts/import_and_animate.py -- --help
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "No armature found" | Make sure the character FBX is a rigged model from Mixamo (not just a mesh) |
| Animations don't load | Verify animation FBX files exist and are from Mixamo (with standard bone naming) |
| Blender crashes or hangs | Try with a simpler character or fewer animations; increase system resources |
| Camera/lights look wrong | You can adjust them manually in the saved .blend file |

---

---

## Stage 4: Batch Render

### Overview

Renders animated shots from the Blender template using a JSON configuration. Supports:
- ✓ Single-shot or batch rendering
- ✓ Multiple output formats (MP4, PNG sequence, OpenEXR)
- ✓ Dynamic camera angles per shot
- ✓ Animation selection and frame ranges
- ✓ Overnight batch rendering (unattended)

**Input:** Blender template + shot config JSON  
**Output:** Rendered MP4 files or image sequences (e.g., `output/renders/`)  
**Runtime:** Depends on resolution, samples, and frame count (e.g., 5–30 min per shot)

### How to Use

#### 1. Single Shot Render

Create a shot config JSON (see `shots/example_single_shot.json`):

```json
{
  "name": "Pip Walking",
  "animation": "pip_walk",
  "frame_start": 1,
  "frame_end": 120,
  "playback_speed": 24,
  "resolution": [1920, 1080],
  "output_name": "pip_walk_01",
  "output_format": "mp4",
  "engine": "CYCLES",
  "samples": 128,
  "camera": {
    "location": [2.5, -3, 1.5],
    "rotation": [1.1, 0, 0.4],
    "lens": 50
  },
  "background": {
    "type": "transparent"
  }
}
```

Then render:

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --shot-config shots/example_single_shot.json
```

**Output:** `output/renders/pip_walk_01.mp4`

#### 2. Batch Render (Multiple Shots)

Create a batch config JSON (see `shots/example_episode.json`):

```json
{
  "episode": "episode_1",
  "shots": [
    {
      "name": "Scene 1: Pip Idle",
      "animation": "pip_idle",
      "output_name": "scene_01_idle",
      ...
    },
    {
      "name": "Scene 2: Pip Walking",
      "animation": "pip_walk",
      "output_name": "scene_02_walk",
      ...
    }
  ]
}
```

Then render:

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --batch shots/example_episode.json
```

**Output:** Multiple MP4s in `output/renders/` (e.g., `scene_01_idle.mp4`, `scene_02_walk.mp4`)

#### 3. Custom Output Directory

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --shot-config shots/my_shot.json \
  --output-dir output/episode_1
```

### Shot Configuration Reference

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Shot name (for logging) |
| `animation` | string | Name of NLA animation track to play |
| `output_name` | string | Output filename (without extension) |

#### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `frame_start` | int | 1 | Start frame |
| `frame_end` | int | 250 | End frame |
| `playback_speed` | int | 24 | FPS (frames per second) |
| `resolution` | [width, height] | [1920, 1080] | Output resolution in pixels |
| `output_format` | string | "mp4" | `mp4`, `image_sequence`, or `exr` |
| `engine` | string | "CYCLES" | Render engine (`CYCLES` or `EEVEE`) |
| `samples` | int | 128 | Render samples (CYCLES only; higher = better quality, slower) |
| `camera.location` | [x, y, z] | template default | Camera position |
| `camera.rotation` | [x, y, z] | template default | Camera rotation (radians) |
| `camera.lens` | float | 50 | Focal length in mm |
| `background.type` | string | "transparent" | `transparent` or `color` |
| `background.color` | [r, g, b] | [0.9, 0.9, 0.95] | RGB color (0–1 range) |

### Output Formats

#### MP4 (Default)
```json
"output_format": "mp4"
```
- Single video file
- H.264 codec, good compression
- Best for playback and delivery

#### PNG Image Sequence
```json
"output_format": "image_sequence"
```
- One PNG per frame
- Lossless, high quality
- Good for compositing or re-rendering
- Output: `output/renders/shot_name/frame_0001.png`, `frame_0002.png`, etc.

#### OpenEXR Sequence
```json
"output_format": "exr"
```
- One EXR per frame (32-bit float, supports multiple passes)
- Best quality for post-production
- Output: `output/renders/shot_name/frame_0001.exr`, etc.

### Performance Tips

**To speed up renders:**
- Lower `samples` (e.g., 64 or 32 for fast preview)
- Lower `resolution` (e.g., [1280, 720] for draft)
- Use `EEVEE` engine instead of `CYCLES` (real-time, lower quality)
- Reduce frame count (`frame_end - frame_start`)

**For high-quality final renders:**
- Increase `samples` (128–512)
- Use full resolution [1920, 1080] or higher
- Use `CYCLES` engine
- Render overnight or distribute across machines

### Example: Overnight Batch Render

Create a master batch config for an entire episode:

```bash
# shots/full_episode_1.json
{
  "episode": "Episode 1: Pip's Adventure",
  "shots": [
    { "name": "Scene 1", "animation": "idle", ... },
    { "name": "Scene 2", "animation": "walk", ... },
    { "name": "Scene 3", "animation": "run", ... },
    ...
  ]
}
```

Then queue overnight:

```bash
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --batch shots/full_episode_1.json &
# Runs in background; check output/renders/ in the morning
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "No animation named X" | Check animation name matches NLA track in template (Stage 3) |
| Render is very slow | Lower `samples` or use `EEVEE` engine for faster preview renders |
| Output is black/empty | Verify template has proper lighting and camera (test in Blender UI first) |
| MP4 has no audio | Script renders video only; add audio in post-production if needed |
| Out of memory | Reduce resolution or samples; or render on a machine with more VRAM |

### Camera Positioning Quick Reference

Common camera angles (adjust `location` and `rotation`):

```json
"camera": {
  "location": [0, -3, 1.5],        // Front view
  "rotation": [1.1, 0, 0]
}
```

```json
"camera": {
  "location": [3, 0, 1.5],         // Right side view
  "rotation": [1.1, 0, 1.57]
}
```

```json
"camera": {
  "location": [-3, 0, 1.5],        // Left side view
  "rotation": [1.1, 0, -1.57]
}
```

```json
"camera": {
  "location": [3, -3, 2.5],        // Isometric 3/4 view
  "rotation": [1.1, 0, 0.8]
}
```

---

## Pipeline Complete! 🎉

### Quick Start Checklist

- [x] **Stage 1:** Image-to-3D via Colab (TripoSR)
- [x] **Stage 2:** Mesh validation & Mixamo prep
- [x] **Stage 3:** Blender scene setup & animation import
- [x] **Stage 4:** Batch render (you are here)

### Full Workflow

```
1. Create 2D reference image (or use pip_reference.png)
   ↓
2. Run TripoSR on Colab → get GLB mesh
   ↓
3. Run prep_for_mixamo.py → validate & export FBX
   ↓
4. MANUAL: Upload to Mixamo, auto-rig, download FBX + animations
   ↓
5. Run import_and_animate.py → create Blender template
   ↓
6. Create shot configs (JSON)
   ↓
7. Run render.py → batch render MP4s
   ↓
8. (Optional) Post-process: add audio, color grade, etc.
   ↓
9. Upload to YouTube! 🎬
```

---

## Development Notes

- Python 3.8+
- Virtual environment: `venv/` (create with `python -m venv venv` and activate)
- All scripts include `--help` for CLI usage
- Progress printed at each major step
- Blender 3.0+ required for Stages 3–4

---

## Development Notes

- Python 3.8+
- Virtual environment: `venv/` (create with `python -m venv venv` and activate)
- All scripts include `--help` for CLI usage
- Progress printed at each major step
