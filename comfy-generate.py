#!/usr/bin/env python3
"""ComfyUI 서버 API 로 Qwen-Image-2.1 GGUF 이미지를 생성하는 CLI.

사용법:
  ./run-comfyui.sh   # 다른 터미널에서 서버를 먼저 띄운다
  ./comfy-generate.py "프롬프트" -o outputs/result.png [--gguf Q8_0|Q4_K_M] [--text-encoder int8|bf16|heretic] [--steps 40] [--seed 42]
"""
import argparse, json, shutil, sys, time, urllib.request, uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
GGUF_FILES = {
    "Q8_0": "qwen-image-2.1-Q8_0.gguf",
    "Q4_K_M": "qwen-image-2.1-Q4_K_M.gguf",
}
TEXT_ENCODERS = {
    "int8": "qwen3vl_8b_int8_convrot.safetensors",
    "bf16": "qwen3vl_8b_bf16.safetensors",
    # ./install-text-encoder-heretic.sh 로 설치하는 거부 완화 GGUF 인코더
    "heretic": "qwen3vl_8b_heretic-Q4_K_M.gguf",
}
VAE = "qwen_image_2.1_vae_bf16.safetensors"


def clip_loader(clip_name):
    """GGUF 인코더는 ComfyUI-GGUF 의 CLIPLoaderGGUF 로, safetensors 는 기본 CLIPLoader 로 읽는다."""
    if clip_name.lower().endswith(".gguf"):
        return {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": clip_name, "type": "qwen_image"}}
    return {"class_type": "CLIPLoader",
            "inputs": {"clip_name": clip_name, "type": "qwen_image", "device": "default"}}


def build_workflow(a):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": GGUF_FILES[a.gguf]}},
        "2": clip_loader(TEXT_ENCODERS[a.text_encoder]),
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": a.prompt, "negative_prompt": a.negative_prompt,
                         "vae": ["3", 0], "resolution": 1024}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": a.width, "height": a.height, "batch_size": 1}},
        "6": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["5", 0],
                         "seed": a.seed, "steps": a.steps, "cfg": a.cfg,
                         "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["3", 0]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": "qwen21_gguf"}},
    }


def api(server, path, data=None):
    req = urllib.request.Request(f"{server}{path}",
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("prompt")
    p.add_argument("-o", "--output", default=None, help="저장 경로 (기본: outputs/qwen21_gguf_XXXXX.png)")
    p.add_argument("--negative-prompt", default="")
    p.add_argument("--gguf", choices=GGUF_FILES, default="Q8_0")
    p.add_argument("--text-encoder", choices=TEXT_ENCODERS, default="int8")
    p.add_argument("--steps", type=int, default=40)
    p.add_argument("--cfg", type=float, default=1.0, help="부정 프롬프트를 쓸 때만 1보다 크게")
    p.add_argument("--seed", type=int, default=int(time.time()) % 2_000_000_000)
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--height", type=int, default=1024)
    p.add_argument("--server", default="http://127.0.0.1:8188")
    a = p.parse_args()

    try:
        api(a.server, "/system_stats")
    except Exception as e:
        sys.exit(f"ComfyUI 서버에 연결할 수 없습니다 ({a.server}): {e}\n먼저 ./run-comfyui.sh 로 서버를 실행하세요.")

    client_id = str(uuid.uuid4())
    res = api(a.server, "/prompt", {"prompt": build_workflow(a), "client_id": client_id})
    if "prompt_id" not in res:
        sys.exit(f"워크플로 제출 실패: {json.dumps(res, ensure_ascii=False, indent=2)}")
    pid = res["prompt_id"]
    print(f"제출됨 prompt_id={pid} seed={a.seed} gguf={a.gguf} te={a.text_encoder} {a.width}x{a.height} steps={a.steps}")

    t0 = time.time()
    while True:
        hist = api(a.server, f"/history/{pid}")
        if pid in hist:
            break
        q = api(a.server, "/queue")
        running = len(q.get("queue_running", [])); pending = len(q.get("queue_pending", []))
        print(f"\r생성 중... {time.time() - t0:5.0f}s (실행 {running}, 대기 {pending})", end="", flush=True)
        time.sleep(2)
    print()
    entry = hist[pid]
    status = entry.get("status", {})
    if status.get("status_str") == "error":
        msgs = [m for m in status.get("messages", []) if m[0] == "execution_error"]
        sys.exit("실행 오류:\n" + json.dumps(msgs, ensure_ascii=False, indent=2))

    images = [img for out in entry["outputs"].values() for img in out.get("images", [])]
    if not images:
        sys.exit("출력 이미지가 없습니다.")
    img = images[0]
    src = HERE / "outputs" / img.get("subfolder", "") / img["filename"]
    if a.output:
        dst = Path(a.output); dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(src, dst)
    else:
        dst = src
    print(f"완료 ({time.time() - t0:.0f}s): {dst}")


if __name__ == "__main__":
    main()
