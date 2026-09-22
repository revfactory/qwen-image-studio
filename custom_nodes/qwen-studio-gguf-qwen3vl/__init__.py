"""
Qwen-Image-2.1 (Qwen3-VL) GGUF 텍스트 인코더에 비전 타워(mmproj)를 붙여 주는 보완 모듈.

ComfyUI-GGUF 의 gguf_clip_loader 는 qwen2vl 아키텍처에만 같은 폴더의 mmproj-*.gguf 를 자동으로 읽는다.
Qwen-Image-2.1 의 텍스트 인코더(qwen3vl)는 참조 이미지를 비전 타워로 처리하므로, 비전 가중치(model.visual.*)가
빠지면 편집 결과가 깨진다. 이 모듈은 ComfyUI-GGUF 의 로더를 감싸서 qwen3vl 인코더를 읽을 때 mmproj 를 찾아
ComfyUI 의 Qwen3-VL 키 이름으로 옮겨 넣는다. 노드는 추가하지 않는다.

mmproj 파일은 텍스트 인코더와 같은 폴더(models/text_encoders/)에 있어야 하고, 이름에 "mmproj" 와
인코더 이름(양자화 접미사 제외, 예: qwen3vl_8b_heretic)이 들어 있어야 한다.
"""
import logging
import os
import re
import sys

import torch

LOG = logging.getLogger("qwen-studio-gguf-qwen3vl")

# (정규식, 치환) — llama.cpp mmproj 텐서 이름 → ComfyUI Qwen3-VL 비전 키
QWEN3VL_VISION_MAP = [
    (r"^v\.blk\.(\d+)\.attn_qkv\.", r"model.visual.blocks.\1.attn.qkv."),
    (r"^v\.blk\.(\d+)\.attn_out\.", r"model.visual.blocks.\1.attn.proj."),
    (r"^v\.blk\.(\d+)\.ffn_up\.", r"model.visual.blocks.\1.mlp.linear_fc1."),
    (r"^v\.blk\.(\d+)\.ffn_down\.", r"model.visual.blocks.\1.mlp.linear_fc2."),
    (r"^v\.blk\.(\d+)\.ln1\.", r"model.visual.blocks.\1.norm1."),
    (r"^v\.blk\.(\d+)\.ln2\.", r"model.visual.blocks.\1.norm2."),
    (r"^v\.post_ln\.", "model.visual.merger.norm."),
    (r"^v\.patch_embd\.", "model.visual.patch_embed.proj."),
    (r"^v\.position_embd\.", "model.visual.pos_embed."),
]


def _find_gguf_modules():
    """sys.modules 에서 ComfyUI-GGUF 의 loader / nodes 모듈을 찾는다."""
    loader_mod = nodes_mod = None
    for name, mod in list(sys.modules.items()):
        if mod is None:
            continue
        if name.endswith(".loader") and hasattr(mod, "gguf_clip_loader") and hasattr(mod, "gguf_sd_loader"):
            loader_mod = mod
        if name.endswith(".nodes") and hasattr(mod, "CLIPLoaderGGUF") and hasattr(mod, "gguf_clip_loader"):
            nodes_mod = mod
    return loader_mod, nodes_mod


def _gguf_arch(path):
    try:
        import gguf

        reader = gguf.GGUFReader(path)
        field = reader.fields.get("general.architecture")
        if field is None:
            return None
        return bytes(field.parts[field.data[0]]).decode("utf-8")
    except Exception as err:  # noqa: BLE001
        LOG.warning("GGUF 아키텍처를 읽지 못했습니다 (%s): %s", path, err)
        return None


def _find_mmproj(path, loader_mod):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    stem = loader_mod.strip_quant_suffix(stem)
    root = os.path.dirname(path)
    hits = []
    for fname in os.listdir(root):
        name, ext = os.path.splitext(fname)
        if ext.lower() != ".gguf" or "mmproj" not in name.lower():
            continue
        if stem in name.lower():
            hits.append(fname)
    if not hits:
        LOG.error("'%s' 에 맞는 mmproj 파일이 없습니다 (이름에 '%s' 와 'mmproj' 포함). 참조 이미지 편집이 깨집니다.", os.path.basename(path), stem)
        return None
    if len(hits) > 1:
        LOG.warning("mmproj 후보가 여러 개입니다 %s. 첫 번째를 씁니다.", hits)
    return os.path.join(root, sorted(hits)[0])


