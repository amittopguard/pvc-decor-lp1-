# Product Categories, Customers & Units of Sale

Durable record of what the business produces and how each item is billed.
Keep this in sync with the video-script-writer skill's `references/product-notes.md`.

## The common thread

Every product is the same business in a different industry: **a decorated surface applied
to someone else's product**. Customers overlap only in kind (all are manufacturers who need
a finished/branded surface) — the industries, and therefore the buying logic and the unit of
sale, are different.

## Matrix

| Brand | Product | Customer | Unit of sale | Status |
|---|---|---|---|---|
| TopDecor | PETLAM (PET laminated decor film) | ACP / partition / cladding panel makers | **kg** | Confirmed |
| TopDecor | PVC Decor Film | Membrane door, louver, shutter, wall panel mfrs | kg (roll) | Unconfirmed |
| TopDecor | PVC Laminate 1mm / 3mm | Acrylic sheet & furniture mfrs | pc (sheet) | Unconfirmed |
| TopGuard | IML (in-mould label) | Injection moulding mfrs | pc (per 1000) | Unconfirmed |
| TopGuard | BML (blow-mould label) | Blow moulding mfrs | pc (per 1000) | Unconfirmed |
| TopGuard | HTL (heat transfer label) | Brand / product mfrs | pc / roll | Unconfirmed |
| TopGuard | HTF / HSF / EVA 3D | Footwear mfrs | metre / roll | Unconfirmed |

## Why the units differ — only four logics

| Logic | Unit | Applies when |
|---|---|---|
| Weight | kg | Thickness/density vary, so material content is the real cost |
| Length | metre / roll | Fixed width, consumed as running length off a roll |
| Area | sq mtr / sq ft | Customer is covering a surface |
| Count | pc | One unit of product = one finished item |

## Universal comparator — ₹ per sq ft

Whatever unit is quoted, everything reduces to cost per unit of finished surface.

```
grams per running metre = width(m) × thickness(µm) × density(g/cm³)
metres per kg           = 1000 ÷ grams per metre
sq ft per kg            = metres per kg × width(m) × 10.764
₹ per sq ft             = ₹ per kg ÷ sq ft per kg
```

Worked example (PVC decor film, 1.26 m wide, 150 µm, density 1.4):
265 g/metre → 3.8 metre/kg → ~51 sq ft/kg. At ₹200/kg that is ₹3.9/sq ft.

**Commercial note:** a ₹/kg rate always looks cheaper than it is, because thickness hides
inside it. Cut 150 µm to 120 µm and ₹/kg is unchanged while ₹/sq ft drops ~20%. Always
compare microns before comparing rates.

## PETLAM specific

The panel maker **buys the film in kg but sells the finished panel per sq ft**. The known
pricing ladder (silver base → wooden ~₹5–7 above → PETLAM a further ~₹5–7 above) is a per
sq ft ladder. To justify the premium, convert the kg rate to ₹/sq ft first and show it against
the ₹5–7/sq ft the panel maker gains. Needs real width and micron to be exact.

## Open questions

- [ ] PVC Decor Film — kg or metre?
- [ ] PETLAM — actual roll width (m) and thickness (µm), to fix the kg → sq ft bridge
- [ ] PVC Laminate 1mm / 3mm — per sheet or per sq ft?
- [ ] IML / BML — priced per 1000 pcs or per kg of reel?

## Impact on this landing page (not yet implemented)

- `Products.jsx` carries no unit-of-sale field
- Quote form `quantity` is free text (`"e.g., 5000 sqm / 20 rolls"`) — leads arrive with no firm unit
- Distributor form asks only `monthly_volume_sqm`, which is the wrong unit for kg- and pc-based products
