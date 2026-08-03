# Fuel logging — how the competition does it

Research done 2026-08-03, following the gap identified in `STORE_LISTING.md`.
Apps examined: **Fuelly**, **Fuelio**, **Drivvo**, **Simply Auto**.

Same caveat as the listing research: the store pages themselves are blocked from
the build container, so this comes from vendor docs, FAQs and secondary coverage.
The Fuelly and Drivvo FAQs were the most useful because they explain the *rules*,
not just the feature names.

---

## 1. The entry form

What you actually type at the pump. Near-identical across all four:

| Field | Notes |
|---|---|
| **Date** (and time on Drivvo) | |
| **Odometer** | The ACTUAL reading, not a trip-meter distance. Fuelly is explicit that it must be the odometer, because service reminders key off the same number. |
| **Volume** | Gallons or litres. |
| **Price per unit** | |
| **Total cost** | Fuelly lets you enter **any two** of price/volume/total and calculates the third. Small touch, removes the arithmetic at the pump. |
| **Full or partial fill** | The important one. See below. |
| **Missed fill / reset** | Flags a break in the chain. See below. |
| **Fuel type / grade** | Octane, diesel, LPG, AdBlue. Fuelio supports **two tanks at once** (petrol + LPG) with separate statistics. |
| **Station** | Drivvo keeps favourites. Fuelio pins fill-ups by GPS and shows them on a map. |
| **Notes / reason** | |
| **Receipt photo** | |

---

## 2. The part that is actually hard

**Fuel economy is not computed per fill-up. It is computed between two FULL
fills.** Distance travelled between them, divided by the fuel added at the
second. That single rule drives the whole design.

Consequences, straight from the vendor docs:

- **Fuelly** does not calculate MPG when: this fill is partial, the *previous*
  fill was partial, or the fill is marked missed.
- **Fuelly** has a "Reset" flag: if you skipped or forgot a fill-up, you mark the
  next record as a reset so the economy calculation starts fresh instead of
  reporting a fantasy number from a broken distance chain.
- **Drivvo** divides distance between two full refuels by the fuel added at the
  next one, and the lifetime average **ignores the first entry** to avoid
  distortion (you did not fill from empty, so the first tank's volume does not
  correspond to the distance before it).
- **Fuelio** calls it a "full tank algorithm" and accumulates partials until the
  next full fill.

Get this wrong and every number in the feature is wrong, quietly. It is the
reason a fuel log is more than a table of purchases.

---

## 3. What they display

**Per fill-up**
- Economy for that tank
- Cost, price per unit, distance since last fill

**Rolled up**
- Average economy; best and worst
- **Cost per mile / per km** — the headline number, and the one that connects to
  "what does this car actually cost me"
- Total spent on fuel
- Fuel cost per month
- Price history: what you have been paying per unit over time

**Charts**
- Consumption over time
- Fuel cost over time
- Monthly cost

**Units.** Drivvo alone supports MPG, gal/100mi, mi/L, km/gal, L/100km and km/L.
This is not vanity: the same app serves US, UK and metric markets, and L/100km
is *inverted* relative to MPG (lower is better), so it cannot be a display-time
multiply. It changes the direction of "good".

**Extras worth knowing about**
- Fuelio: fill-ups on a Google Map, GPS trip log with route recording and GPX
  export, nearby station prices.
- Simply Auto: partial fill-ups, receipts per fill, CSV export.
- Fuelly: a public community fuel-economy database, which is its real moat. You
  can look up real-world MPG for a model before buying one.

---

## 4. What this means for G-Dimension

**Most of the plumbing already exists.** Mileage is already stored in base units
with display-time conversion (`src/lib/mileage.ts`, `unitConversion.ts`,
`users.distance_unit`), receipts already have a private bucket and signed URLs,
and cost roll-ups already feed the build report.

**What is genuinely new:**

1. A `fuel_entries` table: car, date, odometer, volume, price/unit, total,
   `is_full` (bool), `is_missed` (bool), fuel type, station, note, receipt.
2. **A volume unit preference.** `users` has `distance_unit`, `power_unit` and
   `torque_unit` but no volume unit. US gallons, imperial gallons and litres are
   three different things and imperial vs US differ by ~20%.
3. The full/partial/missed state machine and the economy calculation. This is
   the part to unit-test hard — it is pure logic over a sequence, which is
   exactly what `src/lib/*.test.ts` is already set up for.
4. An economy display unit, remembering that L/100km inverts the sense of
   "better".

**The angle that is not "another fuel log."** Everyone else treats fuel as its
own silo. G-Dimension already computes what a car has cost you across mods and
services, and already hands that record to the next owner. Fuel is the missing
third of the true cost of ownership. The differentiated feature is not the fill-up
form, it is **fuel spend folded into the build report and the total investment
number** — a real cost-per-mile for a documented car, that transfers with it.

Nobody in the research does that, because none of them have the build record to
fold it into.
