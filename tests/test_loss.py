"""Tests for archerchat/loss.py.

evaluate_bpb() is exercised against a fake model rather than the real GPT: the
point here is the accumulation / masking / log2(e) arithmetic, which must match
nanochat's loss_eval.py exactly (val_bpb is the Stage 1 comparison metric).
"""

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from archerchat.loss import chunked_cross_entropy, evaluate_bpb

LOG2E = math.log2(math.e)


class TestChunkedCrossEntropy:
    def test_matches_f_cross_entropy(self):
        torch.manual_seed(0)
        logits = torch.randn(4, 64, 300)
        targets = torch.randint(0, 300, (4, 64))
        expected = F.cross_entropy(logits.view(-1, 300), targets.view(-1), ignore_index=-1)
        got = chunked_cross_entropy(logits, targets, chunk_size=32)
        torch.testing.assert_close(got, expected, rtol=0, atol=1e-5)

    def test_matches_f_cross_entropy_with_ignore_index(self):
        torch.manual_seed(1)
        logits = torch.randn(4, 64, 300)
        targets = torch.randint(0, 300, (4, 64))
        targets[targets % 5 == 0] = -1   # SFT-style mask
        assert (targets == -1).any()
        expected = F.cross_entropy(logits.view(-1, 300), targets.view(-1), ignore_index=-1)
        got = chunked_cross_entropy(logits, targets, chunk_size=32)
        torch.testing.assert_close(got, expected, rtol=0, atol=1e-5)

    def test_chunking_is_exact(self):
        # Chunk size is a memory knob only: it must not change the value.
        torch.manual_seed(2)
        logits = torch.randn(2, 128, 257)
        targets = torch.randint(0, 257, (2, 128))
        targets[::2, ::3] = -1
        ref = chunked_cross_entropy(logits, targets, chunk_size=256)
        for chunk_size in (1, 7, 64, 100, 1024, 100_000):
            got = chunked_cross_entropy(logits, targets, chunk_size=chunk_size)
            # Only fp32 summation-order noise may differ (~1e-7 relative), never the math.
            torch.testing.assert_close(got, ref, rtol=1e-6, atol=0)

    def test_accepts_flat_shapes(self):
        torch.manual_seed(3)
        logits = torch.randn(50, 17)
        targets = torch.randint(0, 17, (50,))
        expected = F.cross_entropy(logits, targets, ignore_index=-1)
        got = chunked_cross_entropy(logits, targets, chunk_size=8)
        torch.testing.assert_close(got, expected, rtol=0, atol=1e-5)

    def test_custom_ignore_index(self):
        torch.manual_seed(4)
        logits = torch.randn(3, 10, 20)
        targets = torch.randint(0, 20, (3, 10))
        targets[0, 0] = 7
        expected = F.cross_entropy(logits.view(-1, 20), targets.view(-1), ignore_index=7)
        got = chunked_cross_entropy(logits, targets, chunk_size=4, ignore_index=7)
        torch.testing.assert_close(got, expected, rtol=0, atol=1e-5)

    def test_backward(self):
        torch.manual_seed(5)
        logits = torch.randn(2, 16, 32, requires_grad=True)
        targets = torch.randint(0, 32, (2, 16))
        chunked_cross_entropy(logits, targets, chunk_size=5).backward()
        ref = torch.zeros_like(logits, requires_grad=True)
        with torch.no_grad():
            ref.copy_(logits)
        ref.requires_grad_(True)
        F.cross_entropy(ref.view(-1, 32), targets.view(-1), ignore_index=-1).backward()
        torch.testing.assert_close(logits.grad, ref.grad, rtol=0, atol=1e-6)


class FakeModel(nn.Module):
    """Returns a scripted per-token loss so bpb arithmetic can be asserted exactly."""

    def __init__(self, losses):
        super().__init__()
        self.losses = list(losses)   # one (B, T) tensor per eval step
        self.calls = 0

    def forward(self, idx, targets=None, kv_cache=None, loss_reduction="mean"):
        assert loss_reduction == "none"
        loss = self.losses[self.calls]
        self.calls += 1
        return loss.view(-1)


