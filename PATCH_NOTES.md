# The Knowledge Update

*What changed, and what it means the next time you sit down with the game.*

The short version: **the things you learn are now worth money.** Every potion
you have ever discovered permanently raises the value of everything you brew,
finding a good recipe pays a real reward instead of a token one, and the
workshop finally tells you what it is earning per second so you can plan
around it.

Nothing was taken away. If your favourite thing is picking one good recipe and
letting it run all night, that still works exactly as it did — it just isn't the
*only* thing that works any more.

---

## 1. Your workshop tells you what it earns

Look under your coin total. There is now a second line:

```
   🪙 12,480
      +0.82/s
```

That is your actual income per second, live. Tap it and it opens the **Supply**
ledger, which is no longer locked behind a million-coin purchase — it is there
from your very first brew. (If you had already bought the Merchant's Abacus, its
million coins have been refunded to you.)

Two things it will tell you straight away:

- **If it says `0.82/s unsold` in amber instead of green**, you are brewing
  potions but not selling them. Turn on auto-sell for that recipe and the number
  turns green. A lot of early players were producing value and banking none of it.
- **It names your bottleneck.** *"⚠ Bottleneck: Rootmoss runs out in 15s"* — the
  single ingredient that is about to stop a cauldron, and how long you have.

And every upgrade now quotes what it will actually do:

```
   +0.25 Brew Speed      1.03× → 1.28×      🪙 25
   +0.20/s

   +10% Multi-Brew       0% → 10%           🪙 25
   +4.9/min
```

No more guessing which upgrade is worth the token.

---

## 2. Insight — knowing things makes you richer

**Every distinct potion you have ever discovered raises the value of everything
you brew, forever.** You can see your current multiplier at the top of the
Discovered tab.

```
 Potions known                                Insight
     3   ███                                   ×1.24
    10   ██████                                ×1.52
    25   ██████████                            ×1.89
    60   █████████████                         ×2.18
   120   █████████████████                     ×2.53
   250   █████████████████████                 ×2.91
   500   █████████████████████████             ×3.27
```

Three things worth knowing about how it counts:

**It counts potion *names*, not recipes.** There are roughly 1,165 potions to
find but over a hundred million ingredient combinations, and many of those
combinations produce the same potion. Finding five hundred different recipes
that all come out as *Diluted Tonic of the Earth* counts as one discovery. Go
wide, not deep.

**Rarer finds count for much more.** Every two tiers doubles the payoff. A
*Greater* find is worth four ordinary *Diluted* ones; a *Transcendent* find is
worth about twenty-two of them. Deep-region ingredients are where the Insight is.

**It never stops growing, but it does slow down.** Your third discovery is worth
far more than your three-hundredth. This is deliberate — the early finds are
meant to feel like a real step up, and they do: three potions in your first
twenty minutes is already a ×1.24 on everything you sell.

---

## 3. Discoveries pay for *what* you found

The old discovery bonus was a few coins that grew with how many potions you had
already found, and it stopped mattering entirely after about twenty-five — it was
capped at 500 coins forever after that, which by mid-game is a rounding error.

Now it pays for the potion you actually discovered:

| You discovered | Worth | Discovery now pays | Used to pay |
|---|---|---|---|
| *Diluted Elixir of Flameburst* (Rootmoss + Firepetal) | 11 | **83** | 10 |
| *Lesser Elixir of Swiftness* (Rootmoss + Firepetal + Dewcap) | 20 | **110** | ~50 |
| *Greater Decoction of Iron* (Marrowroot + Frost Lode + Etched Fang) | 267 | **851** | 500 (capped) |
| *Superior Infusion of Iron* (+ Wraith Sprout) | 840 | **2,570** | 500 (capped) |
| a *Mythic*-tier find | ~45,000 | **~135,000** | 500 (capped) |

Your very first discoveries pay more than they used to, and a genuinely good
find is now a proper payday rather than a nice message. Stumbling onto something
worthless still pays a small floor — there is nothing to farm here.

---

## 4. Strange combinations pay the most

