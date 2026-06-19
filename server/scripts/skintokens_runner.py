import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests


def emit(event: str, **payload):
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def parse_args():
    parser = argparse.ArgumentParser("Asset ManagerTools SkinTokens runner")
    parser.add_argument("--skintokens-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-ckpt", required=True)
    parser.add_argument("--hf-path", default=None)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--top-p", type=float, default=0.95)
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--repetition-penalty", type=float, default=2.0)
    parser.add_argument("--num-beams", type=int, default=10)
    parser.add_argument("--use-skeleton", action="store_true")
    parser.add_argument("--use-transfer", action="store_true")
    parser.add_argument("--use-postprocess", action="store_true")
    parser.add_argument("--bone-names", choices=["articulated", "mixamo", "ue5"], default="articulated")
    parser.add_argument("--bpy-mode", choices=["existing", "embedded", "headless"], default="headless")
    parser.add_argument("--bpy-url", default=os.environ.get("AMT_SKINTOKENS_BPY_URL", "http://127.0.0.1:18176"))
    return parser.parse_args()


def wait_for_existing_bpy(url: str, timeout: float = 5.0):
    deadline = time.time() + timeout
    last_error: Optional[Exception] = None
    while time.time() < deadline:
        try:
            res = requests.get(f"{url}/ping", timeout=1)
            if res.ok and "pong" in res.text.lower():
                return
        except Exception as exc:
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"Existing bpy server is not ready at {url}: {last_error}")


def main():
    args = parse_args()
    root = Path(args.skintokens_root).resolve()
    if not root.exists():
        raise RuntimeError(f"SkinTokens root does not exist: {root}")

    sys.path.insert(0, str(root))
    os.chdir(root)
    os.environ.setdefault("XFORMERS_IGNORE_FLASH_VERSION_CHECK", "1")

    emit("runner_start", skintokensRoot=str(root), input=args.input, output=args.output, bpyMode=args.bpy_mode)

    import demo  # type: ignore

    server_proc = None
    if args.bpy_mode == "existing":
        wait_for_existing_bpy(args.bpy_url)
        emit("bpy_ready", mode="existing", url=args.bpy_url)
    else:
        server_proc = demo.start_bpy_server(use_blender=args.bpy_mode == "headless")
        demo.wait_for_bpy_server()
        emit("bpy_ready", mode=args.bpy_mode, url=args.bpy_url)

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    convention: bool | str = False
    if args.bone_names == "mixamo":
        convention = "Mixamo"
    elif args.bone_names == "ue5":
        convention = "UE5"

    try:
        demo.run_rig(
            [input_path],
            args.top_k,
            args.top_p,
            args.temperature,
            args.repetition_penalty,
            args.num_beams,
            args.use_skeleton,
            args.use_transfer,
            args.use_postprocess,
            [output_path],
            args.model_ckpt,
            args.hf_path,
            rename_ue5=convention,
        )
    finally:
        if server_proc is not None:
            try:
                server_proc.terminate()
            except Exception:
                pass

    if not output_path.exists():
        raise RuntimeError(f"SkinTokens did not create output file: {output_path}")

    emit("runner_complete", output=str(output_path), size=output_path.stat().st_size)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit("runner_error", error=str(exc))
        raise