def _loader(batches):
    # Mimics the pretrain loader: (x, y, state). evaluate_bpb must ignore the tail.
    for x, y in batches:
        yield x, y, {"shard": 0}


class TestEvaluateBpb:
    def test_exact_arithmetic(self):
        # vocab 0..3; token 0 is a special token (0 bytes)
        token_bytes = torch.tensor([0, 1, 2, 4], dtype=torch.int32)
        y = torch.tensor([[1, 2], [3, 1]])
        x = torch.zeros_like(y)
        loss = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
        model = FakeModel([loss])

        got = evaluate_bpb(model, _loader([(x, y)]), 1, token_bytes)

        nats = 1.0 + 2.0 + 3.0 + 4.0
        n_bytes = 1 + 2 + 4 + 1
        assert got == nats / n_bytes * LOG2E
        assert model.calls == 1

    def test_special_tokens_and_ignore_index_excluded(self):
        token_bytes = torch.tensor([0, 1, 2, 4], dtype=torch.int32)
        #    -1 -> masked (SFT), 0 -> special token (0 bytes): both contribute
        #    neither nats nor bytes.
        y = torch.tensor([[1, -1, 0, 3]])
        x = torch.zeros_like(y)
        loss = torch.tensor([[1.0, 100.0, 100.0, 2.0]])
        model = FakeModel([loss])

        got = evaluate_bpb(model, _loader([(x, y)]), 1, token_bytes)

        assert got == (1.0 + 2.0) / (1 + 4) * LOG2E

    def test_accumulates_across_steps(self):
        token_bytes = torch.tensor([0, 1, 2, 4], dtype=torch.int32)
        batches = [
            (torch.zeros(1, 2, dtype=torch.long), torch.tensor([[1, 2]])),
            (torch.zeros(1, 2, dtype=torch.long), torch.tensor([[3, 3]])),
            (torch.zeros(1, 2, dtype=torch.long), torch.tensor([[2, 2]])),
        ]
        losses = [torch.tensor([[1.0, 1.0]]), torch.tensor([[2.0, 2.0]]), torch.tensor([[9.0, 9.0]])]
        model = FakeModel(losses)

        # steps=2 consumes only the first two batches; the third must not be used.
        got = evaluate_bpb(model, _loader(batches), 2, token_bytes)

        assert model.calls == 2
        assert got == (1.0 + 1.0 + 2.0 + 2.0) / (1 + 2 + 4 + 4) * LOG2E

    def test_all_masked_returns_inf(self):
        token_bytes = torch.tensor([0, 1, 2, 4], dtype=torch.int32)
        y = torch.full((1, 4), -1)
        x = torch.zeros_like(y)
        model = FakeModel([torch.ones(1, 4)])

        got = evaluate_bpb(model, _loader([(x, y)]), 1, token_bytes)

        assert got == float("inf")

    def test_matches_nanochat_reference(self):
        # Independent reimplementation of nanochat/nanochat/loss_eval.py's math.
        torch.manual_seed(6)
        vocab, B, T, steps = 64, 3, 8, 4
        token_bytes = torch.randint(0, 5, (vocab,), dtype=torch.int32)
        token_bytes[0] = 0   # <|bos|>-like special token
        batches, losses = [], []
        for _ in range(steps):
            y = torch.randint(-1, vocab, (B, T))
            batches.append((torch.zeros_like(y), y))
            losses.append(torch.rand(B, T) * 5)

        got = evaluate_bpb(FakeModel(losses), _loader(batches), steps, token_bytes)

        total_nats, total_bytes = 0.0, 0
        for (_, y), loss in zip(batches, losses):
            yf, lf = y.view(-1), loss.view(-1)
            for t, l in zip(yf.tolist(), lf.tolist()):
                nb = 0 if t < 0 else int(token_bytes[t])
                if nb > 0:
                    total_nats += l
                total_bytes += nb
        expected = total_nats / (math.log(2) * total_bytes)
        assert abs(got - expected) < 1e-5