Some ingredient pairings produce **curated combination potions** — the ones with
special names in your Trophy Case rather than the usual *"[Tier] [Type] of
[Attribute]"* pattern. Things like *the Ascension*, or *Rebirth*, or
*Chaos Incarnate*.

These were always the most interesting thing in the game to find. Now they are
also the most lucrative:

- A combination counts as **three discoveries** toward Insight, on top of its
  tier bonus.
- Discovering one pays **five times** the normal bonus. A combination worth 800
  coins pays **12,250** to find, against 2,450 for an ordinary potion of the
  same value.

If you have been idly wondering whether that weird pairing of two attributes you
have never mixed does anything — go and find out. That is now the single
best-paid activity in the game.

---

## 5. Renown — your achievements do something now

Achievements used to be a list you ticked and forgot. Each one you have unlocked
now adds **+0.5% to the value of every potion you brew**, permanently, whether or
not you have collected its reward. It shows as **Renown** next to your Insight.

It is a small number per achievement on purpose — the total is meant to grow
because there are more achievements to chase, and there will be.

---

## 6. Transcendent is real now

*Transcendent* is the top potion tier in the game. Until this update **no player
had ever brewed one, and none ever could** — the tier began at 650,000 coins of
value, and the single best recipe the world can produce tops out at 483,897. It
was a rank that existed only in the code.

The threshold is now 400,000. A best-in-world five-slot recipe reaches it; a
strong four-slot one still tops out at *Mythic*. Because the bar moved *down*,
nothing you have already discovered was demoted — a few of your best finds may
have quietly gone up a rank instead.

Somebody is going to be first to brew one. It is a combination potion, and
discovering it pays seven figures.

---

## 7. Ten cauldrons, and numbers that keep their names

**The workshop now holds ten cauldrons, not five.** Numbers six through ten cost
15M, 70M, 320M, 1.4B and 6B, and each one comes in its own colour. These are
deliberately beyond anything the current economy reaches — they are there so the
ceiling stops being a wall.

**Large numbers are readable again.** The counter used to run out of names above
a billion, so four and a half trillion coins displayed as `4500.00B` and three
quintillion as `3000000000.00B`. It now climbs properly:
`4.50T`, `3.00Qi`, and onward through `Sx`, `Sp`, `Oc`, `No`, `Dc`.

---

## 8. Planning around your day

This is the part for anyone who likes a spreadsheet.

Gathering is completely predictable. A worker's round trip is
`distance ÷ gather speed × 2` seconds, and they bring back their carry size each
time — while the app is closed as well as while it is open. So you can work out
exactly what you will come home to.

**Two fresh workers (gather speed 1.0, carry 2), eight hours away:**

| Location | Region | Round trip | You come home to |
|---|---|---|---|
| **The Damp Hollow** | Home Vale | 5.0s | **23,040** ingredients — 16,128 Rootmoss, 4,147 Firepetal, 2,765 Dewcap |
| **The Glittering Crags** | Home Vale | 9.2s | **12,520** — ~2,100 each of Rootmoss, Damp Antler, Chalkroot, Leachroot, Emberseed, Amber Sprig |
| **The Hollow Downs** | Whispering Woods | 20.8s | **5,536** — incl. 774 Verdant Nugget, 755 Copperbloom, 639 Frost Chunk |
| **The Emberfields** | Searing Crags | 46.6s | **2,472** — incl. 205 Etched Fang, 199 Marrowroot, 193 Frost Lode, 79 Wraith Sprout |

Closer locations give you far more items; further ones give you far better ones.

**A worked example.** Say you have just discovered *Greater Decoction of Iron* —
Marrowroot + Frost Lode + Etched Fang, worth 267 a bottle. You park two workers
on **The Emberfields** before work and close the app.

Eight hours later you have 199 Marrowroot, 193 Frost Lode and 205 Etched Fang.
The recipe burns one of each per brew, so **Frost Lode is your limit: 193 brews**.

- 193 × 267 = **51,531 coins** at face value
- at a mid-game Insight of ×2.18, that is **≈112,000 coins** for one evening's blitz