def _load_qwen3vl_mmproj(path, loader_mod):
    target = _find_mmproj(path, loader_mod)
    if target is None:
        return {}
    LOG.info("Qwen3-VL 비전 타워를 읽습니다: %s", os.path.basename(target))
    vsd, _ = loader_mod.gguf_sd_loader(target, is_text_model=True)

    # 패치 임베딩은 llama.cpp 가 시간축 2개를 별도 텐서로 나눠 저장한다 → [out, in, 2, 16, 16] 로 합친다.
    if "v.patch_embd.weight.1" in vsd:
        w1 = loader_mod.dequantize_tensor(vsd.pop("v.patch_embd.weight"), dtype=torch.float32)
        w2 = loader_mod.dequantize_tensor(vsd.pop("v.patch_embd.weight.1"), dtype=torch.float32)
        vsd["v.patch_embd.weight"] = torch.stack([w1, w2], dim=2)

    # 병합기(merger) 선형층: mm.<i> 인덱스 순서대로 linear_fc1, linear_fc2
    mm_indices = sorted({int(m.group(1)) for k in vsd for m in [re.match(r"^mm\.(\d+)\.", k)] if m})
    mm_map = {}
    if len(mm_indices) >= 2:
        mm_map = {mm_indices[0]: "model.visual.merger.linear_fc1.", mm_indices[-1]: "model.visual.merger.linear_fc2."}
    elif mm_indices:
        LOG.warning("mm 투영층 텐서가 %d개뿐입니다: %s", len(mm_indices), mm_indices)

    # DeepStack 병합기: llama.cpp 는 비전 레이어 번호(예: 8, 16, 24)로 저장하지만 ComfyUI 는 0, 1, 2 순번을 쓴다.
    # ComfyUI 는 deepstack_merger_list.0 키가 있어야 Qwen3-VL 로 판별하므로 이 번호 매김이 꼭 필요하다.
    ds_indices = sorted({int(m.group(1)) for k in vsd for m in [re.match(r"^v\.deepstack\.(\d+)\.", k)] if m})
    ds_rank = {idx: rank for rank, idx in enumerate(ds_indices)}
    if ds_indices:
        LOG.info("DeepStack 병합기 번호 %s → %s", ds_indices, list(range(len(ds_indices))))

    out = {}
    unmapped = []
    for key, value in vsd.items():
        new_key = None
        m = re.match(r"^mm\.(\d+)\.(.+)$", key)
        ds = re.match(r"^v\.deepstack\.(\d+)\.(fc1|fc2|norm)\.(.+)$", key)
        if m and int(m.group(1)) in mm_map:
            new_key = mm_map[int(m.group(1))] + m.group(2)
        elif ds:
            part = {"fc1": "linear_fc1", "fc2": "linear_fc2", "norm": "norm"}[ds.group(2)]
            new_key = f"model.visual.deepstack_merger_list.{ds_rank[int(ds.group(1))]}.{part}.{ds.group(3)}"
        else:
            for pattern, repl in QWEN3VL_VISION_MAP:
                if re.match(pattern, key):
                    new_key = re.sub(pattern, repl, key)
                    break
        if new_key is None:
            unmapped.append(key)
            continue
        out[new_key] = value
    if unmapped:
        LOG.warning("대응을 찾지 못한 mmproj 텐서 %d개 (무시): %s", len(unmapped), unmapped[:8])
    LOG.info("Qwen3-VL 비전 타워 %d개 텐서를 붙였습니다.", len(out))
    return out


def _install():
    loader_mod, nodes_mod = _find_gguf_modules()
    if loader_mod is None or nodes_mod is None:
        LOG.error("ComfyUI-GGUF 모듈을 찾지 못했습니다. ComfyUI-GGUF 가 먼저 로드되어야 합니다.")
        return False
    original = nodes_mod.gguf_clip_loader
    if getattr(original, "_qwen3vl_patched", False):
        return True

    def gguf_clip_loader_with_qwen3vl_vision(path):
        sd = original(path)
        try:
            has_vision = any(k.startswith("model.visual.") for k in sd)
            if not has_vision and _gguf_arch(path) == "qwen3vl":
                sd.update(_load_qwen3vl_mmproj(path, loader_mod))
        except Exception as err:  # noqa: BLE001
            LOG.error("Qwen3-VL 비전 타워를 붙이지 못했습니다: %s", err)
        return sd

    gguf_clip_loader_with_qwen3vl_vision._qwen3vl_patched = True
    nodes_mod.gguf_clip_loader = gguf_clip_loader_with_qwen3vl_vision
    loader_mod.gguf_clip_loader = gguf_clip_loader_with_qwen3vl_vision
    LOG.info("ComfyUI-GGUF 텍스트 인코더 로더에 Qwen3-VL mmproj 지원을 추가했습니다.")
    return True


if not _install():
    # 커스텀 노드 로딩 순서상 ComfyUI-GGUF 가 아직 없으면, 첫 프롬프트 실행 직전에 다시 시도한다.
    try:
        import server

        def _install_before_prompt(json_data):
            _install()
            return json_data

        server.PromptServer.instance.add_on_prompt_handler(_install_before_prompt)
        LOG.info("ComfyUI-GGUF 가 아직 로드되지 않아 첫 프롬프트 실행 전에 다시 시도합니다.")
    except Exception as err:  # noqa: BLE001
        LOG.error("지연 설치 등록 실패: %s", err)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
