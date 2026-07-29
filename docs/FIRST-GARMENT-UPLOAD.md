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

**Right now, N001 "Velocity Performance Tee" has no 3D model attached.** If someone
scans its QR code today, the page loads and all the text is correct, but the space
where the garment should spin is empty. Attaching a model is what fixes that.

---

## Step 1 — Get a file out of CLO

This is the only part nobody else can do for you.

**Make ONE file that contains all your colours.** Not three files. One.

**Call the colours whatever you like.** `Colorway 1`, `Colorway 2`, your own
names, anything — it genuinely does not matter. The website asks you which is
which afterwards, in plain English.

> **This changed on 2026-07-29.** The old guide told you the colours inside CLO
> had to read exactly `N001-NAVY`, `N001-BLACK`, `N001-CRIMSON`, character for
> character, and that getting it wrong was the single most common thing that went
> wrong. That rule is gone. You do not have to name anything in CLO any more.

**When you save the file:**

- Give it a simple name that **ends in `.glb`** — for example `velocity-tee.glb`
- Do **not** use any of these characters in the name: `? * : | < > " / \`
- Spaces and brackets are fine — `WOMEN JACK (all colours).glb` is perfectly OK
- Don't put a dot or a space at the very end of the name

**How big can it be?** It doesn't matter. 300 MB, 400 MB — all fine. Making it
small is the robot's job, not yours.

> **Why the naming rules for the FILE?** Two different parts of the system tidy up
> filenames using slightly different rules. A name containing one of those
> characters ends up stored under two different names, and the system then thinks
> your upload failed when it didn't. Rather than let that happen, it stops you at
> the door with a message telling you to rename the file.

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

## Step 3 — Upload, on the product page

You no longer go to a separate "Raw uploads" page. Everything happens on the
product.

1. Open the CMS and click **Products** → *Velocity Performance Tee*.
2. Click the **3D file** tab.
3. Under **Your CLO files**, click to add one.
4. **Detail:** leave it on **Balanced**.
5. Choose your file and upload it.
6. Keep the tab open and in front. Don't switch away and don't let the laptop
   go to sleep while it uploads.

Now watch the **Status** column, refreshing every minute or so:

**Queued** → **Processing** → **Ready to review**

A large file takes a few minutes. That is normal.

---

## Step 4 — Tell it which colour is which

This is the new bit, and it is the whole reason CLO naming no longer matters.

When Status says **Ready to review**, open the **Report**. It lists the colours it
found inside your file, in order — whatever CLO called them:

```
Colours found inside your file, in order:
  1. Colorway 1
  2. Colorway 2
  3. Colorway 3
```

Now click the **Colours** tab. Each of your colours has a question:

> **Which colour in your CLO file is this?**

Pick from the dropdown. It lists exactly the names above. Match Navy to whichever
one is actually navy, and so on. Then **Save**.

**Colours checked** ticks itself once every colour is matched. There is nothing
for you to tick.

> **How do I know which is which?** Look at the photos. If you get one wrong, the
> colour buttons will show the wrong colour — change the dropdown and save again.
> Nothing is permanent and nothing needs re-uploading.

---

## Step 5 — Put it on the website

1. Still on the **3D file** tab, set **Finished 3D file** to the shrunk file the
   robot produced.
2. Set **Status** to **Published**.
3. Save.
4. Open `https://viewer.wear-run.help/n001/navy` **on your phone**.
5. Zoom right in on a printed logo.

That last step matters. Logos used to tear apart when the file was shrunk. Look
closely at them before you tell anyone the page is ready.

---

## Which colour do people see first?

The **top** colour that is switched on. Drag the rows on the Colours tab to change
it. There is no separate setting.

Switching a colour off retires it. Old QR codes for that colour still work — they
show your first colour instead, with the retired message.

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
in plain language.

| What it says | What you do |
|---|---|
| "over the 40.0 MB limit" | Upload again with **Detail: Smallest file** |
| Logos look fuzzy or broken | Upload again with **Detail: Highest quality** |
| "did not finish uploading" | Your connection dropped. Try again, keep the tab in front |
| "cannot store reliably" | Rename the file — remove the odd character |
| "must be GLB models" | Wrong kind of file. Export a GLB from CLO |
| "(.zprj) are never processed here" | That's the CLO project file, not the export. Export a GLB |
| "no colour picked from your CLO file" | Go to the Colours tab and answer the dropdown for each colour |
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

If it goes wrong, the manual route still works: see [README.md](../README.md) § 3,
"Preparing 3D files".
