#!/usr/bin/env python3
"""
Stage 4: Batch render animated shots from template.

Loads the Blender template, configures a shot (animation, camera, duration),
and renders to video or image sequence.

Run via:
    blender --background assets/pip_template.blend --python scripts/render.py -- \\
        --shot-config shots/episode_1.json

Requires: Blender 3.0+ with bpy and ffmpeg (for MP4 output)
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

try:
    import bpy
except ImportError:
    print("Error: This script must be run via: blender --background <file.blend> --python <script>")
    sys.exit(1)


def load_shot_config(config_path: str) -> dict:
    """Load shot configuration from JSON."""
    with open(config_path, 'r') as f:
        return json.load(f)


def get_nla_track_duration(armature, track_name: str) -> tuple:
    """Get frame range for an NLA track. Returns (start_frame, end_frame)."""
    if not armature.animation_data or not armature.animation_data.nla_tracks:
        return (1, 250)  # Default

    for track in armature.animation_data.nla_tracks:
        if track.name == track_name or track_name.lower() in track.name.lower():
            if track.strips:
                strip = track.strips[0]
                return (int(strip.frame_start), int(strip.frame_end))

    return (1, 250)  # Default if track not found


def find_armature() -> object:
    """Find armature (skeleton) in the scene."""
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None


def configure_shot(shot_config: dict):
    """Apply shot configuration to scene."""
    print(f"\n📹 Configuring shot: {shot_config.get('name', 'Untitled')}")
    print("-" * 60)

    # Get scene
    scene = bpy.context.scene

    # Frame range from config or auto-detect from animation
    if "animation" in shot_config:
        anim_name = shot_config["animation"]
        armature = find_armature()
        if armature:
            start, end = get_nla_track_duration(armature, anim_name)
            print(f"  Animation: {anim_name}")
            print(f"  Frames: {start}–{end}")
        else:
            start, end = 1, 250
            print(f"  ⚠ No armature found; using default frames {start}–{end}")
    else:
        start = shot_config.get("frame_start", 1)
        end = shot_config.get("frame_end", 250)
        print(f"  Frames: {start}–{end}")

    scene.frame_start = start
    scene.frame_end = end

    # Playback speed (if specified)
    if "playback_speed" in shot_config:
        scene.render.fps = shot_config["playback_speed"]
        print(f"  Playback speed: {shot_config['playback_speed']} fps")

    # Camera configuration
    if "camera" in shot_config and bpy.context.scene.camera:
        camera_config = shot_config["camera"]
        camera = bpy.context.scene.camera

        if "location" in camera_config:
            loc = camera_config["location"]
            camera.location = (loc[0], loc[1], loc[2])
            print(f"  Camera location: {loc}")

        if "rotation" in camera_config:
            rot = camera_config["rotation"]
            camera.rotation_euler = (rot[0], rot[1], rot[2])

        if "lens" in camera_config:
            bpy.context.scene.camera.data.lens = camera_config["lens"]
            print(f"  Camera lens: {camera_config['lens']}mm")

    # Background/environment
    if "background" in shot_config:
        bg_config = shot_config["background"]
        if bg_config.get("type") == "transparent":
            scene.render.film_transparent = True
            print(f"  Background: Transparent")
        elif bg_config.get("type") == "color":
            scene.render.film_transparent = False
            color = bg_config.get("color", [0.9, 0.9, 0.95])
            world = bpy.data.worlds["World"]
            if world.use_nodes:
                bg_node = world.node_tree.nodes.get("Background")
                if bg_node:
                    bg_node.inputs[0].default_value = (color[0], color[1], color[2], 1.0)
            print(f"  Background: Color {color}")

    # Render settings
    render = scene.render
    if "resolution" in shot_config:
        res = shot_config["resolution"]
        render.resolution_x = res[0]
        render.resolution_y = res[1]
        print(f"  Resolution: {res[0]}×{res[1]}")

    if "samples" in shot_config:
        # Cycles render samples
        if scene.cycles:
            scene.cycles.samples = shot_config["samples"]
        print(f"  Samples: {shot_config['samples']}")

    # Engine
    if "engine" in shot_config:
        scene.render.engine = shot_config["engine"]
        print(f"  Render engine: {shot_config['engine']}")

    print("  ✓ Configuration applied")


def setup_output(shot_config: dict, output_dir: Path) -> str:
    """Set up render output path and format. Returns output filepath."""
    scene = bpy.context.scene
    render = scene.render

    output_dir.mkdir(parents=True, exist_ok=True)

    # Filename from config or generate from shot name
    filename = shot_config.get("output_name")
    if not filename:
        shot_name = shot_config.get("name", "shot").replace(" ", "_").lower()
        filename = shot_name

    # Format
    output_format = shot_config.get("output_format", "mp4")

    if output_format == "mp4":
        # Video output
        render.image_settings.file_format = 'FFMPEG'
        render.ffmpeg.format = 'MPEG4'
        render.ffmpeg.codec = 'h264'
        output_path = output_dir / f"{filename}.mp4"
        render.filepath = str(output_path)
        print(f"  Output format: MP4 video")

    elif output_format == "image_sequence":
        # Image sequence (PNG)
        render.image_settings.file_format = 'PNG'
        shot_dir = output_dir / filename
        shot_dir.mkdir(exist_ok=True)
        render.filepath = str(shot_dir / "frame_####")
        output_path = shot_dir
        print(f"  Output format: PNG sequence")

    elif output_format == "exr":
        # EXR sequence (for compositing)
        render.image_settings.file_format = 'OPEN_EXR'
        shot_dir = output_dir / filename
        shot_dir.mkdir(exist_ok=True)
        render.filepath = str(shot_dir / "frame_####.exr")
        output_path = shot_dir
        print(f"  Output format: OpenEXR sequence")

    else:
        # Default to MP4
        render.image_settings.file_format = 'FFMPEG'
        render.ffmpeg.format = 'MPEG4'
        output_path = output_dir / f"{filename}.mp4"
        render.filepath = str(output_path)

    print(f"  Output: {output_path}")
    return str(output_path)


def render_shot(shot_config: dict):
    """Render a single shot."""
    print(f"\n🎬 Rendering: {shot_config.get('name', 'Untitled')}")
    print("-" * 60)

    scene = bpy.context.scene

    # Disable viewport shading for faster render
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'MATERIAL'

    print(f"  Rendering frames {scene.frame_start}–{scene.frame_end}...")

    # Render
    try:
        bpy.ops.render.render(animation=True, write_still=False)
        print(f"  ✓ Render complete")
    except Exception as e:
        print(f"  ✗ Render failed: {e}")
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Render a single shot or batch of shots from Blender template.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  blender --background assets/pip_template.blend --python scripts/render.py -- \\
    --shot-config shots/scene_1.json

  blender --background assets/pip_template.blend --python scripts/render.py -- \\
    --batch shots/episode_1_config.json
        """
    )

    parser.add_argument(
        "--shot-config",
        help="Single shot config JSON file"
    )
    parser.add_argument(
        "--batch",
        help="Batch config JSON file (list of shots)"
    )
    parser.add_argument(
        "--output-dir",
        default="output/renders",
        help="Output directory (default: output/renders)"
    )

    # Parse args (handle -- separator)
    args_list = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(args_list)

    if not args.shot_config and not args.batch:
        parser.print_help()
        print("\nError: Specify --shot-config or --batch")
        sys.exit(1)

    try:
        print("\n" + "=" * 60)
        print("🎬 Stage 4: Batch Render")
        print("=" * 60)

        output_dir = Path(args.output_dir)

        # Single shot
        if args.shot_config:
            config_path = Path(args.shot_config)
            if not config_path.exists():
                raise FileNotFoundError(f"Config not found: {config_path}")

            shot_config = load_shot_config(str(config_path))
            configure_shot(shot_config)
            setup_output(shot_config, output_dir)
            render_shot(shot_config)

        # Batch render
        elif args.batch:
            config_path = Path(args.batch)
            if not config_path.exists():
                raise FileNotFoundError(f"Config not found: {config_path}")

            with open(config_path) as f:
                batch_config = json.load(f)

            shots = batch_config.get("shots", [])
            print(f"\n📋 Batch: {len(shots)} shot(s)")

            for i, shot_config in enumerate(shots, 1):
                print(f"\n[{i}/{len(shots)}] {shot_config.get('name', 'Untitled')}")
                configure_shot(shot_config)
                setup_output(shot_config, output_dir)
                render_shot(shot_config)

        print("\n" + "=" * 60)
        print("✅ Render complete!")
        print("=" * 60)
        print(f"\nOutput: {output_dir.resolve()}\n")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