And the Supply ledger will tell you the same thing live: park the workers, load
the recipe, and watch whether Frost Lode shows green (surplus) or red (deficit)
before you walk away.

---

## 9. You can see which cauldron is starving, and how badly

A cauldron with no ingredients used to sit there with a small amber caption
reading *"Need ingredients"*, which is a strange way to announce the single
most important failure in the game. Now:

**In the workshop.** A starved cauldron's progress bar turns **red** and its
caption becomes a bold **⚠ Starving**. You can spot it across the room.

**In the HUD.** The coins/sec line picks up a red **⚠2** telling you how many
cauldrons are dry right now. Tap it and you land straight in the Supply ledger.

**On the cauldron itself.** Open any brewer and there is a new **Feed rate**
panel:

```
   FEED RATE                            87% uptime
   Rootmoss       needs 30.89/min       supplied 26.04/min

   Send more workers to a location that drops the red ingredients,
   or slow this cauldron down.
```

That is the whole optimisation game in two numbers. If *needs* is bigger than
*supplied*, you are running on stock and you will run dry — the Supply tab will
even tell you when (*"⚠ Bottleneck: Rootmoss runs out in 24s"*).

**Efficiency.** The Supply tab now scores your whole workshop:

```
   EFFICIENCY  100%                          BEST  100%
   EFFICIENCY   85%                          BEST  100%
   Cauldrons spent 15% of their time waiting on ingredients.
```

It is the share of time your cauldrons spent *actually brewing* out of the time
you asked them to brew — measured over the last five minutes, and it keeps your
best score so you have a record to beat. Green at 95%+, amber below that, red
below 70%.

Two things worth knowing: a cauldron you deliberately switch off, or one with no
recipe loaded, **is not counted at all** — idling a brewer can never hurt your
score. And there are two new achievements on it: **Well Oiled** (hold 90%) and
**Not a Drop Wasted** (hold 99%), worth 2 and 6 upgrade tokens.

Chasing 100% is now a real thing to do with an evening.

---

## 10. What did *not* change

**There is no penalty for repetition.** Settling on one strong recipe and
grinding it is still a completely valid way to play, and nothing taxes you for
it. Insight is a reward for exploring, never a punishment for focusing. The
overnight single-recipe blitz described above is an intended way to play, not a
loophole.

Brew times, gather times, mastery, quests, the Exchange and trade routes are all
untouched.

---

## 11. Did it actually work?

The game has a headless simulator that plays 24 in-game hours with six different
AI playstyles, 300 runs total. Here is the same test before and after, total
income including discovery rewards:

```
                       BEFORE            AFTER
  Everyman           187,511  ███████    258,638  ██████████    +38%   ← realistic mixed play
  Industrialist      381,407  ██████████ 184,449  ███████
  Completionist       99,482  ███        177,105  ███████       +78%
  Sprinter            82,147  ██          62,567  ██            −24%
  AchievementHunter   67,264  ██          61,579  ██
  QuestHunter         50,595  █           57,972  ██            +15%
```

Before this update the best way to play was to **ignore the game**: lock one
worker on the starter location, brew one recipe 168,000 times, never open the
map. That playstyle won by a wide margin.

It doesn't any more. **Everyman — the playstyle that wanders around, explores a
bit, does some quests, and generally plays the game like a person — is now
first.** The playstyles that engage with discovery gained between 15% and 78% on
total income; the two that ignore the map gained nothing. The gap between best
and worst playstyle narrowed from ×7.5 to ×4.5.

One honest caveat: the Industrialist line above is noisy. Its results swing
between roughly 66,000 and 560,000 depending on early luck in both runs, so
while its average fell, that particular movement is within the noise and should
not be read as a deliberate nerf. Everyman, Completionist and Sprinter are all
well outside their noise bands, and Sprinter is fully deterministic — its −24%
is exact.

---

*Balance is still being tuned. The costs of cauldrons 6–10 in particular are
headroom rather than finished numbers, and will be revisited.*
