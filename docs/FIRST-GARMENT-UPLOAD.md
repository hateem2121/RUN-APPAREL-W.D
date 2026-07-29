# Uploading your first garment — the plain-English guide

This is the owner's guide. No code, no jargon. If you want the technical version,
read [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md) instead.

---

## Where things stand

Think of it like a bakery:

- The **oven** is fixed and switched on ✅
- The **recipe** is written and tested ✅
- There is **no dough** ❌

Everything on the computer side works. What's missing is a garment file.

**Right now, N001 "Velocity Performance Tee" is published with no 3D model
attached.** If someone scans its QR code today, the page loads and all the text is
correct, but the space where the garment should spin is empty, with a message
saying the 3D view could not load. Attaching a model is what fixes that.

---

## Step 1 — Get a file out of CLO

This is the only part nobody else can do for you.

**Make ONE file that contains all three colours.** Not three files. One.

**The colour names inside CLO must match exactly.** This is the single most common
thing that goes wrong. They must read, character for character:

```
N001-NAVY
N001-BLACK
N001-CRIMSON
```

Capital letters. A dash in the middle. No spaces. If one is named `Navy` or
`N001 Navy`, the colour buttons on the website will not work and you will have to
export the file again.

**When you save the file:**

- Give it a simple name that **ends in `.glb`** — for example `velocity-tee.glb`
- Do **not** use any of these characters in the name: `? * : | < > " / \`
- Spaces and brackets are fine — `WOMEN JACK (all colours).glb` is perfectly OK
- Don't put a dot or a space at the very end of the name

**How big can it be?** It doesn't matter. 300 MB, 400 MB — all fine. Making it
small is the robot's job now, not yours.

> **Why the naming rules?** Two different parts of the system tidy up filenames
> using slightly different rules. A name containing one of those characters ends
> up stored under two different names, and the system then thinks your upload
> failed when it didn't. Rather than let that happen, it stops you at the door
> with a message telling you to rename the file.

---

## Step 2 — Turn on the two watch windows

Do this **before** you upload. These windows show what is happening *right now*.
They cannot show you the past — so if you upload first and something goes wrong,
the evidence is gone and you have to do it all again.

Open a Terminal window and paste this:

```bash
pnpm --filter @run-apparel/cms exec wrangler tail run-apparel-viewer-cms
```

Open a **second** Terminal window and paste this:

```bash
pnpm --filter @run-apparel/shrink exec wrangler tail run-apparel-viewer-shrink
```

Leave both running. They will look like they are doing nothing. That's correct —
they wake up when you upload.

---

## Step 3 — Upload

1. Open the CMS. Go to **Raw uploads** → **Create new**.
2. **Target product:** choose *Velocity Performance Tee*.
3. **Detail:** leave it on **Balanced**.
4. Choose your file and upload it.
5. Keep the tab open and in front. Don't switch away and don't let the laptop
   go to sleep while it uploads.

Now watch the **Status** field, refreshing every minute or so:

**Queued** → **Processing** → **Ready to review**

A large file takes a few minutes. That is normal.

---

## Step 4 — Check the robot's work

When Status says **Ready to review**, read the **Report** box. It tells you:

- how big the finished file is
- which colour names it found inside

**Check the colour names.** They must read exactly `N001-NAVY`, `N001-BLACK`,
`N001-CRIMSON`. If they say anything else, the colour buttons will not work —
go back to CLO, rename the colourways, and export again.

---

## Step 5 — Put it on the website

1. Open the product **Velocity Performance Tee**.
2. Attach the finished file — it is linked from the raw upload as **Result GLB**.
3. Tick **Variants verified**.
4. Save.
5. Open `https://viewer.wear-run.help/n001/navy` **on your phone**.
6. Zoom right in on a printed logo.

That last step is the whole point of the 2026-07-28 work. Logos used to tear
apart when the file was shrunk. Look closely at them before you tell anyone the
page is ready.

---

## The Detail setting

You only have one decision to make, and you can change your mind by uploading
again. No developer, no waiting.

| Setting | When to use it |
|---|---|
| **Balanced** | Always start here. |
| **Highest quality — bigger file** | The printed graphics came back soft or broken. |
| **Smallest file — softer detail** | It was rejected for being too big, or it's slow to load on a phone. |

Changing Detail and uploading the file again re-runs everything. That is the
intended way to tune a garment.

---

## If it says Failed

Don't change any settings in the code. Read the **Report** — it explains itself
in plain language now.

| What it says | What you do |
|---|---|
| "over the 40.0 MB limit" | Upload again with **Detail: Smallest file** |
| Logos look fuzzy or broken | Upload again with **Detail: Highest quality** |
| "did not finish uploading" | Your connection dropped. Try again, keep the tab in front |
| "cannot store reliably" | Rename the file — remove the odd character |
| "must be GLB models" | Wrong kind of file. Export a GLB from CLO |
| "(.zprj) are never processed here" | That's the CLO project file, not the export. Export a GLB |
| **"Something went wrong."** | **Report this** — that is a bug, not your mistake |
| Anything else confusing | Copy both Terminal windows and send them |

That second-to-last row matters. Every rejection is supposed to tell you what to
do. A bare "Something went wrong." means one slipped through the net.

---

## Honest warning

**Nothing has ever been through this pipeline.** Not once, since it was built.
Your first upload is also its first real test, so there is a fair chance
something unexpected happens. That isn't failure — that is what a first test is
for. Keep the two watch windows running and whatever happens will be on screen.

If it goes wrong, the manual route still works and is unchanged: see
[README.md](../README.md) § 3, "Preparing 3D files".
