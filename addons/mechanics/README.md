# Mechanics

Build your own cars, trucks, tractors and planes. Put a **base** down, add a **seat**, and drive. Add parts to it, add thrusters to fly, add weapons, and save the design.

`mc kit mechanics` gives a wrench, blueprints, the three bases and parts. `mc kit mechanics-weapons` gives the weapons. `mc kit mechanics-garage-<sports-car|truck|tractor|jet>` gives a ready-built vehicle. All three are in the `k` menu of `mc dev` and on the iPad.

## Playing

- **Bases:** the racer (fast, small wheels), the hauler (a truck with a 27-slot cargo bed, slow, turns wide, slower when the bed is full), the farm base (a tractor: slow, steady, climbs a block).
- **Parts:** hold a part and use it on the base, aiming at where it goes. It snaps onto the nearest free spot it fits. Seats go in the front (the first rider drives). Body blocks, windows, thrusters and weapons go on the deck, wings on the sides, a plow on the back. Use a dye on the vehicle to paint it.
- **Driving:** W goes, S slows and backs up, A and D steer. The first one aboard drives.
- **Flying:** three thrusters lift one block of vehicle. With enough thrusters it hovers (hold jump to climb, W/S/A/D drive). With a pair of wings too, it flies like a plane: W faster, S slower, it flies where you look. If it has some thrusters but not enough, the action bar says how many more.
- **Weapons:** the driver taps attack. Gatling gun (a burst), rocket pod (blows up blocks), laser (a long, strong beam). Two of a kind hurt twice as much, up to three. Shots never hit the vehicle or anyone on it.
- **Taking parts off:** hit the vehicle with the wrench, aiming at the part. **Picking it up:** sneak and hit it with an empty hand: it folds into a packed vehicle that remembers its parts, colors and seats.
- **Saving a design:** hit a vehicle with a blank blueprint. The saved blueprint builds a copy where you use it on the ground, for free, as often as you like.

## Turning a saved design into a ready-made one (the garage kit)

Kits are static files, so a design in a kit has to be its own item. Every saved design is also written to the server log as one line:

```
docker logs family-bedrock 2>&1 | grep "\[mechanics\] design"
```

Give that line to Claude: it adds a preset to `PRESETS` in `behavior_pack/scripts/catalog.js`, a type for it in `kit-garage.json` and in `ICONS` in `web/src/icons.js`, and runs the generator. The four presets there (sports car, truck, tractor, jet) were made this way.

## How it works

A vehicle is **one entity** with a slot per part. Each slot is an integer entity property (`family:s0`, `family:s1`, ...) holding a part id, and the resource pack shows or hides the part's bones from it (a render controller with `part_visibility`). Nothing teleports, so there is no per-tick cost for the parts and no lag; a design is just its properties.

`behavior_pack/scripts/catalog.js` is the one place that knows the parts, bases, slots, presets and stats. Everything else is generated from it by `node addons/mechanics/gen/build.mjs`: the vehicle entities, models, render controllers, textures, item pictures, items, recipes and texts. **After editing `catalog.js`, run the generator**; `tests/generated.test.mjs` fails when the committed files are out of date. Pure code (`design.js`, `drive.js`, `combat.js`, `farm.js`, `blueprint.js`) has no Minecraft imports, so `npm test` runs it; `main.js` is the wiring.

Driving is done by script (`drive.js`), not by `input_ground_controlled`, so each base feels different: top speed, how fast it speeds up, how sharply it turns. A simulated player's keys don't reach scripts while riding, so the tests hold them with `/scriptevent family:mech_input <forward>[,<left>[,<jump>]]`.

Worst case per tick, with 8 players all driving and firing: one drive step per driver (a few API calls, 3 block lookups to climb a step), one gatling shot per vehicle every 2 ticks (a block ray and an entity ray), and the plow (3 blocks) only when a tractor moves into a new block. Parts cost nothing per tick. Rockets are instant (a ray, then one explosion); unlike the bazooka's flown missile there is nothing in flight to count.

## Cube riders spike

The question: could kids build with *any* block, by putting a block-sized entity on the vehicle for each block, riding in its own seat so the engine moves it for free (no per-tick script cost)? Tried on the test server with a base with 25 seats and 20 cube entities (`rideable.addRider`):

- **It works.** The cubes took their seats in the order they were added, each exactly in its seat's spot (to 0.01 blocks), and rode along smoothly when the base was driven (cube positions relative to the base stayed the same).
- **But riders sit in boarding order.** A player who gets on takes the **first** seat, and every cube moves one seat along; when they get off, every cube moves back. Taking one cube off moves all the cubes after it up one seat. A seat's position is fixed in the entity file, so the cube in seat *n* is always in the same spot, whatever you meant to build.
- **So it is not free-form.** Where a cube sits is decided by its order, not by where you aimed. Real placement anywhere would need an invisible placeholder rider in every empty cell, which for even a small 5×5×3 volume is 75 riders per vehicle, and the shuffling when someone boards would still need fixing every time.
- Not tried: lag with several such vehicles, and what happens to the riders when the world reloads or a chunk unloads.

**Decision:** keep the snap-on part slots (a fixed, generated model, free to move, any color with dye). To give more freedom without the problems above, the cheap way is more kinds of part in the same slots (stairs, slabs, fences, other windows), which is only data in `catalog.js` and the generator. Cubes in fixed cells (about 20) are possible later, but it is a project of its own.

## What the tests can't check

`./mc test mechanics` plays it with simulated players: building, the wrench, packing and blueprints, driving, hovering and flying, weapons, the plow, the garage items. It can't check what a person sees or feels. Please look at these in the game:

- **That the parts show up on the model** (the render controller's `part_visibility` with `query.property`, and the dye colors), and that left and right are not mirrored (model x grows to the vehicle's left, which is a guess to confirm).
- That the parts line up and don't fill the view from the seat, and what the hauler's cargo bed looks like when opened (sneak and use it).
- How steering, climbing steps, hovering and flying *feel*, and how the cargo load changes the truck.
- Lag with several vehicles and shooters at once; check `docker logs --since 5m family-bedrock 2>&1 | grep ERROR` after it reaches the server.
- The garage tiles on the iPad at about 400px wide and the `k` menu in `mc dev` after restarting it. `mc dev` needs a terminal, so neither was checked.
- The NPC `undefined` guards (`if (!player) continue;` in the drive loop and events): the tests make NPCs real players, so review them instead.
