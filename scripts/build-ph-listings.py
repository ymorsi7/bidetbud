#!/usr/bin/env python3
"""Build unique Happy Bidet + San Bidet listings from OCR and prior JSON."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path("/Users/yusufmorsi/Documents/GitHub/bidetbeacon")
EXISTING = ROOT / "data/philippines-app-listings.json"
TEXTS = ROOT / ".tmp-ocr/texts.json"
OUT = EXISTING

NON_PH = re.compile(
    r"vietnam|ho chi minh|singapore|saudi arabia|romania|malcoci|"
    r"m[oö]schitz|континент|russia|betterloving|qu[eé]bec|"
    r"cambridge,\s*ma|museum of science|turkey|t[uü]rkiye|tesett[uü]r|"
    r"tesettiir|cesme sokak|r[uü]stem|"
    r"nederland|netherlands|almere|hong kong|disneyland|hyderabad|"
    r"germany|denzlingen|wittewerf",
    re.I,
)

NAME_FIXES = {
    "calte": "Caltex",
    "elandmarikina": "Xeland Marikina",
    "entromallmalolos": "Xentromall Malolos",
    "xentromallmalolos": "Xentromall Malolos",
}

CITY_FIXES = (
    (re.compile(r"parafiaque|paranaque", re.I), "Parañaque"),
    (re.compile(r"dasmarifias|dasmarinas", re.I), "Dasmariñas"),
    (re.compile(r"las pifias|las pinas", re.I), "Las Piñas"),
    (re.compile(r"metre m", re.I), "Metro M"),
)

HEADER = re.compile(
    r"^(locations|search locations|353 locations|no more locations|"
    r"list|map|settings|search this area|get directions)$",
    re.I,
)
DATE_LINE = re.compile(
    r"\b(january|february|march|april|may|june|july|august|september|"
    r"october|november|december|duly)\b.*\b20(2[4-9]|3[0-9])\b",
    re.I,
)
BIDET_LINE = re.compile(r"\b(?:no\s+)?bidet\b", re.I)
NO_BIDET = re.compile(r"\bno\s+bidet\b", re.I)
ADDR_PREFIX = re.compile(r"^[@®©9\*•·\-–—]\s*")


def name_key(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", (name or "").lower())
    return s


def is_non_ph(row: dict) -> bool:
    return bool(NON_PH.search(" ".join(str(row.get(k) or "") for k in ("name", "address", "city"))))


def clean_name(s: str) -> str:
    s = s.strip(" \t.*xX×·•|")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("Pifias", "Piñas").replace("Pinas", "Piñas")
    s = s.replace("Osmefia", "Osmeña").replace("Osmena", "Osmeña")
    s = s.replace("Dofia", "Doña").replace("Dojia", "Doña")
    fixed = NAME_FIXES.get(name_key(s))
    if fixed:
        return fixed
    return s.strip()


def clean_address(s: str) -> str:
    s = ADDR_PREFIX.sub("", s.strip())
    s = s.strip(" >?·•")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("Pifias", "Piñas").replace("Osmefia", "Osmeña")
    s = s.replace("Parafiaque", "Parañaque").replace("Dasmarifias", "Dasmariñas")
    s = s.replace("Oasmarifias", "Dasmariñas")
    s = re.sub(r"\.\.+$", "", s)
    for pat, repl in CITY_FIXES:
        s = pat.sub(repl, s)
    return s.strip(" ,")


def looks_junk(line: str) -> bool:
    t = line.strip()
    if not t or HEADER.match(t):
        return True
    if re.match(r"^[\W\d_]+$", t):
        return True
    letters = sum(c.isalpha() for c in t)
    if letters < 3:
        return True
    if letters / max(len(t), 1) < 0.35:
        return True
    if re.search(r"incorrect configuration|sdk|app store|testflight|bidetbud", t, re.I):
        return True
    return False


def is_addr_line(line: str) -> bool:
    t = line.strip()
    if ADDR_PREFIX.match(t) and not BIDET_LINE.search(t):
        return True
    if re.search(r"philippines|metro manila|avenue|highway|street|blvd", t, re.I):
        if not HEADER.match(t) and not BIDET_LINE.search(t):
            return True
    return False


def is_bidet_line(line: str) -> bool:
    t = line.strip()
    if not BIDET_LINE.search(t):
        return False
    if DATE_LINE.search(t) or re.search(r"20(2[4-9]|3[0-9])", t):
        return True
    # "Bidet" / "No bidet" pill alone
    return bool(re.match(r"^[@®©9\*•·\-\s]*(no\s+)?bidet\b", t, re.I))


def infer_city(address: str, name: str = "") -> str:
    blob = f"{address} {name}"
    m = re.search(
        r"\b(Manila|Quezon City|Makati|Pasig|Taguig|Pasay|Parañaque|Paranaque|"
        r"Mandaluyong|San Juan|Caloocan|Las Piñas|Las Pinas|Muntinlupa|"
        r"Marikina|Valenzuela|Malabon|Navotas|Pateros|Imus|Bacoor|Cavite|"
        r"Dasmariñas|Dasmarinas|Baguio|Cebu|Davao|Cagayan de Oro|Dagupan|"
        r"Vigan|Ilocos|Bohol|Isabela|Pangasinan|La Union|Nueva Vizcaya|"
        r"Antipolo|Tagaytay|Santa Rosa|San Fernando|Angeles|Pampanga|"
        r"Olongapo|Zambales|Batangas|Lipa|Lucena|Iloilo|Bacolod|Cagayan|"
        r"Alabang|Green Hills|Greenhills|Ortigas|BGC|Bonifacio|"
        r"Kawit|Malolos|San Mateo|Taytay|Cainta|Muntinlupa)\b",
        blob,
        re.I,
    )
    return m.group(1) if m else "Philippines"


def parse_san(text: str) -> list[dict]:
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]
    rows = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if looks_junk(line) or is_addr_line(line) or is_bidet_line(line) or DATE_LINE.search(line):
            i += 1
            continue
        name = clean_name(line)
        if not name or looks_junk(name) or len(name) < 3:
            i += 1
            continue
        i += 1
        address = ""
        bidet = None
        while i < len(lines) and bidet is None:
            cur = lines[i]
            if is_bidet_line(cur):
                bidet = not bool(NO_BIDET.search(cur))
                i += 1
                break
            if is_addr_line(cur) and not address:
                address = clean_address(cur)
                i += 1
                continue
            if not looks_junk(cur) and not is_addr_line(cur) and not DATE_LINE.search(cur):
                # next venue
                break
            i += 1
        if bidet is None:
            continue
        if is_non_ph({"name": name, "address": address}):
            continue
        rows.append(
            {
                "app": "San Bidet",
                "name": name,
                "address": address or "Philippines",
                "city": infer_city(address, name),
                "bidet": bidet,
            }
        )
    return rows


HAPPY_CARDS = [
    {
        "name": "San Pedro Country Farm Resto & Events Center",
        "address": "San Pedro, Cantilan, Surigao del Sur, Philippines",
        "city": "Cantilan",
        "note": "All restrooms",
        "discoveredBy": "Kim M.",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Ford Isabela",
        "address": "Isabela, Philippines",
        "city": "Isabela",
        "note": "Ground floor near lounge",
        "discoveredBy": "ninja",
        "bidet": True,
    },
    {
        "name": "Zion Oil",
        "address": "Jones, Isabela, Philippines",
        "city": "Jones",
        "note": "Jones, Isabela",
        "discoveredBy": "Big Daddy",
        "bidet": True,
    },
    {
        "name": "Chowking Urdaneta",
        "address": "Urdaneta, Pangasinan, Philippines",
        "city": "Urdaneta",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Shakey's Kisad Baguio",
        "address": "Kisad Road, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "note": "Men's comfort room",
        "discoveredBy": "daddy dude",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Arnes Bus Stop",
        "address": "Philippines",
        "city": "Philippines",
        "note": "Pay CR 5 pesos",
        "bidet": True,
        "type": "public",
    },
    {
        "name": "trueblends Tea + Coffee Dagupan",
        "address": "Dagupan City, Pangasinan, Philippines",
        "city": "Dagupan",
        "discoveredBy": "Daniella Domagas",
        "bidet": True,
        "latitude": "16.0433",
        "longitude": "120.3350",
    },
    {
        "name": "Philippine Science High School Ilocos Region Campus",
        "address": "San Ildefonso, Ilocos Sur, Philippines",
        "city": "San Ildefonso",
        "note": "1st floor, near computer laboratory, male CR",
        "discoveredBy": "Red",
        "bidet": True,
        "access": "limited",
        "accessNote": "Campus restroom — not a public walk-in CR.",
        "latitude": "17.5755",
        "longitude": "120.3878",
    },
    {
        "name": "Rioverde Floating Resto",
        "address": "Loay, Bohol, Philippines",
        "city": "Loay",
        "discoveredBy": "jmrecio1",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "McDonald's Matina Crossing",
        "address": "MacArthur Highway, Matina Crossing, Davao City, Philippines",
        "city": "Davao City",
        "discoveredBy": "Ian Dominic Bugayong",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "SM Department Store SM CDO Downtown Premier",
        "address": "SM CDO Downtown Premier, Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "note": "Ground floor; not all stalls have a bidet",
        "discoveredBy": "ged",
        "bidet": True,
    },
    {
        "name": "Shakey's Limketkai Gateway CDO",
        "address": "Limketkai Center, Lapasan, Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "note": "Resto comfort room",
        "bidet": True,
        "latitude": "8.4858",
        "longitude": "124.6510",
    },
    {
        "name": "Shakey's Metro Vigan",
        "address": "Vigan, Ilocos Sur, Philippines",
        "city": "Vigan",
        "note": "Free",
        "discoveredBy": "Kurt",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Good Shepherd Baguio",
        "address": "Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Darwin Cruz",
        "bidet": True,
    },
    {
        "name": "Montebello Villa Hotel Cebu City",
        "address": "Banilad, Talamban, Cebu City, Philippines",
        "city": "Cebu City",
        "note": "Ground floor",
        "bidet": True,
        "access": "limited",
        "accessNote": "Hotel restroom — guests only.",
        "latitude": "10.3516",
        "longitude": "123.9135",
    },
    {
        "name": "Kamayan sa Kainyugan",
        "address": "National Highway, Bayombong, Nueva Vizcaya, Philippines",
        "city": "Bayombong",
        "note": "Male CR",
        "discoveredBy": "ninja",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Petron Pugo",
        "address": "Pugo–Rosario Road, Poblacion East, Pugo, La Union, Philippines",
        "city": "Pugo",
        "discoveredBy": "Antonio",
        "bidet": True,
    },
    {
        "name": "Mineski Infinity Dagupan",
        "address": "Dagupan City, Pangasinan, Philippines",
        "city": "Dagupan",
        "discoveredBy": "Daniella Domagas",
        "bidet": True,
    },
    {
        "name": "The Outlook Grill and Steak",
        "address": "Gibraltar / Pucsusan, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Sir Jervie",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Jollibee Calasiao",
        "address": "Calasiao, Pangasinan, Philippines",
        "city": "Calasiao",
        "discoveredBy": "Yca Ramirez",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Arca's Yard",
        "address": "Gibraltar Road, Mines View, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Mochi and Pankeyko",
        "bidet": True,
        "latitude": "16.4258",
        "longitude": "120.6195",
    },
    {
        "name": "Osting by the Sea",
        "address": "Naga, Cebu, Philippines",
        "city": "Naga",
        "discoveredBy": "cyemoss",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Shell Gasoline Station Lanang",
        "address": "Lanang, Davao City, Philippines",
        "city": "Davao City",
        "discoveredBy": "Bugs",
        "bidet": True,
    },
    {
        "name": "Dugout Restaurant and Café",
        "address": "Matina Crossing, Davao City, Philippines",
        "city": "Davao City",
        "note": "Well-maintained",
        "discoveredBy": "Elban Nable",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Jollibee Green Meadows",
        "address": "Green Meadows, Davao City, Philippines",
        "city": "Davao City",
        "discoveredBy": "Ian Dominic Bugayong",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Jollibee Bajada",
        "address": "J.P. Laurel Avenue, Bajada, Barangay 18-B, Davao City, Philippines",
        "city": "Davao City",
        "note": "minsan naka close ang bidet. turn on niyo nalang yung switch",
        "discoveredBy": "Dave Dela Cruz",
        "bidet": True,
        "latitude": "7.084417",
        "longitude": "125.612243",
    },
    {
        "name": "Blugre Coffee",
        "address": "Limketkai Center, Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "bidet": True,
    },
    {
        "name": "Double Bubble Cafe",
        "address": "Limketkai Center, Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "bidet": True,
    },
    {
        "name": "Boodels Lutong Bahay",
        "address": "Barangay 18-B, Davao City, Philippines",
        "city": "Davao City",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Prince Bernhard Gym SLU Baguio",
        "address": "Saint Louis University, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Tristan Bautista",
        "bidet": True,
        "access": "limited",
        "accessNote": "Campus gym restroom — not a public walk-in CR.",
    },
    {
        "name": "Fortune Restaurant",
        "address": "General Luna / Kabayanihan, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "pirpu",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Jollibee Baguio",
        "address": "Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Jan Ysa Vegas",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "SM Department Store SM Baguio",
        "address": "Luneta Hill, Upper Session Road, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Daniella Domagas",
        "bidet": True,
        "latitude": "16.4096",
        "longitude": "120.5993",
    },
    {
        "name": "Figaro SM Baguio",
        "address": "SM City Baguio, Luneta Hill, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Daniella Domagas",
        "bidet": True,
    },
    {
        "name": "The Bada Restaurant Cebu",
        "address": "Cebu City, Philippines",
        "city": "Cebu City",
        "note": "2nd floor",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "House of Lechon",
        "address": "Tujong Street, Acacia Avenue, Cebu City, Philippines",
        "city": "Cebu City",
        "discoveredBy": "DMParis",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Grand Central Cagayan de Oro",
        "address": "Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "note": "GF, 2F, and 3F",
        "discoveredBy": "ged",
        "bidet": True,
    },
    {
        "name": "Cheeva Spa",
        "address": "Kasambagan, Cebu City, Philippines",
        "city": "Cebu City",
        "note": "Ground floor. Male and female. It's public",
        "discoveredBy": "basilicanoir",
        "bidet": True,
    },
    {
        "name": "Porta Vaga Mall Baguio",
        "address": "Session Road, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "discoveredBy": "Tristan Bautista",
        "bidet": True,
    },
    {
        "name": "Zark's Burgers SM CDO Downtown Premier",
        "address": "SM CDO Downtown Premier, Cagayan de Oro, Philippines",
        "city": "Cagayan de Oro",
        "note": "4th floor; inside a restaurant",
        "discoveredBy": "ged",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Iconique Mall",
        "address": "Pahina Central / Colon, Cebu City, Philippines",
        "city": "Cebu City",
        "note": "All floors",
        "bidet": True,
        "latitude": "10.2965",
        "longitude": "123.8980",
    },
    {
        "name": "albur's",
        "address": "Kasambagan, Cebu City, Philippines",
        "city": "Cebu City",
        "discoveredBy": "gilly",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Han Pork",
        "address": "Santa Cruz, Cebu City, Philippines",
        "city": "Cebu City",
        "note": "Ground floor",
        "discoveredBy": "Yee",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Mesa SM City Baguio",
        "address": "SM City Baguio, Luneta Hill, Baguio, Benguet, Philippines",
        "city": "Baguio",
        "bidet": True,
        "type": "restaurant",
    },
    {
        "name": "Landers Superstore Cebu",
        "address": "Kasambagan, Cebu City, Philippines",
        "city": "Cebu City",
        "discoveredBy": "James Michael",
        "bidet": True,
        "latitude": "10.3235",
        "longitude": "123.9128",
    },
]


def richness(row: dict) -> int:
    score = 0
    if row.get("address") and row["address"] not in ("Philippines", ""):
        score += min(len(row["address"]), 80)
    if row.get("note"):
        score += 40
    if row.get("discoveredBy"):
        score += 20
    if row.get("latitude"):
        score += 50
    if row.get("city") and row["city"] != "Philippines":
        score += 5
    if row.get("app") == "Happy Bidet" and row.get("discoveredBy"):
        score += 10
    return score


def merge_row(a: dict, b: dict) -> dict:
    keep, extra = (a, b) if richness(a) >= richness(b) else (b, a)
    out = dict(keep)
    if extra.get("app") and extra["app"] != out.get("app"):
        out["alsoApp"] = extra["app"]
    for k in ("note", "discoveredBy", "latitude", "longitude", "access", "accessNote", "type"):
        if not out.get(k) and extra.get(k):
            out[k] = extra[k]
    if (not out.get("address") or out["address"] == "Philippines") and extra.get("address"):
        out["address"] = extra["address"]
        out["city"] = extra.get("city") or out.get("city")
    return out


def listing_key(row: dict) -> tuple:
    nk = name_key(row.get("name") or "")
    ak = name_key(row.get("address") or "")[:18]
    city = name_key(row.get("city") or "")[:12]
    loc = ak or city
    return (nk, loc, bool(row.get("bidet")))


def too_vague(row: dict) -> bool:
    name = row.get("name") or ""
    address = row.get("address") or ""
    nk = name_key(name)
    if len(nk) < 5 and not re.search(r"philippines|avenue|street|highway", address, re.I):
        return True
    if re.fullmatch(r"[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}", name.replace(" ", ""), re.I):
        return True
    if re.match(r"^[A-Z0-9]{4,}\+[A-Z0-9]{2,}", name):
        return True
    return False


def add_unique(bucket: dict, row: dict) -> None:
    if is_non_ph(row) or too_vague(row):
        return
    nk = name_key(row.get("name") or "")
    if len(nk) < 5:
        return
    key = listing_key(row)
    # also collapse same name+city+flag when one address is empty/generic
    if key in bucket:
        bucket[key] = merge_row(bucket[key], row)
        return
    for existing_key, existing in list(bucket.items()):
        if existing_key[2] != key[2]:
            continue
        na, nb = existing_key[0], key[0]
        name_exact = na == nb
        name_overlap = (
            not name_exact
            and min(len(na), len(nb)) >= 8
            and (na in nb or nb in na)
        )
        if not (name_exact or name_overlap):
            continue
        eaddr = name_key(existing.get("address") or "")
        raddr = name_key(row.get("address") or "")
        ecity = name_key(existing.get("city") or "")
        rcity = name_key(row.get("city") or "")
        generic = {"", "philippines"}
        same_city = (
            ecity not in generic
            and rcity not in generic
            and (ecity == rcity or ecity[:8] in rcity or rcity[:8] in ecity)
        )
        addr_overlap = (
            eaddr not in generic
            and raddr not in generic
            and (eaddr[:12] in raddr or raddr[:12] in eaddr)
        )
        if not (same_city or addr_overlap):
            continue
        merged = merge_row(existing, row)
        del bucket[existing_key]
        bucket[listing_key(merged)] = merged
        return
    bucket[key] = dict(row)


def classify(text: str) -> str:
    t = text.lower()
    if "353 locations" in t or "search locations" in t or ("no bidet" in t and "locations" in t):
        return "san"
    if "get directions" in t or "discovered by" in t or "search this area" in t:
        return "happy"
    return "other"


def load_prior_listings() -> list:
    # Always start from the committed 78-row snapshot so rebuilds do not
    # ingest a previously over-merged output.
    raw = subprocess.check_output(
        ["git", "show", "HEAD:data/philippines-app-listings.json"],
        cwd=ROOT,
    )
    return json.loads(raw).get("listings") or []


def main() -> None:
    existing = load_prior_listings()
    texts = json.loads(TEXTS.read_text())

    bucket: dict = {}

    # Prior JSON: first 69 were San Bidet list rows mis-tagged Happy Bidet;
    # last 9 were Happy Bidet map cards mis-tagged San Bidet.
    for i, row in enumerate(existing):
        r = dict(row)
        if i < 69:
            r["app"] = "San Bidet"
        else:
            r["app"] = "Happy Bidet"
        add_unique(bucket, r)

    for card in HAPPY_CARDS:
        r = dict(card)
        r["app"] = "Happy Bidet"
        add_unique(bucket, r)

    san_ocr = 0
    for _name, text in texts.items():
        if classify(text) != "san":
            continue
        for row in parse_san(text):
            add_unique(bucket, row)
            san_ocr += 1

    # Second pass: collapse leftover OCR twins (same name key + same bidet flag).
    # Keep distinct cities (two Jollibees, two Petrons).
    collapsed: dict = {}
    for row in bucket.values():
        add_unique(collapsed, row)
    listings = list(collapsed.values())
    listings.sort(key=lambda r: ((r.get("app") or "").lower(), (r.get("name") or "").lower()))

    happy = sum(1 for r in listings if r.get("app") == "Happy Bidet")
    san = sum(1 for r in listings if r.get("app") == "San Bidet")
    both = sum(1 for r in listings if r.get("alsoApp"))
    yes = sum(1 for r in listings if r.get("bidet") is True)
    no = sum(1 for r in listings if r.get("bidet") is False)

    payload = {
        "_comment": (
            "Community listings from Happy Bidet (map cards) and San Bidet "
            "(353-location list). Non-PH rows skipped. Deduped on name+place+bidet flag."
        ),
        "listings": listings,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(
        json.dumps(
            {
                "wrote": str(OUT),
                "total": len(listings),
                "happy": happy,
                "san": san,
                "alsoApp": both,
                "bidet": yes,
                "noBidet": no,
                "sanOcrRowsSeen": san_ocr,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
