"""
archerchat/dataloader.py — tokenizing distributed pretraining dataloader.

Implement everything marked NotImplementedError.
train.py calls get_tokenizer(), get_token_bytes(), and make_pretrain_dataloader().

What to implement:
  - get_tokenizer(): load Stage 1's tokenizer from ~/.cache/nanochat/tokenizer/
  - get_token_bytes(): build a (vocab_size,) int tensor mapping token_id → UTF-8 byte count
  - make_pretrain_dataloader(): infinite generator over the pretraining corpus

Design (match nanochat's dataloader.py):
  - List all parquet shards from ~/.cache/nanochat/base_data_climbmix/ (last shard = val)
  - Tokenize lazily with BOS-aligned best-fit packing
  - Distributed: EVERY rank reads EVERY shard, and they split by ROW GROUP within each
    shard (rg_idx % world_size == rank, reset to rg_idx = rank per shard).
    NOT by shard — an earlier version of this file claimed `shard_idx % world_size == rank`,
    which is not what nanochat does.
  - Long documents are CROPPED (tail discarded), not split across rows. ~35% of tokens
    are dropped at T=2048. That is the oracle's behavior; don't "fix" it.
  - State dict: {shard_idx, row_group_idx, doc_offset, epoch, doc_buffer}.
    There is NO byte_offset — parquet is row-group addressed, so the old
    (shard_idx, byte_offset, epoch) spec was not implementable as written.
    NOTE: nanochat's own resume is APPROXIMATE (its source says so) — it saves only
    (pq_idx, rg_idx, epoch), throws away the packing buffer, and skips a row group
    forward, so a resumed run does NOT reproduce the batch stream. That fails this
    project's gate, so our state is a strict superset: doc_buffer records the documents
    still in the packing buffer, making restarts genuinely deterministic. Fresh-start
    streams remain bit-equal to nanochat.

Acceptance gate (step 4):
  - Tokenization: SHA-256 of first 1M token ids from shard 0 == nanochat's
  - Restart: run 1000 steps, save state, restart, run 1000 more → same batches as
    a continuous run at steps 1001–2000
"""

from __future__ import annotations

import os
import pickle
from typing import Generator

import pyarrow.parquet as pq
import tiktoken
import torch

from archerchat.common import get_base_dir

# nanochat dataloader defaults. Changing any of these changes the batch stream.
TOKENIZER_THREADS = 4
TOKENIZER_BATCH_SIZE = 128
DOC_BUFFER_SIZE = 1000

# Stage 1 artifacts (tokenizer + pretraining shards) live in nanochat's cache and are the
# numerical oracle: reuse them rather than re-training / re-downloading. ArcherChat's own
# base dir wins if it holds the artifact (e.g. ARCHERCHAT_BASE_DIR points at a fresh box).
STAGE1_BASE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "nanochat")
DATA_DIRNAME = "base_data_climbmix"
TOKENIZER_DIRNAME = "tokenizer"

# Special tokens, in id order (nanochat tokenizer.py SPECIAL_TOKENS). Only used to build
# the tokenizer from a raw rustbpe file; the pickled tiktoken Encoding already knows them.
SPECIAL_TOKENS = [
    "<|bos|>",
    "<|user_start|>",
    "<|user_end|>",
    "<|assistant_start|>",
    "<|assistant_end|>",
    "<|python_start|>",
    "<|python_end|>",
    "<|output_start|>",
    "<|output_end|>",
]


