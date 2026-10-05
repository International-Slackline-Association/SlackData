"""Turn raw/ (what fetch.py captured) into the readable archive files.

Nothing here is invented: every value comes from raw/. What build.py adds is
joining (a gear row's manufacturer NAME next to its id), decoding (SlackDB's
dictionary codes, e.g. material "PL" → "Polyester", in the CSVs only) and
HTML-entity unescaping (the site stored "Can&#x27;t" for "Can't").

JSON files keep SlackDB's own field names and codes; keys this script adds start
with "_". CSVs are the decoded, human view.
"""

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
SITE = "https://slackdb.com"

GEAR_FILES = {
    "WEB": "webbings", "WLCK": "weblocks", "SKT": "starter_kits", "TLK": "trickline_kits",
    "LRNG": "leash_rings", "TRP": "tree_protectors", "SLD": "line_sliders",
    "WGP": "webbing_grips", "BRK": "rope_brakes", "CON": "connectors", "GEN": "general",
}

# Bookkeeping fields: kept in the JSON, given their own fixed columns in the CSV.
META = {
    "_id", "slug", "itemTypeId", "name", "manufacturerId", "creatorId", "creatorName",
    "creationDate", "lastEditDate", "contributors", "commentsCount", "reviewsCount",
    "imagesCount", "reviews", "comments", "ratingsAverages", "remarks", "fieldsRemarks",
    "externalRating", "gearStats",
}


def load(path):
    return json.loads((RAW / path).read_text(encoding="utf-8"))


def save_json(name, obj):
    path = HERE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def save_csv(name, rows):
    path = HERE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = []
    for r in rows:
        cols += [k for k in r if k not in cols]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def unescape(obj):
    if isinstance(obj, str):
        return html.unescape(obj)
    if isinstance(obj, list):
        return [unescape(x) for x in obj]
    if isinstance(obj, dict):
        return {k: unescape(v) for k, v in obj.items()}
    return obj


def iso(ms, date_only=False):
    if ms is None or ms == "":
        return ""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d") if date_only else dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── reference data ──────────────────────────────────────────────────────────

DICTS = dict(load("api/dictionaries.json"))
for f in ("gear", "communities", "images", "knowledge", "manufacturers"):
    for d in load(f"api/dictionaries_{f}.json"):
        DICTS.setdefault(d["_id"], d)
TYPES = load("api/item_types_def.json")
COUNTRIES = load("api/countries.json")
UNITS = DICTS["UNT"]["entries"]


# `flags` has no field definition anywhere; its codes live in a per-type dictionary.
FLAG_DICTS = {"WEB": "WBF", "WLCK": "WLFLG", "LRNG": "LRF", "SLD": "SLF"}


def field_defs(type_id):
    """BASE field definitions overlaid by the type's own (per-field merge, as the site does)."""
    defs = {"flags": {"caption": "Flags", "dictionaryId": FLAG_DICTS[type_id]}} if type_id in FLAG_DICTS else {}
    layers = [TYPES["BASE"], TYPES[type_id]] if type_id in GEAR_FILES else [TYPES[type_id]]
    for layer in layers:
        for fid, d in layer.get("fieldsDefinition", {}).items():
            defs[fid] = {**defs.get(fid, {}), **d}
    return defs


def decode(dict_id, code):
    entries = DICTS.get(dict_id, {}).get("entries", {})
    return entries.get(code, code)


def country(code):
    return COUNTRIES.get(code, {}).get("name", code or "")


def render(value, d):
    """One field value → display text, using its SlackDB field definition."""
    if value is None:
        return ""
    if d.get("dictionaryId"):
        vals = value if isinstance(value, list) else [value]
        return "; ".join(str(decode(d["dictionaryId"], v)) for v in vals)
    t = d.get("type")
    if t == "BOOL" or isinstance(value, bool):
        return "yes" if value else "no"
    if t == "DATE":
        return iso(value, date_only=True)
    if isinstance(value, dict):
        if {"percent", "force"} <= value.keys():
            return f"{value['percent']}% @ {value['force']} kN"
        if {"min", "max"} >= value.keys():
            return "–".join(str(value[k]) for k in ("min", "max") if k in value)
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "; ".join(str(v) for v in value)
    return value


