# Proposal to the ISA — editing SlackData together

**DRAFT, not sent.** A non-technical summary of [LIVE_EDITING_PLAN.md](LIVE_EDITING_PLAN.md), to
get the ISA's input. The technical request (role policy, app client, table design) was sent to
the ISA's technical contact separately on 2026-10-07. The email is below the line.

---

**Subject:** SlackData — a proposal for keeping the gear database up to date, and your input

Hi all,

I'd like your thoughts on where SlackData goes next, before I start building anything.

## The problem

SlackDB worked for years because a handful of people could keep it up to date, and it died when
nobody could edit it any more.

Today SlackData has the same weak spot: me. Every correction or new product comes to me as a
suggestion, and I update the data by hand. That works now, but it won't last, and it doesn't scale.

## The idea

Make SlackData work more like Wikipedia: the people who know the gear keep it up to date
themselves, and every change is out in the open.

- **Sign in with your ISA account**, the same one used for SlackMap and SportHub. There is no new
  account to create.
- **Anyone can read** the database, as now, without signing in.
- **Anyone with an ISA account can edit directly** — fix a spec, add a product or a brand, upload a
  photo. There is no suggestion box and no waiting for approval: if you have an ISA account, you're
  trusted to edit.
- **A limit on how much one account can change** — 20 changes an hour and 100 a day — so a misused
  or hacked account can't rewrite the database overnight. That is far more than normal use needs.
- **Manufacturers** are confirmed as representing their brand. They have no limit on their own
  products, and can undo changes to them in one click.
- **Admins** (me, plus any SafeCom members who want to be) confirm manufacturers, can undo any
  change, block anyone abusing the site, and look after the ISA certification and warning
  information.

## Transparency comes first

- **Every change is recorded publicly**: who made it, when, and what it changed — on each product
  page and in a site-wide list of recent changes.
- **Anyone can follow those changes**, including a separate list of changes to breaking strengths.
- **Any change can be undone**, by an admin or by the product's manufacturer, and the undo is
  recorded too. Anyone else can simply correct it.
- **A full copy of the database and its history is saved publicly every day.** It is a backup, and
  it means nobody could quietly alter the history without it showing.

## Safety

- **Breaking strengths can be changed by anyone**, like every other figure. Every such change
  appears in a separate public list, so anyone who cares about safety can follow exactly those.
- **On ISA-certified gear, the certificate's own tested values stay shown** next to the
  manufacturer's figures, so any difference is visible.
- **Only admins can change ISA certification and warning information**, so a recall can never be
  removed by anyone else.

## How we'd get there

Step by step. Each step is useful on its own, and we can pause after any of them.

0. **Agreement and setup.** Your feedback on this proposal, then a few technical permissions in
   the ISA's systems.
1. **Signing in with ISA accounts.** Admins and roles exist, and nothing about the catalogue changes
   yet.
2. **Moving the data into a live database.** Visitors notice nothing. The daily public copy starts.
3. **Admins can edit on the site**, with the full history, the recent-changes list and undo.
4. **Photos and manuals can be uploaded on the site**, rather than through me.
5. **Manufacturers can update their own products.**
6. **Editing opens to everyone with an ISA account**, with the hourly and daily limit. The old
   "suggest a correction" box is retired.
7. **ISA certification and warning information is managed on the site**, and later kept in sync
   with the ISA's own lists automatically.

## What it would cost

Very little — an estimated **few dollars a month at most**, on the ISA's existing AWS account,
next to SlackMap and SportHub:

- **Storing the data and its change history:** cents a month. It is a small database.
- **Photos and manuals:** cents a month to store; showing them to visitors is mostly within AWS's
  free allowance.
- **The daily public copy:** free (GitHub).
- **Accounts and emails:** free — the existing ISA account system already handles sign-up, password
  resets and email.

There are no new subscriptions or licences, and nothing to pay up front.

## What I'd need from the ISA

Besides your feedback, three things only the ISA can decide or provide:

1. **Privacy approval for showing names.**
   - **What:** each change would show the full name of the person who made it, publicly and
     permanently, including in the daily public copy.
   - **On request:** someone's name could be removed from the site and from the public copy. Copies
     other people had already taken might still contain it.
   - **Why the ISA:** ISA accounts belong to the ISA, and its current privacy policy doesn't cover
     another site showing names.
   - **What I'd suggest:** a short privacy notice, plus a one-time "your name will be shown with
     your edits" agreement the first time someone edits. Could whoever looks after privacy for the
     ISA approve the wording, or tell me what to change?
2. **Admins.**
   - **What they do:** confirm manufacturers, undo bad changes, block anyone abusing the site,
     merge duplicate products, and look after the ISA certification and warning information.
   - **The ask:** who from SafeCom would like to be an admin alongside me? It can be a few people,
     and every admin appointment is itself recorded publicly.
3. **A home for the daily public copy.**
   - **What:** a new repository in the ISA's GitHub organisation, next to SlackMap's.
   - **The ask:** someone with rights to create one there, or to give me those rights. It runs on
     its own after that.

## Your thoughts

1. **Does this direction feel right to you?** In particular, anyone with an ISA account editing
   directly, with everything public and a limit on how much one account can change.
2. **Are you comfortable with breaking strengths being editable by anyone**, with every such change
   listed publicly rather than checked first?
3. **Anything missing, or anything that worries you?**

There's a detailed technical plan behind this that I'm happy to share with anyone who wants it.

Thanks,
Emile
