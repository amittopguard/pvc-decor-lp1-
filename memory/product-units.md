# Product Categories, Customers & Units of Sale

Durable record of what the business produces and how each item is billed.
Keep this in sync with the video-script-writer skill's `references/product-notes.md`.

All units below are **confirmed by the user**.

## The common thread

Every product is the same business in a different industry: **a decorated surface applied to
someone else's product**. Customers overlap only in kind (all are manufacturers who need a
finished or branded surface) — the industries, and therefore the buying logic and the unit of
sale, are different.

## Matrix

| Brand | Product | Customer | Unit(s) of sale |
|---|---|---|---|
| TopDecor | PVC Decor Film | Membrane door, louver, shutter, wall panel mfrs | **sq mtr · running mtr · roll** |
| TopDecor | PETLAM (PET laminated decor film) | ACP / partition / cladding panel makers | **kg** |
| TopGuard | IML (in-mould label) | Injection moulding mfrs | **pcs** |
| TopGuard | BML (blow-mould label) | Blow moulding mfrs | **pcs** |
| TopGuard | HTL (heat transfer label) | Brand / product mfrs | **pcs · roll** |
| TopGuard | HTF / HSF / EVA 3D | Footwear mfrs | **sq mtr · roll** |

### Not a product

**PVC Laminates 1mm / 3mm is NOT manufactured.** An earlier version of this file and the landing
page PRD both claimed it was launching for acrylic sheets. That is wrong. The company makes
**PVC Decor Film**, not PVC laminates.

## Why the units differ — only four logics

| Logic | Unit | Applies when |
|---|---|---|
| Weight | kg | Thickness/density vary, so material content is the real cost |
| Length | running mtr / roll | Fixed width, consumed as running length off a roll |
| Area | sq mtr / sq ft | Customer is covering a surface |
| Count | pcs | One unit of product = one finished item |

Note the asymmetry: PETLAM and PVC Decor Film are both films, but PETLAM is billed by **weight**
while PVC Decor Film is billed by **area and length**. Labels are billed by **count**. This is
why a single-unit item master cannot work — an item needs several simultaneous sale units.

## Universal comparator — ₹ per sq ft

Whatever unit is quoted, everything reduces to cost per unit of finished surface.

```
grams per running metre = width(m) × thickness(µm) × density(g/cm³)
metres per kg           = 1000 ÷ grams per metre
sq ft per kg            = metres per kg × width(m) × 10.764
₹ per sq ft             = ₹ per kg ÷ sq ft per kg
₹ per sq ft             = ₹ per sq mtr ÷ 10.764
```

Worked example (PVC decor film, 1.26 m wide, 150 µm, density 1.4):
265 g/metre → 3.8 metre/kg → ~51 sq ft/kg.

**Commercial note:** a ₹/kg rate always looks cheaper than it is, because thickness hides inside
it. Cut 150 µm to 120 µm and ₹/kg is unchanged while ₹/sq ft drops ~20%. Always compare microns
before comparing rates.

## PETLAM specific

The panel maker **buys the film in kg but sells the finished panel per sq ft**. The known pricing
ladder (silver base → wooden ~₹5–7 above → PETLAM a further ~₹5–7 above) is a per sq ft ladder.
To justify the premium, convert the kg rate to ₹/sq ft and show it against the ₹5–7/sq ft the
panel maker gains.

At an assumed 1.22 m width and 125 µm, one kg covers ~61 sq ft, so a ₹5–7/sq ft panel premium is
₹305–427 per kg of headroom. **The width and micron are assumed — confirm before quoting.**

## Open questions

- [ ] PETLAM — actual roll width (m) and thickness (µm), to make the kg → sq ft bridge exact

## Where this is being built

A full CRM covering these products is planned in `amittopguard/nuvo18` (the company ERP), not in
this repo. Unit of measure is modelled there as a first-class multi-valued concept:
`uom_master` + `uom_formula` (conversion expressions stored as data) + `item_sale_uom` (which
units an item may actually be sold in). See that repo's plan for detail.

## Impact on this landing page (not implemented)

- `Products.jsx` carries no unit-of-sale field, and lists Wall Panel / Laminates / Acrylic —
  which does not match the confirmed product list above
- Quote form `quantity` is free text (`"e.g., 5000 sqm / 20 rolls"`) — leads arrive with no firm unit
- Distributor form asks only `monthly_volume_sqm`, which is the wrong unit for kg- and pcs-based products
