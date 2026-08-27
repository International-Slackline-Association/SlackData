# The SlackData gear API — for manufacturers

*For brands with a SlackData API credential. If you don't have one and want one, see
[Getting a credential](#getting-a-credential) at the end.*

You make the gear; you know its specs better than we do. This API lets you keep your own products
on [slackdata.org](https://slackdata.org) correct, in one call, without emailing anybody.

**Base URL:** `https://slackdata.org/api`

---

## Read this part first

**An update is recorded, not applied instantly.** The catalogue is a read-only file rebuilt and
redeployed from source; your update becomes a change request that is auto-approved on arrival —
nobody judges whether you are right about your own product — and then applied by an administrator
and shipped with the next deploy. So:

- Your `POST` returning **201 is not the site being updated.** It means we have your correction and
  it is queued as work, not as a decision.
- There is no rush and no expiry. An approved manufacturer update never ages out of the queue.
- You can check what happened to anything you sent with
  [`GET /manufacturer/submissions`](#get-manufacturersubmissions).

**Start with `GET /manufacturer/gear`.** We have ids for your products; you have SKUs. That endpoint
is where the two get introduced, and the whole design assumes you called it first.

---

## 1. Get an access token

Standard OAuth 2.0 client credentials against Cognito. You were given a `client_id` and a
`client_secret`; the token URL is the `ManufacturerTokenUrl` we sent with them (it looks like
`https://slackdata-admin-prod-<account>.auth.eu-central-1.amazoncognito.com/oauth2/token`).

```bash
curl -s -X POST "$TOKEN_URL" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d 'grant_type=client_credentials&scope=slackdata/gear.write'
```

```json
{ "access_token": "eyJraWQ...", "expires_in": 3600, "token_type": "Bearer" }
```

Send it as `Authorization: Bearer <access_token>` on every request below. Cache it until it expires
— minting a fresh token per request works but is pointless.

The scope is exactly `slackdata/gear.write`. Ask for a scope you were not granted and Cognito
refuses the token, not the request.

### Confirm it reached the right brand

Do this once, before you send any data. It costs one request; discovering the credential was mapped
to the wrong brand a week later costs an apology to two companies.

```bash
curl -s https://slackdata.org/api/manufacturer/me -H "Authorization: Bearer $TOKEN"
```

```json
{
  "client_id": "3n4kf9...",
  "brand_id": 17,
  "brand_name": "Balance Community",
  "permissions": ["suggest"],
  "dev": false
}
```

If `brand_name` is not you, **stop and tell us** — do not send data.

---

## 2. `GET /manufacturer/gear` — discover our ids

Every catalogue row belonging to you.

```bash
curl -s https://slackdata.org/api/manufacturer/gear -H "Authorization: Bearer $TOKEN"
```

```json
[
  { "gear_type": "webbings", "gear_id": 42, "name": "Type 18 Mk III", "active": true },
  { "gear_type": "weblocks", "gear_id": 8,  "name": "Alpine Weblock", "active": false }
]
```

| Query parameter | Meaning |
|---|---|
| `gear_type=webbings` | Only one type. Unknown type → **404**. |
| `include=spec` | Add a `spec` object per row: the values we currently hold. |

`active: false` means we have this recorded as discontinued; `null` means we don't know. Both are
correctable like any other field.

### `?include=spec` — the round trip

```bash
curl -s 'https://slackdata.org/api/manufacturer/gear?gear_type=webbings&include=spec' \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "gear_type": "webbings", "gear_id": 42, "name": "Type 18 Mk III", "active": true,
    "rename_to": null,
    "spec": {
      "width": 25.0, "weight": 71.0, "breaking_strength": 32.0,
      "material": ["Polyester"], "price": 2.15, "currency": "USD",
      "product_url": "https://...", "colors": null, "description": null
    }
  }
]
```

**`spec` is exactly the set of keys `POST /manufacturer/gear` accepts in
`changes`.** That is the contract: read the dict, change what is wrong, and send
it straight back as `changes` — **verbatim**. You never have to guess a field
name, and you never have to filter the payload before sending it.

**The row and the item have the same shape**, which is what makes the copy
mechanical: `gear_type`, `gear_id`, `name` and `rename_to` sit at the top of
both, and `spec` becomes `changes`.

| Key | Where | What it is |
|---|---|---|
| `name` | on the row | What we currently call it. Copy it to the item so a drifted `gear_id` can be recovered. **It is not a spec value and cannot be sent in `changes`.** |
| `rename_to` | on the row | Always `null` on the way out. Set it on the item to rename the product. |
| `spec` | on the row | The values you may change. Goes into `changes` unaltered. |

`name` and `rename_to` are kept out of `spec` because they are identity, not
specification: `name` is the handle we match the item by, so one key cannot mean
both "which product is this" and "what should it be called".

`include` takes a comma-separated list, and an unrecognised value is a **422**,
not a silent ignore — so a typo (`include=specs`) tells you, rather than
returning four fields and leaving you to wonder.

## 3. `POST /manufacturer/gear` — send corrections

One call, up to **50 products**. Body:

```json
{
  "note": "spring 2027 line refresh",
  "items": [
    {
      "gear_type": "webbings",
      "gear_id": 42,
      "name": "Type 18 Mk III",
      "manufacturer_sku": "BC-T18-MK3",
      "changes": { "weight": 71, "breaking_strength": 32, "price": 2.15, "currency": "USD" },
      "source_url": "https://balancecommunity.com/type-18"
    }
  ]
}
```

### The item fields

| Field | Required | Notes |
|---|---|---|
| `gear_type` | **yes** | One of the eight slugs in the table below. |
| `gear_id` | one of these two | Our id, from `GET /manufacturer/gear`. |
| `name` | one of these two | Your name for it. **Send it even when you send an id** — see below. |
| `changes` | one of these three | Field name → new value, straight from `spec`. Up to 60 per item. **`name` is not accepted here** — see below. |
| `rename_to` | one of these three | A new name for the product. See below. |
| `manufacturer_sku` | no | Your part number. Stored with the record so you never have to re-send it; we do not match on it yet. |
| `note` | one of these three | Free text for the administrator; also useful when you have nothing to change but something to say. |
| `source_url` | no | Where the correct value is published. Must be `http(s)`. |

`changes` values may be strings, numbers, booleans, `null`, or a flat list (some fields really are
lists, e.g. `material`). They are all recorded as text for a human to apply — `null` means "we no
longer publish this", which is not the same as an empty string.

### Renaming a product

A rename is the one correction where the thing being changed is also the handle we match on, so it
has its own field beside `name` rather than riding in `changes`:

```json
{
  "items": [
    { "gear_type": "webbings", "gear_id": 42, "name": "Aero", "rename_to": "Aero 1" }
  ]
}
```

`name` stays what we call it **today** — that is what makes the item resolve. `rename_to` is what it
should be called, and it is the **only** way to change a name; sending `name` inside `changes` is a
422 that says so. A rename on its own is a complete item: it needs no other change and no note.

Two things are dropped rather than refused, both so that an integration can post the same payload
every night without maintaining it: `rename_to: null` (no rename requested), and a `rename_to` that
already matches the name we hold (the rename shipped; there is nothing left to do).

Two are refused, both **422**: renaming a product we do not hold — there is nothing to rename, so
send it as a new product with no `rename_to` — and an item where everything sent already matches
what we hold and there is no note, which asks for nothing.

### Why send `name` as well as `gear_id`

Our gear ids are stable but not immortal, and we hold no column for your SKU. So we verify rather
than trust:

1. If `gear_id` is given, we check it is **yours** and that `name` still agrees with it.
2. If they disagree, we fall back to matching `name` within your own products.
3. If that is ambiguous — you have two products with that name — we refuse rather than guess (**409**);
   send the `gear_id` to settle it.
4. **The response echoes back the id we resolved to.** Store it. That is how your mapping repairs
   itself without anyone having to tell you it broke.

An item with a `name` we cannot match **and no `gear_id`** is still accepted — it is recorded as a
possible new product, with `"resolution": "new"`.

Send that same unmatchable name *with* a `gear_id` and it is refused instead (**409**). Both handles
are good and they disagree, which is what a rename looks like from our side: the commonest cause is
that you renamed the product and your integration now sends the new name next to our id. Filing that
as a new product would put something we already hold in front of an administrator as a candidate for
a second catalogue row — so the message names what we hold and how to say what you meant. A genuinely
new product has a path that is never ambiguous: send it with no `gear_id`.

### The response (201)

```json
{
  "batch_id": "01JXQ8...",
  "brand_id": 17,
  "accepted": 1,
  "results": [
    {
      "submission_id": "01JXQ8...",
      "gear_type": "webbings",
      "gear_id": 42,
      "gear_name": "Type 18 Mk III",
      "manufacturer_sku": "BC-T18-MK3",
      "resolution": "id",
      "stale_gear_id": null,
      "status": "approved",
      "applied": false
    }
  ]
}
```

| Field | What to do with it |
|---|---|
| `gear_id` | **The resolved id.** Write it back to your mapping. |
| `resolution` | `"id"` matched on the id you sent, `"name"` matched on the name, `"new"` matched nothing. |
| `stale_gear_id` | Present when the id you sent no longer points at that product — the old value, so you can log the change. |
| `applied` | Whether the live catalogue changed. **Always `false` today** (see [Read this part first](#read-this-part-first)). It exists now so that if direct writes ever land, your integration needs no new field. |
| `batch_id` | Groups this call's records. Quote it if you ever need to ask us about the batch. |

### All-or-nothing

If **any** item fails to resolve, nothing is stored and the whole call is refused, naming the item
by index (`items[7]: ...`). That is deliberate: it means a retry after a fix is always safe, and can
never duplicate the items that would have worked.

Retrying a call that *succeeded* does create a second batch — we have no idempotency key. Two
batches show up as two groups rather than being silently merged, but it is still work for a human,
so don't retry on a 201.

---

## 4. `GET /manufacturer/submissions` — read back what you sent

The receipt from a `POST` is one-shot. This is where you look afterwards.

```bash
curl -s 'https://slackdata.org/api/manufacturer/submissions?limit=50' \
  -H "Authorization: Bearer $TOKEN"
```

Your own submissions, newest first. `?batch_id=01JXQ8...` narrows it to one call; `?limit=` is
1–100, default 50.

```json
[
  {
    "submission_id": "01JXQ8...", "batch_id": "01JXQ8...",
    "gear_type": "webbings", "gear_id": 42, "gear_name": "Type 18 Mk III",
    "manufacturer_sku": "BC-T18-MK3",
    "changes": { "weight": "71" },
    "status": "approved", "created_at": "2026-08-25T09:14:02Z",
    "reviewed_at": null,
    "review_note": "auto-approved: sent by Balance Community through the manufacturer API"
  }
]
```

`status` is `approved` on arrival. It can become `rejected` — an administrator can send one back
after the fact, precisely because nobody judged it on the way in — and `review_note` will say why.
**That note is written to be read by you.** This endpoint is the only way you learn about a
rejection; we send no email.

---

## 5. Status codes

| Code | Meaning | What to do |
|---|---|---|
| **201** | The batch was recorded. | Store the resolved `gear_id`s. Do not retry. |
| **401** | No token, an expired one, or one we can't verify. | Get a new access token. |
| **403** | Your credential is not registered, has been deactivated, or the item names **another brand's** gear. | Not retryable. Check the `gear_id`s came from your own `GET /manufacturer/gear`; otherwise contact us. |
| **409** | We cannot tell which product you mean: either two of your own answer to that name, or you sent a `gear_id` and a `name` that disagree and the name matches nothing of yours. | For the first, send the `gear_id`. For the second, the message says what we hold under that id — send that as `name`, and `rename_to` if you have renamed it. |
| **413** | Body over 256 KB. | Split the batch. |
| **422** | The body is malformed, a field name isn't real, `name` was sent inside `changes` (use `rename_to`), a value is empty or too long, a rename has nothing to rename, an item asks for nothing, or `include=` was mistyped. | The message names the item index and the field. Fix and resend — nothing was stored. |
| **429** | Rate limited. This endpoint allows roughly 1 request/second with a small burst. | Back off; you should not be near this outside a first bulk run. |
| **502** | **Partial write.** Some items were stored before something failed. | **Do not blind-retry** — the message says how many landed and names the `batch_id`. Either resend only the items after that index, or quote the `batch_id` to us. |
| **503** | Our record of your brand id is stale (nothing is wrong with your credential). | Contact us; an operator re-runs the registration. Nothing you can do from your side. |

---

## 6. Gear types and field names

`gear_type` must be one of:

| Slug | What it is |
|---|---|
| `webbings` | Slackline webbing |
| `weblocks` | Weblocks / line locks |
| `leashrings` | Leash rings |
| `grips` | Grips |
| `rollers` | Line sliders / rollers |
| `treepros` | Tree protection |
| `starterkits` | Starter kits |
| `tricklinekits` | Trickline kits |

**The authoritative list of field names for a type is what
`GET /manufacturer/gear?include=spec` returns for your own products.** The lists below are the same
names, written out for convenience — checked against the running API by our test suite on every
build, but the endpoint is the thing that cannot go stale.

`name` and `rename_to` are **not** in these lists, and that is deliberate: they are not specs, they
are identity. Both sit on the row you read and on the item you post, next to `gear_id` — see § 2.
Everything below is a key of `changes`.

- **`webbings`** — `active`, `brand_name`, `breaking_strength`, `colors`, `currency`, `description`,
  `isa_certified`, `isa_warning`, `material`, `notes`, `price`, `product_url`,
  `release_date`, `stretch`, `thickness`, `version`, `webbing_construction`, `weight`, `width`
- **`weblocks`** — `active`, `attachment_point`, `brand_name`, `breaking_strength`, `colors`,
  `currency`, `description`, `front_pin`, `isa_certified`, `isa_warning`, `material`,
  `notes`, `price`, `product_url`, `release_date`, `style`, `version`, `weight`, `width_max`,
  `width_min`
- **`leashrings`** — `active`, `brand_name`, `breaking_strength`, `currency`, `description`,
  `inner_diameter`, `isa_certified`, `isa_warning`, `material`, `notes`, `outer_diameter`,
  `price`, `product_url`, `release_date`, `version`, `weight`
- **`grips`** — `active`, `brand_name`, `common_slipping_threshold`, `connection_type`, `currency`,
  `description`, `isa_certified`, `isa_warning`, `material`, `mbs`, `notes`, `price`,
  `product_url`, `release_date`, `version`, `weight`, `width_max`, `width_min`, `wll`
- **`rollers`** — `active`, `bearing_material`, `brand_name`, `breaking_strength`, `colors`,
  `currency`, `description`, `isa_certified`, `isa_warning`, `lock_type`, `material`,
  `notes`, `price`, `product_url`, `release_date`, `roller_material`, `slider_type`, `version`,
  `weight`, `width`
- **`treepros`** — `active`, `brand_name`, `currency`, `description`, `has_sling_attachment`,
  `length`, `notes`, `price`, `price_unit`, `product_url`, `release_date`, `thickness`,
  `version`, `weight`, `width`
- **`starterkits`** — `active`, `brand_name`, `currency`, `description`, `includes_treepro`,
  `isa_certified`, `notes`, `price`, `product_url`, `release_date`, `tensioning_type`,
  `version`, `webbing_length`, `webbing_width`, `weight`
- **`tricklinekits`** — same as `starterkits`.

### Units and conventions, so a correct number isn't recorded wrongly

**These are not uniform across gear types.** They follow the sources the catalogue was built from
rather than one house style, and getting one wrong records a correct measurement as a wrong one.
Where you are unsure, read the value back with `?include=spec` first — the number we already hold
tells you the unit faster than this table does.

| Field | Unit |
|---|---|
| `weight` | grams — **grams per metre on `webbings`** |
| `breaking_strength`, `mbs`, `wll`, `common_slipping_threshold` | kilonewtons |
| `width`, `thickness` on `webbings` | millimetres |
| `width_min`, `width_max` on `weblocks` and `grips` | millimetres |
| `inner_diameter`, `outer_diameter` on `leashrings` | millimetres |
| `width` on `rollers` | **a string, not a number** — a range, e.g. `"19-25 mm"` |
| `width`, `length` on `treepros` | **centimetres**; `thickness` on `treepros` is millimetres |
| `webbing_length` on kits | metres; `webbing_width` on kits is millimetres |
| **`price` on `webbings`** | **per metre**, not per item |
| `price` on everything else | per item — except `treepros`, where `price_unit` is `single` or `pair` |
| `currency` | ISO 4217 code, e.g. `EUR`, `USD`. Quote the price in your own currency; we convert for display. **Never pre-convert.** |
| `release_date` | Unix milliseconds. If you only know the year, put it in a `note` rather than guessing a day. |
| `active` | `true` still sold, `false` discontinued, `null` unknown |
| `material` | a list, e.g. `["Polyester"]` — a plain string is accepted too |
| `colors` | free text |
| `stretch` on `webbings` | a JSON string of load/elongation readings, `[{"kn": 5, "percent": 1.2}, ...]`. Send the curve you publish; leave it out if you don't publish one. |
| `isa_certified` | boolean. This is your ISA certification status, not our opinion of it. |

`brand_name` is accepted but is not something you can set directly — send it only if our spelling of
your brand is wrong, and an administrator will fix the underlying record.

---

## Getting a credential

Mail <emile.bragard@gmail.com> from an address **at your brand's own domain**. We will confirm
out-of-band — to the contact address or channel already published on your own site — before issuing
anything. That is not a comment on you; it is the only way we can tell a brand from someone claiming
to be one, and it is why nobody can request a credential through this API.

You will receive a `client_id`, a `client_secret` (once — we do not keep a copy) and the token URL.

To revoke: tell us, and it takes effect on the next request.

---

*Questions, or something in this document that doesn't match what the API did? Tell us — a
surprising answer here is our bug, not your misreading.*
