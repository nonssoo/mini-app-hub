# Pip Animation Pipeline — Project Context

**Project:** Automated animation pipeline for YouTube kids channel character "Pip" (anthropomorphic fox)  
**Status:** Stage 1-2 in progress (working through Mixamo rigging)  
**Updated:** 2026-09-03

---

## Quick Status

| Stage | Component | Status | Notes |
|-------|-----------|--------|-------|
| 1 | Image-to-3D (2D → GLB) | ✓ Working | Wonder3D online tool preferred (no install issues) |
| 2 | Mesh validation & prep | ✓ Working | Scripts ready; current issue: Mixamo upload/rigging errors |
| 3 | Blender scene setup | ✓ Ready | Awaiting rigged FBX from Stage 2 |
| 4 | Batch render | ✓ Ready | Awaiting Blender template from Stage 3 |

**Current blocker:** Mixamo rigging errors due to mesh topology issues. Solution applied: mesh repair script (pip_repaired.glb). Awaiting user to retry Mixamo upload.

---

## What's Been Done

### Stage 1: Image-to-3D
- ✓ Created Colab notebooks (`triposr_colab.ipynb`, `image_to_3d_colab.ipynb`)
- ✓ Recommended online tool: [Wonder3D on Hugging Face](https://huggingface.co/spaces/flamingame/Wonder3D)
- ✓ Issue resolved: Colab installations unreliable; online tool is more reliable
- **Current:** User has generated 2 OBJ files from Wonder3D with better quality than original

### Stage 2: Mesh Processing
- ✓ `scripts/convert_obj_to_glb.py` — converts OBJ → GLB
- ✓ `scripts/prep_for_mixamo.py` — validates mesh, exports FBX, prints Mixamo workflow
- ✓ `scripts/repair_mesh.py` — fixes disconnected mesh components for Mixamo
- **Current:** 
  - `assets/meshes/pip_model_v2.glb` generated (101k verts, 202k faces)
  - `assets/meshes/pip_repaired.glb` created (1 connected component, fixed topology)
  - User has encountered Mixamo upload/rigging errors; trying repaired mesh next

### Stage 3: Blender Scene Setup
- ✓ `scripts/import_and_animate.py` (bpy script)
- ✓ Sets up lighting, camera, NLA animation tracks
- **Status:** Ready to use once rigged FBX is available

### Stage 4: Batch Render
- ✓ `scripts/render.py` (bpy script)
- ✓ Example configs: `shots/example_single_shot.json`, `shots/example_episode.json`
- **Status:** Ready to use once Blender template is created

### Documentation
- ✓ `README.md` — comprehensive stage-by-stage guide
- ✓ `QUICKSTART.md` — 5-minute workflow overview

---

## Current Files & Structure

```
pip-pipeline/
├── assets/
│   ├── reference/
│   │   └── pip_reference.png          # Original reference (flattened result)
│   ├── meshes/
│   │   ├── white_mesh.obj             # V1 from Wonder3D (flattened)
│   │   ├── pip_model.glb              # V1 converted to GLB
│   │   ├── pip_model_v2.glb           # V2 from Wonder3D (better)
│   │   ├── pip_simple.glb             # V2 decimated (101k faces)
│   │   └── pip_repaired.glb           # V2 with merged components (FIX)
│   └── rigged/                        # (empty - awaiting Mixamo output)
├── scripts/
│   ├── convert_obj_to_glb.py          # OBJ → GLB converter
│   ├── prep_for_mixamo.py             # Mesh validation & FBX export
│   ├── repair_mesh.py                 # Mesh topology repair (NEW)
│   ├── import_and_animate.py          # Blender import + lighting/camera
│   └── render.py                      # Batch render system
├── notebooks/
│   ├── triposr_colab.ipynb            # TripoSR (unstable on Colab)
│   └── image_to_3d_colab.ipynb        # Improved Colab setup (fallback)
├── shots/
│   ├── example_single_shot.json       # Single shot config
│   └── example_episode.json           # Batch config (3 shots)
├── venv/                              # Python virtual environment
├── output/renders/                    # (empty - for rendered outputs)
├── README.md                          # Full documentation
├── QUICKSTART.md                      # Quick start guide
├── CLAUDE.md                          # This file
└── requirements.txt                   # Python dependencies
```

---

## Known Issues & Solutions

### Issue 1: Mixamo Upload/Rigging Errors
**Symptom:** "Unknown error while generating motion please place all markers correctly"  
**Root cause:** Mesh had 22,361 disconnected components  
**Solution:** Created `repair_mesh.py` to merge components into single mesh  
**Status:** ✅ Fixed — use `pip_repaired.glb` for next Mixamo attempt

### Issue 2: Colab Installation Failures
**Symptom:** "ModuleNotFoundError: No module named 'tripo_sr'" or 'sf3d'  
**Root cause:** Colab model installations unstable (rapidly-changing repos)  
**Solution:** Recommend Wonder3D online tool instead (no installation needed)  
**Status:** ✅ Resolved — users now use online tool

### Issue 3: Image-to-3D Quality (Flattened Face)
**Symptom:** 3D model has flat/2D appearance  
**Root cause:** Original reference image was low-quality  
**Solution:** User obtained better reference image; running Wonder3D again  
**Status:** ✅ In progress — new mesh (pip_model_v2.glb) is better quality

---

## Next Steps (For Next Session)

### Immediate (User should do):
1. **Upload `pip_repaired.glb` to Mixamo** (not the old file!)
   - If it works: proceed to step 2
   - If it fails: use Blender built-in rigging as alternative

2. **Download rigged FBX** once Mixamo succeeds
   - Save to: `assets/rigged/pip_rigged.fbx`
   - Optionally download animations: `pip_walk.fbx`, `pip_idle.fbx`, etc.

### Then (Automated):
3. **Run Stage 3:**
   ```bash
   blender --background assets/pip_template.blend --python scripts/import_and_animate.py -- \
     --character assets/rigged/pip_rigged.fbx \
     --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx \
     --output assets/pip_template.blend
   ```

4. **Run Stage 4 (Render):**
   ```bash
   blender --background assets/pip_template.blend --python scripts/render.py -- \
     --batch shots/example_episode.json
   ```

### If Mixamo Still Fails:
- **Option A:** Use Blender auto-rig (manual but works)
- **Option B:** Use alternative rigging tool (Articula.ai or Sketchfab)
- **Option C:** Try even simpler mesh (see `--decimate` flag in prep_for_mixamo.py)

---

## Key Scripts & Commands

### Testing/Validation
```bash
# Test mesh quality
python scripts/prep_for_mixamo.py assets/meshes/pip_repaired.glb --no-convert

# Repair mesh if needed
python scripts/repair_mesh.py assets/meshes/pip_model_v2.glb --output pip_repaired.glb

# Decimate if polycount is too high
python scripts/prep_for_mixamo.py assets/meshes/pip_model_v2.glb --decimate 0.5
```

### Full Pipeline (Once Mixamo FBX is ready)
```bash
# Stage 3: Create Blender template
blender --background assets/pip_template.blend --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx

# Stage 4: Render
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --batch shots/example_episode.json
```

---

## Dependencies & Environment

**Python 3.12.0**
- trimesh 5.1.0
- numpy 2.5.2
- scipy 1.18.1

**Blender 3.0+** (required for Stages 3–4)
- Install from [blender.org](https://blender.org)
- Scripts run headless via `blender --background --python`

**Activation:**
```bash
source venv/bin/activate
```

---

## Important Notes

### Hardware Constraints
- **Local machine:** 2019 13" MacBook Pro (Intel, no GPU)
- **GPU tasks:** Run on Google Colab (free GPU tier)
- **Non-GPU tasks:** Run locally (Stages 2, 3, 4 can run on CPU if needed)

### Licensing
- **TripoSR:** CC BY-NC 4.0 (check before monetizing)
- **Wonder3D:** Hugging Face (check terms for use)
- **Mixamo animations:** Adobe ToS (check commercial use rights)

### File Naming Convention
- Reference images: `assets/reference/*.png`
- 3D meshes: `assets/meshes/*.glb` or `*.obj`
- Rigged models: `assets/rigged/*.fbx`
- Animations: `assets/rigged/*_walk.fbx`, `*_idle.fbx`, etc.
- Renders: `output/renders/[shot_name].mp4`

---

## Troubleshooting Checklist

- [ ] Virtual environment activated? `source venv/bin/activate`
- [ ] Dependencies installed? `pip install -r requirements.txt`
- [ ] Blender installed? `which blender` or `blender --version`
- [ ] Mesh file exists? `ls assets/meshes/`
- [ ] Rigged FBX downloaded from Mixamo? `ls assets/rigged/`
- [ ] Script permissions? `chmod +x scripts/*.py`
- [ ] GPU available for Colab? Runtime > Change runtime type > GPU

---

## Questions or Issues for Next Session

**Current blocker:** Awaiting Mixamo to accept `pip_repaired.glb` and auto-rig successfully.

**If user returns with new issue:**
- Check git log for recent changes
- Review this file for context
- Run appropriate validation script (e.g., `prep_for_mixamo.py`)
- Refer to stage-specific documentation (README.md)

---

**Last edited:** 2026-09-03  
**By:** Claude Code (Haiku 4.5)  
**Next check-in:** After Mixamo rigging succeeds