def pricing_text(p):
    if not p or not p.get("lst"):
        return ""
    cur = p.get("currency", "")
    parts = []
    for e in p["lst"]:
        q, qt = e.get("q", 1), e.get("qt")
        if qt == "AA" and q == 1:
            parts.append(f"{e['price']}")
        else:
            parts.append(f"{e['price']} ({'≥' if qt == 'AA' else '×'}{q})")
    return f"{'; '.join(parts)} {cur}".strip()


def caption(fid, d):
    cap = d.get("caption", fid)
    unit = UNITS.get(d.get("units", ""), "")
    return f"{cap} ({unit})" if unit else cap


def rating(rec):
    ov = (rec.get("ratingsAverages") or {}).get("overall") or {}
    return ov.get("value", ""), ov.get("count", "")


def remarks_text(rec):
    parts = []
    if rec.get("remarks"):
        parts.append(rec["remarks"])
    for fid, txt in (rec.get("fieldsRemarks") or {}).items():
        parts.append(f"{fid}: {txt}")
    return " | ".join(parts)


def contributors_text(rec):
    out = []
    for c in rec.get("contributors") or []:
        out.append(c.get("name", c.get("id")) if isinstance(c, dict) else str(c))
    return "; ".join(out)


def spec_columns(records, type_id):
    """Field ids in the order SlackDB's own editor shows them, then any leftovers."""
    order = list(TYPES.get(type_id, {}).get("editorFields", []))
    present = {k for r in records for k in r}
    cols = [f for f in order if f in present and f not in META]
    cols += sorted(k for k in present - set(cols) - META if not k.startswith("_"))
    return cols


# ── gear ────────────────────────────────────────────────────────────────────


