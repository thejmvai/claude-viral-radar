# Renewal Desk

A motor-insurance renewal follow-up dashboard for a used-car dealership, built to push the renewal rate toward 90%.

- **`renewal-desk.html`**: the source published as a claude.ai Artifact. There, the client book is saved to your account and updates live across devices.
- **`index.html`**: the same page wrapped as a standalone file. Open it in any browser. Clients are saved in that browser's local storage, so use **Export CSV** as a backup.

Rebuild `index.html` after editing the source:

```sh
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat renewal-desk.html; printf '\n</body></html>\n'; } > index.html
```

## What it does

- **Renewal-rate gauge**: renewed ÷ (renewed + lost) over the last 12 months, against your target (90% by default).
- **To hit target**: how many of the policies due in the next 90 days you must renew to reach the target.
- **Today's calls**: a queue built from the follow-up cadence (T-60, T-30, T-14, T-7, T-3, expiry day, then a 30-day win-back window) and any follow-up dates you book.
- **Client book**: filter by due window, lapsed, renewed, or lost, and search by name, plate, phone, or policy number.
- **Client file**: copy the number, open WhatsApp with a message ready for that stage, log each contact, then mark the policy renewed (it rolls forward a year) or lost with a reason.
- **Why clients leave**: lost reasons with a suggested fix for the top one.
- **Add clients** one at a time or import a CSV with columns such as `name, phone, vehicle, plate, insurer, policy, expiry, premium, ncd`.
