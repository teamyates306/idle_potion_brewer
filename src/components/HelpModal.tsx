import { useState } from "react";
import Modal from "./ui/Modal";

// ── Tabbed in-game guide ──────────────────────────────────────────────────────
// Plain-language explanations of every facet of the game, one tab per topic.

type TabId = "basics" | "brewing" | "ingredients" | "workers" | "map" | "market" | "mastery" | "quests" | "tips";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "basics",      label: "Basics",      icon: "🏠" },
  { id: "brewing",     label: "Brewing",     icon: "⚗️" },
  { id: "ingredients", label: "Ingredients", icon: "🌿" },
  { id: "workers",     label: "Workers",     icon: "🧑‍🌾" },
  { id: "map",         label: "Map & Trade", icon: "🗺️" },
  { id: "market",      label: "The GAX",     icon: "🏛" },
  { id: "mastery",     label: "Mastery",     icon: "✨" },
  { id: "quests",      label: "Quests",      icon: "📜" },
  { id: "tips",        label: "Tips",        icon: "💡" },
];

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-4 text-sm font-bold text-amber-800 first:mt-0">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] leading-relaxed text-slate-300">{children}</p>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li className="mb-1 ml-4 list-disc text-[13px] leading-relaxed text-slate-300">{children}</li>;
}
function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-amber-900">{children}</span>;
}

