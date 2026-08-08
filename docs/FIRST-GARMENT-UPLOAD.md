# Uploading your first garment — the plain-English guide

This is the owner's guide. No code, no jargon. If you want the technical version,
read [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md) instead.

---

## Where things stand

**This has been done for real, all the way through.** N001 — *Velocity Performance
Skinsuit* — is live with a 27.0 MB model in five colourways (wine, blush, butter,
lime, black). Scan its QR code and the garment spins, with the printed artwork
intact and checked by eye.

So this guide is no longer "how to do the scary first one". It is **how to do the
next one**, and the route below is the one that actually worked.

> **Corrected 2026-08-08.** Until today this section said N001 had *no 3D model
> attached* and described the project as an oven with no dough. That was true when
> it was written and stopped being true on **2026-08-05**; nobody updated it. If
> you are reading a claim in this file that feels stale, check the date on it —
> `docs/HARDENING-LOG.md` and `raw/CANONICAL.json` are kept current.

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
4. Open `https://viewer.wear-run.help/n001/wine` **on your phone**.
5. Zoom right in on a printed logo.

That last step matters. Logos used to tear apart when the file was shrunk. Look
closely at them before you tell anyone the page is ready.

---

## Step 6 — Check the link before you send it to anyone

Paste the address into WhatsApp to yourself, or into a draft email. You should see
a **card**: a picture of the garment, its name and colour, and its fabric. Not a
bare blue link.

For N001 this already works, in all five colours, and there is nothing to do.

**For a brand-new garment there is one command**, and it is for whoever is running
the tools, not for you:

```bash
pnpm og:cards n002
```

(with the new garment's short code in place of `n002`). It makes the pictures the
card uses.

**If nobody runs it, nothing breaks.** The card still shows the right garment in
the right colour — but only on Slack, X, Facebook, Telegram and Discord. On
**LinkedIn and iMessage the picture goes missing**, because those two will not
display the picture format the website uses internally. The command converts them.

So: send yourself the link first. If you see the garment, you are fine.

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
| **Highest quality — bigger file** | The printed graphics came back **smeared or stretched**. (Not for graphics that are see-through, boxed over, or missing — Detail cannot change those.) |

> **There used to be a third option, “Smallest file”. It was removed on
> 2026-08-05.** It made files smaller by damaging the printed graphics — the chest
> wordmark measurably broke apart at that setting — and every automatic check
> passed it anyway. A file that is too big needs re-exporting from CLO with a
> lighter mesh.

Changing Detail and uploading the file again re-runs everything. That is the
intended way to tune a garment.

---

## If it says Failed

Don't change any settings in the code. Read the **Report** — it explains itself
in plain language.

| What it says | What you do |
|---|---|
| "over the 40.0 MB limit" | Re-export from CLO at a lower mesh density — there is no smaller Detail level, see the note above |
| Logos look fuzzy or **smeared** | Upload again with **Detail: Highest quality** |
| Logos look **see-through**, or have a pale box over them, or are gone | Detail will not help — this is a transparency fault, not a detail one. Tell your developer |
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

## Where this actually stands (2026-08-08)

**Ready to show a customer.** A 382 MB CLO export goes in, a 27 MB model comes
out, its colours are named from the file itself, and it renders on the live
viewer with the chest wordmark legible.

**The artwork problem is fixed.** Logos and wording used to come back
half-visible; that was resolved on **2026-08-05** and is now held in place by an
automatic check that renders the artwork before and after processing and measures
how much moved. It runs on every deploy and blocks a bad one.

> **Corrected 2026-08-08.** This section previously carried the 2026-07-29 status
> — artwork "still open", and an instruction to treat the pipeline as **"not yet
> ready for a garment you would show a customer"**. Both were superseded on
> 2026-08-05 and the correction never reached this file, so for three days the
> owner's own guide advised against the thing the system had just been fixed to
> do. See [OPEN-ISSUE-ARTWORK.md](OPEN-ISSUE-ARTWORK.md) — status **CLOSED**,
> kept under that filename because six source comments cite its hypotheses by
> number.

**One thing to know before garment #2.** The strongest artwork check —
`pnpm eval:artwork:real` — is calibrated to N001's exact file and refuses to run
on anything else. A new garment is covered by the automatic check on every deploy,
but not yet by that one. Adding it means calibrating a ceiling for the new
garment: `docs/RUNBOOK.md` → "Replacing or adding a garment".

If something goes wrong, the manual route still works: see
[README.md](../README.md) § 3, "Preparing 3D files".
