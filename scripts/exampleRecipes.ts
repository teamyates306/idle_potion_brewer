// Worked examples for the patch notes. Usage: npx tsx scripts/exampleRecipes.ts
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion, tierForValue, VALUE_PREFIXES } from "../src/engine/potions";
import { discoveryBonus } from "../src/engine/insight";

const byName = Object.fromEntries(Object.values(INGREDIENTS).map((i) => [i.name, i]));

const combos = [
  ["Rootmoss", "Firepetal"],
  ["Rootmoss", "Firepetal", "Dewcap"],
  ["Marrowroot", "Frost Lode", "Etched Fang"],
  ["Marrowroot", "Frost Lode", "Etched Fang", "Wraith Sprout"],
  ["Eldritch Mold", "Eldritch Mold", "Abyssal Sting", "Sovereign Vertebra", "Sovereign Vertebra"],
];

for (const c of combos) {
  const ings = c.map((n) => byName[n]).filter(Boolean);
  if (ings.length !== c.length) {
    console.log("MISSING INGREDIENT in: " + c.join(" + "));
    continue;
  }
  const d = describePotion(ings, DEFAULT_FORMULAS);
  console.log(
    `${c.join(" + ")}\n  -> ${d.name}  | value ${d.value.toLocaleString()} | ${VALUE_PREFIXES[tierForValue(d.value)]}` +
    `${d.isCombi ? " | COMBINATION" : ""} | discovering it pays ${discoveryBonus(d.value, d.isCombi).toLocaleString()}\n`
  );
}