const CONTENT: Record<TabId, React.ReactNode> = {
  basics: (
    <>
      <H>The loop</H>
      <P>
        You run a potion workshop. <Em>Workers</Em> gather ingredients from the map,
        <Em> brewers</Em> turn them into potions, and potions sell for coins. Coins buy
        more workers, brewers, upgrades, and map locations — which unlock better
        ingredients, which brew better potions.
      </P>
      <H>The workshop screen</H>
      <ul>
        <LI>The <Em>wall &amp; door</Em> at the top opens the Map — tap it any time.</LI>
        <LI>The <Em>trough</Em> holds gathered ingredients (tap "Stash" to inspect).</LI>
        <LI><Em>Cauldrons</Em> brew in the middle — tap one to speed it up by hand, or tap its cog to manage recipes.</LI>
        <LI>The <Em>potion pile</Em> at the bottom is your unsold stock — open "Market" to sell.</LI>
      </ul>
      <H>Going offline</H>
      <P>
        The guild keeps working while you're away: gathering trips, brews, trades and
        mastery all advance, and you get a summary when you return.
      </P>
    </>
  ),
  brewing: (
    <>
      <H>Recipes</H>
      <P>
        A recipe is up to 5 ingredient slots (slots 3-5 unlock with tokens + coins).
        The same set of ingredients always makes the same potion — experiment to
        discover new ones. Duplicates are allowed: five of one ingredient is a valid recipe.
      </P>
      <H>Brew time</H>
      <P>
        Time = base speed × ingredient complexity (rarer = slower) × toxicity penalty.
        Mastery then reduces it: your Alchemy tree bonus and the potion's own mastery
        level add together as one flat cut (capped at −80%). Workers assigned to a
        brewer click it automatically to finish brews even faster.
      </P>
      <H>Potion tiers</H>
      <P>
        Every potion's prefix tells you its value bracket, from{" "}
        <Em>Diluted → Lesser → Common → Refined → Greater → Superior → Potent → Exalted →
        Mythic → Transcendent</Em>. Mythic and Transcendent potions demand heavy stacks of
        the rarest ingredients — Transcendent is a true endgame chase.
      </P>
      <H>Multi-brew</H>
      <P>
        Multi-brew % is the chance each cycle produces extra potions. Volatile
        ingredients reduce it; brewer upgrades and the Craftsmanship mastery tree raise it.
      </P>
    </>
  ),
  ingredients: (
    <>
      <H>Rarity ladder</H>
      <P>
        Ingredients come in 8 rarities:{" "}
        <Em>Common, Uncommon, Scarce, Rare, Exotic, Epic, Fabled, Legendary</Em>.
        Rarer ingredients are worth more, carry bigger attribute punches, and slow the
        brew down — high risk, high value.
      </P>
      <H>Attributes</H>
      <P>
        Each ingredient has hidden stats (heat, mana, toxicity, soul…). A potion sums its
        ingredients' stats: positive totals multiply its value; the dominant stat names it.
        <Em> Toxicity</Em> boosts value but slows brewing; <Em>volatility</Em> boosts brewer
        XP but hurts multi-brew.
      </P>
      <H>Finding them</H>
      <P>
        Every location drops a local set — send workers to reveal what grows where.
        Higher-tier ingredients live in deeper regions, and Settlements will trade
        bulk low-tier goods for specific higher-tier ones.
      </P>
    </>
  ),
  workers: (
    <>
      <H>Jobs</H>
      <P>
        A worker does one of three things: <Em>gather</Em> at a map location,{" "}
        <Em>click a brewer</Em> to speed it up, or <Em>run trades</Em> at a settlement.
      </P>
      <H>Levels &amp; tokens</H>
      <P>
        Working earns XP; each level grants an <Em>upgrade token</Em>. Spending a token
        (plus coins) buys +gather speed, +carry size, +click speed or +click power. Use
        the one-tap chips at the top of Worker Management to upgrade everyone at once.
      </P>
      <H>Specialisations</H>
      <P>
        At level 10 each worker permanently picks a class: <Em>Explorer</Em> (fast, light),{" "}
        <Em>Caravan</Em> (slow, huge loads), <Em>Pounder</Em> (heavy clicks),{" "}
        <Em>Manic</Em> (rapid clicks) or <Em>Standard</Em> (no change). Explorer/Caravan
        can't work brewers; Pounder/Manic can't leave the workshop.
      </P>
    </>
  ),
  map: (
    <>
      <H>Regions</H>
      <P>
        The world blooms outward from your workshop in rings. Each ring is a{" "}
        <Em>Region</Em> — locked regions show their nodes greyed out. Opening one costs
        coins plus progress milestones (potions discovered, practised recipes, locations
        unlocked). Inside an unlocked region you can unlock its locations in{" "}
        <Em>any order</Em> — there is no fixed path.
      </P>
      <H>Locations</H>
      <P>
        Each location has a travel distance (trip time = distance ÷ worker speed) and a
        drop table you reveal by gathering there. Deeper = slower trips, better loot.
      </P>
      <H>Settlements</H>
      <P>
        The diamond nodes are <Em>trading posts</Em>. Each offers 2-3 fixed trades:
        bulk ingredients of a stated rarity in, one specific higher-tier local
        ingredient out. Pick the offer, choose which ingredient to send from the
        "From…" slot, then assign a worker. Goods leave your stash on departure, are
        handed over at the town, and the reward comes home with the worker — repeating
        automatically while your stash lasts. It's the best sink for overflowing
        low-tier ingredients.
      </P>
    </>
  ),
  market: (
    <>
      <H>The Grand Alchemical Exchange</H>
      <P>
        A chartered institution on the map (no workers needed). Buy a seat and
        potion prices come alive: each of the 30 potion attributes has its own
        market, and a potion sells at the blend of its attributes' current rates.
      </P>
      <H>Supply &amp; demand</H>
      <ul>
        <LI><Em>Flooding:</Em> dumping lots of one kind of potion saturates its attributes — prices sink, down to −50%.</LI>
        <LI><Em>Scarcity:</Em> markets nobody sells into drift upward, up to +50%.</LI>
        <LI><Em>The drain:</Em> small trickle sales are absorbed by natural demand — casual auto-selling won't tank a market.</LI>
        <LI><Em>Recovery:</Em> a flooded market snaps 25% back toward normal every quiet market hour.</LI>
      </ul>
      <H>The board &amp; the ticker</H>
      <P>
        Only the 10 most volatile attributes trade at live rates (the dashboard
        board); the rest stay Dormant at ×1.0 until something dramatic bumps a
        seat-holder off. The ticker tape at the bottom of the screen streams the
        board's movers and breaking news.
      </P>
      <H>Market anomalies</H>
      <P>
        World events run a 5-day wave: day 1 is a <Em>forecast</Em> (news breaks,
        prices unchanged — your grace period to pivot production), days 2–4 lock
        prices at the event rate (anywhere from −75% to +100%), day 5 eases off.
        Check the "Market Events" tab of the welcome-back report to see what the
        Guild Auditor logged while you were away.
      </P>
    </>
  ),
  mastery: (
    <>
      <H>Potion mastery</H>
      <P>
        Brewing a potion builds that potion's mastery (based on time spent brewing it,
        not brew count). Each level trims its brew time — up to <Em>−15% at level 10</Em> —
        and level 10 awards a <Em>✨ Mastery Token</Em>.
      </P>
      <H>Mastery trees</H>
      <P>
        Tokens buy permanent nodes across five trees: Alchemy (brew time), Logistics
        (worker speed/loads), Commerce (sell prices), Craftsmanship (multi-brew, value)
        and Lore (faster mastery XP). Tree and potion brew-time bonuses{" "}
        <Em>add together</Em>, capped at −80%.
      </P>
      <H>Why it matters</H>
      <P>
        Mastery is the long game: practised recipes also count toward unlocking deeper
        regions.
      </P>
    </>
  ),
  quests: (
    <>
      <H>The Quest Board</H>
      <P>
        Unlocks after you've discovered 5 unique potions. Three commissions (Easy /
        Medium / Challenging) ask for quantities of potions you've already discovered —
        any recipe with the right name counts. Rewards scale with difficulty; a fresh
        commission arrives after a cooldown.
      </P>
      <H>Discovery bounties</H>
      <P>
        A bounty names a potion you <Em>haven't</Em> brewed yet — discover it for a big
        payout.
      </P>
      <H>Re-rolling</H>
      <P>
        Don't like a quest or bounty? Tap its <Em>↺</Em> button to swap it for a new one
        at the cost of half its reward.
      </P>
    </>
  ),
  tips: (
    <>
      <H>Early game</H>
      <ul>
        <LI>Auto-sell your bread-and-butter potion and keep the cauldron fed — idle income beats clicking.</LI>
        <LI>Unlock brewer slots 3+ early; more slots = more valuable recipes and more discoveries.</LI>
      </ul>
      <H>Mid game</H>
      <ul>
        <LI>Trade surplus commons at settlements instead of letting them rot in the trough.</LI>
        <LI>Spread workers: a couple on brewers, the rest gathering the ingredients your recipes actually consume (the Supply dashboard shows deficits).</LI>
        <LI>Work toward region milestones before you need them — practised recipes take time.</LI>
      </ul>
      <H>Late game</H>
      <ul>
        <LI>Mythic+ potions want massed Epic/Fabled/Legendary ingredients — Caravan workers on deep nodes and top-end settlement trades are how you feed them.</LI>
        <LI>The 80% brew-time cap means stacking every reduction eventually saturates — diversify into Commerce/Craftsmanship nodes.</LI>
      </ul>
    </>
  ),
};

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("basics");
  return (
    <Modal title="How to Play" onClose={onClose} accent="#3f7a78">
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? "bg-teal-700 text-white shadow" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4">
        {CONTENT[tab]}
      </div>
    </Modal>
  );
}
