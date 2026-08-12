"""
Greedy-decode equivalence gate (TECH_PLAN step 8): load Stage-1 d8 *SFT* weights into
both nanochat's Engine and ArcherChat's Engine (sharing one tokenizer), greedy-decode
256 tokens from a fixed chat prompt, and require the token sequences to match exactly
— at num_samples=1 AND num_samples=4 (catches batched-decode bugs).
"""
import os
import sys
import glob
import json

import torch

sys.path.append(os.path.expanduser("~/nanochat"))

from archerchat.checkpoint import build_model
from archerchat.dataloader import get_tokenizer
from archerchat.engine import Engine as ArcherEngine
from nanochat.gpt import GPT as NanoGPT, GPTConfig as NanoConfig
from nanochat.engine import Engine as NanoEngine

SFT = os.path.expanduser("~/.cache/nanochat/chatsft_checkpoints/d8")
device = torch.device("cuda")

# ---- ArcherChat model via build_model (remaps nanochat keys) -----------------
archer_model, tok, meta = build_model(SFT, step=None, device=device, phase="eval")
print("archer d8-SFT loaded")

# ---- nanochat model from the same raw checkpoint -----------------------------
meta_path = glob.glob(os.path.join(SFT, "meta_*.json"))[0]
model_path = glob.glob(os.path.join(SFT, "model_*.pt"))[0]
cfg_kwargs = json.load(open(meta_path))["model_config"]
state = torch.load(model_path, map_location=device, weights_only=False)
state = {k.removeprefix("_orig_mod."): v for k, v in state.items()}
with torch.device("meta"):
    nano_model = NanoGPT(NanoConfig(**cfg_kwargs))
nano_model.to_empty(device=device)
nano_model.init_weights()
nano_model.load_state_dict(state, strict=True, assign=True)
nano_model.eval()
print("nano d8-SFT loaded (strict=True)")

# ---- fixed chat prompt (same list of ints for both) --------------------------
bos = tok.get_bos_token_id()
us = tok.encode_special("<|user_start|>")
ue = tok.encode_special("<|user_end|>")
a_start = tok.encode_special("<|assistant_start|>")
prompt = [bos, us] + tok.encode("What is the capital of France?") + [ue, a_start]
print(f"prompt = {len(prompt)} tokens")

archer_engine = ArcherEngine(archer_model, tok)
nano_engine = NanoEngine(nano_model, tok)
kw = dict(max_tokens=256, temperature=0.0)  # greedy

ok = True
for ns in (1, 4):
    a_res, _ = archer_engine.generate_batch(prompt, num_samples=ns, **kw)
    n_res, _ = nano_engine.generate_batch(prompt, num_samples=ns, **kw)
    for i in range(ns):
        a_comp = a_res[i][len(prompt):]
        n_comp = n_res[i][len(prompt):]
        same = a_comp == n_comp
        ok = ok and same
        if i == 0:
            print(f"\nnum_samples={ns} row0: {len(a_comp)} archer / {len(n_comp)} nano tokens, match={same}")
            print("  archer:", repr(tok.decode(a_comp[:80])))
        elif not same:
            first = next(j for j in range(min(len(a_comp), len(n_comp))) if a_comp[j] != n_comp[j])
            print(f"  row{i} MISMATCH at token {first}: archer {a_comp[first]} != nano {n_comp[first]}")
    print(f"num_samples={ns}: all rows match = {all(a_res[i][len(prompt):] == n_res[i][len(prompt):] for i in range(ns))}")

print("\nGREEDY-DECODE EQUIVALENCE:", "PASS ✅" if ok else "CHECK ⚠️")
