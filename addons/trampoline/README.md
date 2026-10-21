# Trampolines

Build a pattern of blocks, like a Nether portal, and it turns into a trampoline.
Bigger trampolines bounce you higher.

## How to build one

1. Dig a hole one block deep. For a 3×3 trampoline, make it 5×5.
2. Fill the middle with **slime blocks** in a square.
3. Put **wool** (any colour, mix them!) all around the slime.
   The four corners can be anything: wool, dirt, or nothing.
4. When you place the last block, you hear a ding and see sparkles. It's ready!

```text
    . W W W .        S = slime block
    W S S S W        W = wool, any colour
    W S S S W        . = corner, anything
    W S S S W
    . W W W .
```

## Sizes

| Slime square | Hole to dig | Bounces about |
| --- | --- | --- |
| 2×2 | 4×4 | 4 blocks high |
| 3×3 | 5×5 | 8 blocks high |
| 4×4 | 6×6 | 14 blocks high |
| 5×5 | 7×7 | 22 blocks high |

## Good to know

- Jump on and you keep bouncing. **Sneak** to stop.
- No fall damage for 10 seconds after a bounce, even if you fly off the side.
- Break any slime or wool block and it stops being a trampoline. Put it back to rebuild it.
- Want different heights? Change `strength` in [`behavior_pack/scripts/trampoline.js`](./behavior_pack/scripts/trampoline.js), then run `npm test` to see the new heights.
