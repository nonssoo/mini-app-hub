# Sketchfab Auto-Rig Fallback Workflow

**Status:** Active fallback for Mixamo rigging failures  
**Mesh ready:** `assets/meshes/pip_repaired.glb`  
**Target:** Download rigged FBX → `assets/rigged/pip_rigged.fbx`

---

## Quick Start (5 minutes)

### 1️⃣ Upload to Sketchfab
```bash
1. Go to https://sketchfab.com/
2. Sign in (create free account if needed)
3. Click "Upload"
4. Select: assets/meshes/pip_repaired.glb
5. Title: "Pip Auto-Rig Fallback"
6. Click "Upload and Publish"
7. Wait 1-5 min for processing
```

### 2️⃣ Apply Auto-Rig
```bash
1. Go to your model page
2. Click "Edit" (pencil icon)
3. Look for "Auto-Rig" or "Rigging" tool
4. Click to apply → preview
5. If satisfied, go to Step 3
```

### 3️⃣ Download FBX
```bash
1. Click "Download" button
2. Format: "Autodesk FBX (.fbx)"
3. Save to: ~/Desktop/pip_rigged_from_sketchfab.fbx
```

### 4️⃣ Validate & Import
```bash
# Show detailed instructions
python scripts/sketchfab_rig_workflow.py --instructions

# Validate the downloaded FBX
python scripts/sketchfab_rig_workflow.py --validate ~/Desktop/pip_rigged_from_sketchfab.fbx

# If validation passes, move to assets and test
blender --background assets/pip_template.blend --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx
```

---

## Pros & Cons

### ✅ Advantages
- **Fast:** 5-10 minutes end-to-end
- **No code:** Web UI, point-and-click
- **Free:** Sketchfab has free tier with downloads
- **Backup:** If Mixamo fails again, you have tested alternative
- **Output:** Compatible FBX with skeleton

### ⚠️ Limitations
- **Web-dependent:** Requires internet + Sketchfab account
- **Variable quality:** Auto-rig quality depends on mesh topology
- **Premium features:** Some Sketchfab rigging tools may require paid tier
- **Manual upload:** Not scriptable/automated

---

## If Auto-Rig Fails

If Sketchfab doesn't have auto-rig or result is poor:

**Option A: Blender Rigify Script** (local, automated)
```bash
# Create automated rig via Blender Rigify addon
blender --background assets/meshes/pip_repaired.glb --python scripts/rigify_auto.py
# (script to be created)
```

**Option B: Simplified Pipeline** (no skeleton)
```bash
# Use shape keys instead of skeleton for animation
# Skip rigging, use Blender deformation only
# Faster but less flexible
```

**Option C: Try again with different mesh**
```bash
# Decimate mesh further (reduce complexity)
python scripts/prep_for_mixamo.py assets/meshes/pip_model_v2.glb --decimate 0.25
# Then upload decimated version to Sketchfab
```

---

## Files & Scripts

- `scripts/sketchfab_rig_workflow.py` — Helper script (instructions + validation)
- `assets/meshes/pip_repaired.glb` — Ready-to-upload mesh
- `assets/rigged/` — Where downloaded FBX will be stored

---

## Next: Integration

Once FBX is in `assets/rigged/pip_rigged.fbx`:

```bash
# Stage 3: Import to Blender + setup animation
blender --background assets/pip_template.blend --python scripts/import_and_animate.py -- \
  --character assets/rigged/pip_rigged.fbx

# Stage 4: Render test shot
blender --background assets/pip_template.blend --python scripts/render.py -- \
  --shot-config shots/example_single_shot.json
```

---

**Questions?** See `README.md` for full pipeline documentation.