def _artifact_dir(name: str) -> str:
    d = os.path.join(get_base_dir(), name)
    if os.path.isdir(d):
        return d
    stage1 = os.path.join(STAGE1_BASE_DIR, name)
    if os.path.isdir(stage1):
        return stage1
    raise FileNotFoundError(
        f"Could not find '{name}' under {get_base_dir()} or {STAGE1_BASE_DIR}. "
        f"Stage 1 artifacts are expected in {STAGE1_BASE_DIR}."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Tokenizer helpers
# ─────────────────────────────────────────────────────────────────────────────

class Tokenizer:
    """
    Thin wrapper around a tiktoken Encoding, mirroring nanochat's RustBPETokenizer.

    Trained by Stage 1's rustbpe; tiktoken is only the inference-side encoder, so the
    token ids are identical to nanochat's by construction (same mergeable ranks, same
    split pattern, same special-token ids).
    """

    def __init__(self, enc: tiktoken.Encoding, bos_token: str = "<|bos|>"):
        self.enc = enc
        self.bos_token_id = self.encode_special(bos_token)

    @classmethod
    def from_directory(cls, tokenizer_dir: str) -> "Tokenizer":
        with open(os.path.join(tokenizer_dir, "tokenizer.pkl"), "rb") as f:
            enc = pickle.load(f)
        return cls(enc)

    def get_vocab_size(self) -> int:
        return self.enc.n_vocab

    def get_special_tokens(self) -> set[str]:
        return self.enc.special_tokens_set

    def get_bos_token_id(self) -> int:
        return self.bos_token_id

    def encode_special(self, text: str) -> int:
        return self.enc.encode_single_token(text)

    def id_to_token(self, token_id: int) -> str:
        return self.enc.decode([token_id])

    def encode(self, text, prepend=None, append=None, num_threads: int = 8):
        # text is a single string or a list of strings; special tokens in the text are
        # NOT parsed (encode_ordinary), they can only be added via prepend/append.
        if prepend is not None:
            prepend_id = prepend if isinstance(prepend, int) else self.encode_special(prepend)
        if append is not None:
            append_id = append if isinstance(append, int) else self.encode_special(append)

        if isinstance(text, str):
            ids = self.enc.encode_ordinary(text)
            if prepend is not None:
                ids.insert(0, prepend_id)
            if append is not None:
                ids.append(append_id)
        elif isinstance(text, list):
            ids = self.enc.encode_ordinary_batch(text, num_threads=num_threads)
            if prepend is not None:
                for row in ids:
                    row.insert(0, prepend_id)
            if append is not None:
                for row in ids:
                    row.append(append_id)
        else:
            raise ValueError(f"Invalid input type: {type(text)}")
        return ids

    def __call__(self, *args, **kwargs):
        return self.encode(*args, **kwargs)

    def decode(self, ids) -> str:
        return self.enc.decode(ids)

    # NOTE: the chat template (render_conversation / build_example) lives in sft.py,
    # which takes the tokenizer as its first argument. Nothing chat-related here.


def get_tokenizer():
    """
    Load Stage 1's RustBPE tokenizer from ~/.cache/nanochat/tokenizer/.

    Returns a tokenizer object with at minimum:
        .encode(text: str) -> list[int]
        .encode_special(token: str) -> int      (delimiters must bypass BPE — sft.py needs this)
        .decode(ids) -> str
        .get_vocab_size() -> int
        .get_bos_token_id() -> int

    NOT .render_conversation() — unlike nanochat, ArcherChat's chat template lives in
    sft.py (which takes the tokenizer as its first argument), not on the tokenizer.

    Do NOT retrain or modify the tokenizer — it must be byte-for-byte identical
    to Stage 1's so all bpb comparisons remain valid.

    Implementation: use rustbpe.Tokenizer.from_file(path) or nanochat's
    RustBPETokenizer wrapper — whichever is available in the installed packages.
    """
    return Tokenizer.from_directory(_artifact_dir(TOKENIZER_DIRNAME))


def _compute_token_bytes(tokenizer) -> torch.Tensor:
    # Same procedure as nanochat's tok_train.py (which writes token_bytes.pt): the byte
    # count comes from the *decoded string*, so tokens that are not valid utf-8 on their
    # own count their replacement char. Do not "fix" this — it would change bpb.
    vocab_size = tokenizer.get_vocab_size()
    special_set = set(tokenizer.get_special_tokens())
    counts = []
    for token_id in range(vocab_size):
        token_str = tokenizer.decode([token_id])
        counts.append(0 if token_str in special_set else len(token_str.encode("utf-8")))
    return torch.tensor(counts, dtype=torch.int32, device="cpu")


def get_token_bytes(device: torch.device | str = "cpu") -> torch.Tensor:
    """
    Build a 1-D int tensor mapping each token id to its UTF-8 byte count.

    Used by loss.evaluate_bpb() to convert cross-entropy loss to bits-per-byte.
    Special tokens (BOS, padding, etc.) get count 0 so they don't contribute to bpb.

    Returns:
        shape (vocab_size,), dtype torch.int32, on device

    Implementation:
        For each token id, decode the token bytes from the tokenizer's vocab and
        count the raw byte length.  BOS / special tokens: 0 bytes.
    """
    tokenizer_dir = _artifact_dir(TOKENIZER_DIRNAME)
    token_bytes_path = os.path.join(tokenizer_dir, "token_bytes.pt")
    if os.path.exists(token_bytes_path):
        # Stage 1 wrote this file next to the tokenizer; prefer it verbatim.
        with open(token_bytes_path, "rb") as f:
            token_bytes = torch.load(f, map_location=device)
    else:
        token_bytes = _compute_token_bytes(get_tokenizer()).to(device)
    return token_bytes


# ─────────────────────────────────────────────────────────────────────────────
# Pretraining dataloader
# ─────────────────────────────────────────────────────────────────────────────

def list_parquet_files(split: str) -> list[str]:
    """Shards of the pretraining corpus; the LAST shard is the val split (nanochat)."""
    assert split in ("train", "val"), "split must be 'train' or 'val'"
    data_dir = _artifact_dir(DATA_DIRNAME)
    names = sorted(f for f in os.listdir(data_dir) if f.endswith(".parquet"))
    paths = [os.path.join(data_dir, f) for f in names]
    assert paths, f"No parquet shards found in {data_dir}"
    return paths[:-1] if split == "train" else paths[-1:]


def _document_stream(paths, rank, world_size, cursor):
    """
    Infinite iterator over (texts, doc_ids, cursor) chunks of documents.

    Rank r reads row groups r, r+world_size, ... of every shard (nanochat's DDP split:
    disjoint row groups, not disjoint shards). doc_ids are (shard, row_group, index)
    triples that let a resumed loader re-read exactly these documents.
    The yielded cursor points *after* the chunk, i.e. it is where a resume starts.
    """
    epoch = cursor["epoch"]
    pq_idx = cursor["shard_idx"]
    rg_idx = cursor["row_group_idx"]
    doc_offset = cursor["doc_offset"]

    while True:  # iterate infinitely (multi-epoch)
        while pq_idx < len(paths):
            pf = pq.ParquetFile(paths[pq_idx])
            while rg_idx < pf.num_row_groups:
                texts = pf.read_row_group(rg_idx).column("text").to_pylist()
                while doc_offset < len(texts):
                    n = min(TOKENIZER_BATCH_SIZE, len(texts) - doc_offset)
                    chunk = texts[doc_offset:doc_offset + n]
                    doc_ids = [(pq_idx, rg_idx, doc_offset + j) for j in range(n)]
                    doc_offset += n
                    yield chunk, doc_ids, {
                        "shard_idx": pq_idx,
                        "row_group_idx": rg_idx,
                        "doc_offset": doc_offset,
                        "epoch": epoch,
                    }
                doc_offset = 0
                rg_idx += world_size
            pq_idx += 1
            rg_idx = rank
            doc_offset = 0
        pq_idx = 0
        rg_idx = rank
        doc_offset = 0
        epoch += 1


def _read_documents(paths, doc_ids) -> list[str]:
    """Re-read specific documents by (shard, row_group, index) — used on resume."""
    texts_by_rg: dict[tuple[int, int], list[str]] = {}
    for pq_idx, rg_idx, _ in doc_ids:
        key = (pq_idx, rg_idx)
        if key not in texts_by_rg:
            pf = pq.ParquetFile(paths[pq_idx])
            texts_by_rg[key] = pf.read_row_group(rg_idx).column("text").to_pylist()
    return [texts_by_rg[(pq_idx, rg_idx)][i] for pq_idx, rg_idx, i in doc_ids]


def make_pretrain_dataloader(
    tokenizer,
    B: int,
    T: int,
    split: str,
    device: torch.device | str,
    resume_state_dict: dict | None = None,
    rank: int = 0,
    world_size: int = 1,
) -> Generator[tuple[torch.Tensor, torch.Tensor, dict], None, None]:
    """
    Infinite generator of (inputs, targets, state_dict) for pretraining.

    Each call to next() yields one micro-batch:
        x:     (B, T) int64 on device — input token ids
        y:     (B, T) int64 on device — target token ids (x shifted right by 1)
        state: dict with keys "shard_idx", "row_group_idx", "doc_offset", "epoch",
               "doc_buffer" — enough to resume from this exact position.
               JSON-serializable (it is persisted into the checkpoint meta).

    Args:
        tokenizer:          result of get_tokenizer()
        B:                  micro-batch size in sequences (per GPU)
        T:                  sequence length in tokens
        split:              "train" or "val"
        device:             where to put the returned tensors
        resume_state_dict:  if provided, skip to this position before yielding;
                            format matches the state dict yielded by this generator
        rank:               this process's DDP rank (0 for single-GPU)
        world_size:         total number of DDP ranks (1 for single-GPU)

    Packing strategy (BOS-aligned best-fit, row_capacity = T + 1):
        - Prepend BOS to every document, tokenize.
        - Keep a ~1000-doc buffer; fill each row with the LARGEST document that still
          fits, else crop the shortest to fill the row exactly.
        - Documents longer than the row are CROPPED (tail discarded), NOT split across
          rows. ~35% of tokens are dropped at T=2048 — that is nanochat's behavior.

    Shard / rank assignment:
        EVERY rank reads EVERY shard. The split is by ROW GROUP inside each shard:
        rg_idx % world_size == rank, with rg_idx reset to `rank` at each new shard,
        epoch starting at 1. (NOT `shard_idx % world_size == rank`.)
        After all shards are exhausted, increment epoch and loop.

    Acceptance gate (TECH_PLAN step 4):
        SHA-256 of first 1M token ids from shard 0 (rank 0) must match nanochat.
    """
    assert split in ("train", "val"), "split must be 'train' or 'val'"
    paths = list_parquet_files(split)
    bos_token = tokenizer.get_bos_token_id()
    row_capacity = T + 1

    # doc_buffer entries are (tokens, doc_id). Documents enter in stream order and are
    # popped out of order by best-fit, so the buffer is always a subsequence of the
    # stream — storing the surviving doc_ids is enough to rebuild it byte-for-byte.
    if resume_state_dict is not None:
        cursor = {
            "shard_idx": resume_state_dict["shard_idx"],
            "row_group_idx": resume_state_dict["row_group_idx"],
            "doc_offset": resume_state_dict["doc_offset"],
            "epoch": resume_state_dict["epoch"],
        }
        doc_ids = [tuple(d) for d in resume_state_dict["doc_buffer"]]
        texts = _read_documents(paths, doc_ids)
        token_lists = tokenizer.encode(texts, prepend=bos_token, num_threads=TOKENIZER_THREADS)
        doc_buffer = list(zip(token_lists, doc_ids))
    else:
        cursor = {"shard_idx": 0, "row_group_idx": rank, "doc_offset": 0, "epoch": 1}
        doc_buffer = []

    documents = _document_stream(paths, rank, world_size, cursor)

    def refill_buffer():
        nonlocal cursor
        texts, doc_ids, cursor = next(documents)
        token_lists = tokenizer.encode(texts, prepend=bos_token, num_threads=TOKENIZER_THREADS)
        doc_buffer.extend(zip(token_lists, doc_ids))

    # Pre-allocate buffers once: layout is [inputs (B*T) | targets (B*T)], which gives
    # contiguous views and a single HtoD transfer per batch (nanochat convention).
    use_cuda = torch.device(device).type == "cuda"
    row_buffer = torch.empty((B, row_capacity), dtype=torch.long)
    cpu_buffer = torch.empty(2 * B * T, dtype=torch.long, pin_memory=use_cuda)
    gpu_buffer = torch.empty(2 * B * T, dtype=torch.long, device=device)
    cpu_inputs = cpu_buffer[:B * T].view(B, T)
    cpu_targets = cpu_buffer[B * T:].view(B, T)
    inputs = gpu_buffer[:B * T].view(B, T)
    targets = gpu_buffer[B * T:].view(B, T)

    while True:
        for row_idx in range(B):
            pos = 0
            while pos < row_capacity:
                while len(doc_buffer) < DOC_BUFFER_SIZE:
                    refill_buffer()

                remaining = row_capacity - pos

                # Best fit: the largest document that still fits entirely.
                best_idx, best_len = -1, 0
                for i, (doc, _) in enumerate(doc_buffer):
                    doc_len = len(doc)
                    if best_len < doc_len <= remaining:
                        best_idx, best_len = i, doc_len

                if best_idx >= 0:
                    doc, _ = doc_buffer.pop(best_idx)
                    row_buffer[row_idx, pos:pos + best_len] = torch.tensor(doc, dtype=torch.long)
                    pos += best_len
                else:
                    # Nothing fits: crop the shortest document to fill the row exactly.
                    # 100% utilization, no padding — ~35% of tokens are dropped at T=2048.
                    shortest_idx = min(range(len(doc_buffer)), key=lambda i: len(doc_buffer[i][0]))
                    doc, _ = doc_buffer.pop(shortest_idx)
                    row_buffer[row_idx, pos:pos + remaining] = torch.tensor(doc[:remaining], dtype=torch.long)
                    pos += remaining

        cpu_inputs.copy_(row_buffer[:, :-1])
        cpu_targets.copy_(row_buffer[:, 1:])

        # The un-consumed documents are part of the position: without them a resumed run
        # would re-pack a different (buffer-cold) batch stream. JSON-serializable ints only.
        state_dict = {
            "shard_idx": cursor["shard_idx"],
            "row_group_idx": cursor["row_group_idx"],
            "doc_offset": cursor["doc_offset"],
            "epoch": cursor["epoch"],
            "doc_buffer": [list(doc_id) for _, doc_id in doc_buffer],
        }

        gpu_buffer.copy_(cpu_buffer, non_blocking=use_cuda)
        yield inputs, targets, state_dict