def main():
    api_gear = load("api/gear.json")
    mfr_api = {m["_id"]: m for m in load("api/manufacturers.json")}
    mfr_name = {i: unescape(m["name"]) for i, m in mfr_api.items()}
    gear_name = {g["_id"]: unescape(g["name"]) for g in api_gear}
    image_file = {im["_id"]: im["filename"] for im in load("api/images.json")}
    images_of = {}
    for im in load("api/images.json"):
        ids = im["gearId"] if isinstance(im["gearId"], list) else [im["gearId"]]
        for gid in ids:
            images_of.setdefault(gid, []).append(im["_id"])
    covers = load("gear_covers.json") if (RAW / "gear_covers.json").exists() else {}

    gear = []
    for g in api_gear:
        detail_file = RAW / "gear_details" / f"{g['_id']}.json"
        # The detail record adds reviews/comments but drops the list record's counts: keep both.
        rec = {**g, **load(f"gear_details/{g['_id']}.json")["gearDetail"]} if detail_file.exists() else g
        rec = unescape(rec)
        out = {}
        for k, v in rec.items():
            out[k] = v
            if k == "manufacturerId":
                out["_manufacturerName"] = mfr_name.get(v)
        out["_slackdbUrl"] = f"{SITE}/gear_details/{rec['slug']}"
        out["_imageIds"] = sorted(images_of.get(rec["_id"], []))
        cover = covers.get(str(rec["_id"]))
        out["_coverImageId"] = cover
        out["_coverFile"] = f"image_files/gear/{image_file[cover]}" if isinstance(cover, int) else None
        gear.append(out)
    gear.sort(key=lambda r: r["_id"])

    reviews, comments = [], []

    for type_id, fname in GEAR_FILES.items():
        recs = [r for r in gear if r["itemTypeId"] == type_id]
        save_json(f"gear/{fname}.json", recs)
        defs = field_defs(type_id)
        cols = spec_columns(recs, type_id)
        rows = []
        for r in recs:
            row = {"id": r["_id"], "name": r["name"], "manufacturer": r.get("_manufacturerName") or ""}
            for fid in cols:
                d = defs.get(fid, {})
                row[caption(fid, d)] = pricing_text(r.get(fid)) if fid == "pricing" else render(r.get(fid), d)
            avg, n = rating(r)
            row |= {
                "remarks": remarks_text(r),
                "rating (/10)": avg, "ratings": n,
                "reviews": r.get("reviewsCount", 0), "comments": r.get("commentsCount", 0),
                "images": r.get("imagesCount", 0),
                "image ids": "; ".join(map(str, r["_imageIds"])),
                "cover image": r["_coverFile"] or "",
                "contributors": contributors_text(r),
                "created": iso(r.get("creationDate")), "last edited": iso(r.get("lastEditDate")),
                "slackdb url": r["_slackdbUrl"],
            }
            rows.append(row)
        save_csv(f"gear/{fname}.csv", rows)

        for r in recs:
            subject = {"subjectType": "gear", "subjectId": r["_id"], "subjectName": r["name"],
                       "gearType": type_id, "manufacturer": r.get("_manufacturerName")}
            reviews += [{**subject, **rv} for rv in r.get("reviews") or []]
            comments += [{**subject, **c} for c in r.get("comments") or []]

    # ── manufacturers ───────────────────────────────────────────────────────
    mfrs = []
    for mid, m in sorted(mfr_api.items()):
        detail_file = RAW / "manufacturer_details" / f"{mid}.json"
        rec = m
        if detail_file.exists():
            # The detail record names contributors by id only; the list endpoint has names.
            rec = {**load(f"manufacturer_details/{mid}.json")["manufacturerDetail"],
                   "contributors": m.get("contributors"), "gearStats": m.get("gearStats"),
                   "ratingsAverages": m.get("ratingsAverages"),
                   "commentsCount": m.get("commentsCount"), "reviewsCount": m.get("reviewsCount"),
                   "imagesCount": m.get("imagesCount")}
        rec = unescape(rec)
        rec["_slackdbUrl"] = f"{SITE}/manufacturer_details/{rec['slug']}"
        rec["_logoFile"] = f"image_files/manufacturers/{rec['imageFilename']}" if rec.get("imageFilename") else None
        mfrs.append(rec)
        subject = {"subjectType": "manufacturer", "subjectId": mid, "subjectName": rec["name"],
                   "gearType": None, "manufacturer": rec["name"]}
        reviews += [{**subject, **rv} for rv in rec.get("reviews") or []]
        comments += [{**subject, **c} for c in rec.get("comments") or []]
    save_json("manufacturers.json", mfrs)

    defs = field_defs("MNF")
    rows = []
    for m in mfrs:
        loc = m.get("location") or {}
        avg, n = rating(m)
        fb = ((m.get("externalRating") or {}).get("fb")) or {}
        row = {
            "id": m["_id"], "name": m["name"], "country": country(loc.get("countryCode")),
            "address": loc.get("address", ""), "lat": loc.get("lat", ""), "lng": loc.get("lng", ""),
            "status": decode("MNFS", m["manufacturerStatus"]) if m.get("manufacturerStatus") else "",
        }
        for fid in ("yearEstablished", "isActive", "isSlacklineOriented", "url", "fbPage", "description"):
            row[caption(fid, defs.get(fid, {}))] = render(m.get(fid), defs.get(fid, {}))
        for s in m.get("gearStats") or []:
            row[f"{GEAR_FILES.get(s.get('itemTypeId'), s.get('itemTypeId'))} count"] = s.get("count")
        row |= {"rating (/10)": avg, "ratings": n, "reviews": m.get("reviewsCount", 0),
                "facebook rating (/5)": fb.get("value", ""), "facebook ratings": fb.get("count", ""),
                "logo": m["_logoFile"] or "",
                "contributors": contributors_text(m), "created": iso(m.get("creationDate")),
                "last edited": iso(m.get("lastEditDate")), "slackdb url": m["_slackdbUrl"]}
        rows.append(row)
    save_csv("manufacturers.csv", rows)

    # ── reviews & comments ──────────────────────────────────────────────────
    for rv in reviews:  # the site wrote the body as "txt" on some reviews, "text" on others
        if "txt" in rv and "text" not in rv:
            rv["text"] = rv.pop("txt")
    reviews.sort(key=lambda r: (r["subjectType"], r["subjectId"], r.get("creationDate", 0)))
    save_json("reviews.json", reviews)
    save_csv("reviews.csv", [{
        "subject": rv["subjectType"], "subject id": rv["subjectId"], "subject name": rv["subjectName"],
        "gear type": GEAR_FILES.get(rv["gearType"], "") if rv["gearType"] else "",
        "manufacturer": rv["manufacturer"] or "", "reviewer": rv.get("creatorName", ""),
        "date": iso(rv.get("creationDate"), date_only=True),
        "overall (/10)": (rv.get("rating") or {}).get("overall", ""),
        **{f"{decode('RTD', k)} (/10)": v for k, v in ((rv.get("rating") or {}).get("lst") or {}).items()},
        "pros": "; ".join(rv.get("pros") or []), "cons": "; ".join(rv.get("cons") or []),
        "text": rv.get("text", ""),
    } for rv in reviews])

    # ── images: metadata here, the photos themselves in image_files/gear/ ───
    images = []
    for im in load("api/images.json"):
        f = RAW / "images" / f"{im['_id']}.json"
        rec = unescape({**im, **(load(f"images/{im['_id']}.json") if f.exists() else {})})
        ids = rec.get("gearId")
        ids = ids if isinstance(ids, list) else [ids] if ids is not None else []
        rec["_gearNames"] = [gear_name.get(i) for i in ids]
        rec["_originalUrl"] = f"{SITE}/user_content/img/gear/{rec['filename']}"
        rec["_file"] = f"image_files/gear/{rec['filename']}"
        images.append(rec)
        for c in rec.get("comments") or []:
            comments.append({"subjectType": "image", "subjectId": rec["_id"],
                             "subjectName": rec.get("description") or rec["filename"],
                             "gearType": None, "manufacturer": None, **c})
    images.sort(key=lambda r: r["_id"])
    save_json("images.json", images)
    save_json("comments.json", comments)

    # ── communities, knowledge ──────────────────────────────────────────────
    communities = unescape(load("api/communities.json"))
    save_json("communities.json", communities)
    defs = field_defs("COM")
    save_csv("communities.csv", [{
        "id": c["_id"], "name": c["name"], "type": render(c.get("type"), defs["type"]),
        "size": render(c.get("comSize"), defs["comSize"]),
        "country": country((c.get("location") or {}).get("countryCode")),
        "address": (c.get("location") or {}).get("address", ""),
        "lat": (c.get("location") or {}).get("lat", ""), "lng": (c.get("location") or {}).get("lng", ""),
        "website": c.get("website", ""), "facebook group": c.get("fbGroup", ""),
        "facebook page": c.get("fbPage", ""), "description": c.get("description", ""),
        "added by": c.get("creatorName", ""), "created": iso(c.get("creationDate")),
    } for c in communities])

    sites = {s["_id"]: s for s in unescape(load("api/knowledge_sites.json"))}
    for s in sites.values():
        if s.get("manufacturerId") is not None:
            s["_manufacturerName"] = mfr_name.get(s["manufacturerId"])
    save_json("knowledge_sites.json", list(sites.values()))
    knowledge = unescape(load("api/knowledge.json"))
    for k in knowledge:
        if k.get("siteId") is not None:
            k["_siteName"] = sites.get(k["siteId"], {}).get("name")
        if k.get("gearId"):
            k["_gearNames"] = [gear_name.get(i) for i in k["gearId"]]
    save_json("knowledge.json", knowledge)
    defs = field_defs("KN")
    save_csv("knowledge.csv", [{
        "id": k["_id"], "title": k["name"], "url": k["url"], "site": k.get("_siteName") or "",
        "published": render(k.get("publishDate"), defs["publishDate"]),
        "category": render(k.get("categories"), defs["categories"]),
        "content type": render(k.get("contentTypes"), defs["contentTypes"]),
        "language": render(k.get("lang"), defs["lang"]),
        "gear mentioned": "; ".join(n or str(i) for i, n in zip(k.get("gearId") or [], k.get("_gearNames") or [])),
        "tags": "; ".join(k.get("tags") or []),
        "added by": contributors_text(k).split("; ")[0], "created": iso(k.get("creationDate")),
    } for k in knowledge])

    # ── site-level pages ────────────────────────────────────────────────────
    overview = unescape(load("pages/overviewData.json"))
    save_json("site_stats.json", {"itemsCount": overview["itemsCount"], "gearStats": overview["gearStats"]})
    save_json("activity_feed.json", overview["userActions"])
    save_json("edit_suggestions.json", unescape(load("api/edit_suggestions.json")))

    save_json("reference/dictionaries.json", DICTS)
    save_json("reference/item_types_def.json", TYPES)
    save_json("reference/countries.json", COUNTRIES)
    save_json("reference/currency_rates.json", load("pages/currencyRates.json"))
    if (RAW / "pages" / "reviewsProsCons.json").exists():
        save_json("reference/review_pros_cons.json", unescape(load("pages/reviewsProsCons.json")))

    print(f"gear {len(gear)} · manufacturers {len(mfrs)} · reviews {len(reviews)} · "
          f"comments {len(comments)} · images {len(images)} · communities {len(communities)} · "
          f"knowledge {len(knowledge)} · sites {len(sites)}")


if __name__ == "__main__":
    main()
