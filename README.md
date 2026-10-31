# Food Hunt SG

Personal food list for Singapore: filter by price tier and area, see places on a map, mark visited / want to try.

## Price tiers (per pax)
| Tier | Price |
|---|---|
| Street food | under S$5 |
| Budget food | under S$10 |
| Local fav | under S$20 |
| Restaurant | under S$50 |
| Premium | S$50 and above |

The tier is worked out from `price` in `places.json`; you never set it by hand.

## Adding places
Edit `places.json` (on GitHub or locally). Fields: `id`, `name`, `area`, `cuisine`, `price`, `rating`, `dish`, `notes`, `photo`, `lat`, `lng`, `status` (`want` or `visited`).
Put photos in a `photos/` folder and set `"photo": "photos/name.jpg"`.

The in-page "Add place" button and the visited toggle save to the current device only. Use "Export my changes" to download a `places.json` and commit it to share changes across devices.

## Run locally
```
python -m http.server 8000
```
then open http://localhost:8000
