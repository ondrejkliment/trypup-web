#!/usr/bin/env python3
"""Nezávislý referenční výpočet analytiky adminu trypup.life/admin (zadání SPEC kap. G.1, G.3).

Spuštění (jen čte, nic nezapisuje, nic nestahuje):
    python3 -I scripts/admin-reference.py <demo.json> [--campaigns <ad_campaigns.json>] > ref.json

Vstup = výpis ve tvaru `window.__dash.setData()`:
    {RAW, INSTALLS, OVERRIDES, RC_EVENTS, STORE, RATINGS, RETENTION, meta:{dumpedAt}}
Výstup = JSON se stabilními klíči popsanými v `scripts/admin-keys.md`. Stejné klíče vrací
jádro adminu (`computeAcquisition`, `computeJourney`, `computeTech`); kontrola v Node je
porovná hodnotu po hodnotě (SPEC G.2).

Nezávislost: skript nesdílí kód s adminem. Klasifikace je vlastní přepis
`pawprint-mobile/functions/installClass.js`, retence vlastní přepis `computeRetention`
z `pawprint-mobile/functions/cohortRetention.js`. Katalog akcí (názvy, skupiny, sb, od,
stav, auto) je zapsaný níže podle SPEC D.1; když existuje `src/data/admin-labels.json`,
skript ho jen porovná se svým zápisem a rozdíly vypíše do `meta.catalogDiff`.

Výpis s daty zařízení se nikdy necommituje (SPEC G.1).
"""
import argparse
import datetime
import json
import math
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from zoneinfo import ZoneInfo

# ───────────────────────── konstanty (SPEC C.0 VERDICT_RULES) ─────────────────────────
DAY = 86_400_000
HOUR = 3_600_000
MIN = 60_000
SMALL_N = 10            # pod 10 jen „k z n“, verdikt Málo dat
SURE_N = 30             # test dvou podílů až od 30 v obou skupinách
Z95 = 1.96
TREND_PCT = 20          # Roste / Klesá: změna aspoň o 20 % …
TREND_MIN = 5           # … a aspoň o 5 zařízení
CAMPAIGN_MAX_EUR = 5.0  # Vyplatí se do 5 € za zařízení nad běžný stav
CAMPAIGN_TIGHT = (4.5, 5.5)
CAMPAIGN_MIN_DAYS = 3
BASELINE_DAYS = 14
BASELINE_MIN_DAYS = 4
MATURE_DAYS = 7
MEASURABLE_PCT = 90     # R8
MARKET = {'d1': 0.26, 'd7': 0.13, 'd30': 0.07}
WALK_MIN_SEC, WALK_MIN_M = 300, 150   # procházka psa na zkoušku se započítá (walkMeasure.ts, cisla-3)
CAMPAIGN_MAX_SPEND = 1e6               # útrata nad 1 000 000 € = neplatná (provoz-8)
ISO_DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')
DASH_RE = re.compile('[ \u00a0]+[-\u2013\u2014][ \u00a0]+')   # pomlčka mezi slovy v názvu útulku (cisla-12)
MODE_SINCE_DAY = '2026-10-23'          # B1: režim podle obrazovek (verze 291)
T2_SB = (335, 337, 338, 342, 344, 352)
AB_START_DAY = '2026-11-16'   # A5, verze 344
CHANNEL_SB = 352              # Z2 zdroj instalace
NAME_RE = re.compile(r'^[a-z][a-z0-9_]{0,59}$')
PRG = ZoneInfo('Europe/Prague')
EPOCH = datetime.date(1970, 1, 1)
NONE_KEY = '_none'            # chybějící / prázdná hodnota v rozpadu

# ───────────────────────── katalog akcí (SPEC D.1, zápis reference) ─────────────────────────
# Pořadí skupin = SPEC D.1 („groups“); `quality` a `experiments` přejmenované, `unknown` na konci.
GROUP_ORDER = ['start', 'onboarding', 'care', 'walk', 'training', 'learning', 'challenge', 'mission', 'owner',
               'reminders', 'social', 'money', 'account', 'feedback', 'quality', 'experiments', 'navigation', 'unknown']
# název → (skupina, sb z katalogu nebo ruční hodnota D.1, od ISO / None)
# Oprava (krok jádra, 19. 11.): 8 akcí bez verze v poli since dřív dostávalo sb z každého výpisu („první
# verze v datech“). Podle D.1 se to počítá jednou při tvorbě katalogu a dál platí admin-labels.json, takže
# jsou tu zmrazené hodnoty z výpisu 19. 11. (stejné jako v katalogu adminu): 285, 285, 287, 285, 268, 284, 268, 290.
CATALOG = {
    'app_open': ('start', 40, '2026-06-02'),
    'install_source': ('start', 352, '2026-11-18'),
    'session_end': ('start', 214, '2026-06-28'),
    'widget_offer': ('start', 285, '2026-10-06'),
    'language_offer': ('start', 252, '2026-08-21'),
    'onboarding_step': ('onboarding', 40, '2026-06-02'),
    'readiness_completed': ('onboarding', 214, '2026-06-28'),
    'quiz_completed': ('onboarding', 40, '2026-06-02'),
    'breed_selected': ('onboarding', 40, '2026-06-02'),
    'activated': ('onboarding', 40, '2026-06-02'),
    'tutorial_done': ('onboarding', 285, '2026-10-06'),
    'task_done': ('care', 214, '2026-06-28'),
    'event_choice': ('care', 214, '2026-06-28'),
    'trip_sitter': ('care', 287, '2026-10-11'),
    'day_advanced': ('care', 40, '2026-06-02'),
    'level_up': ('care', 285, '2026-10-06'),
    'vet_visit_done': ('care', 221, '2026-07-05'),
    'fail_state': ('care', 40, '2026-06-02'),
    'fail_state_choice': ('care', 268, '2026-09-25'),
    'home_banner': ('care', 284, '2026-10-06'),
    'walk_started': ('walk', 40, '2026-06-02'),
    'walk_completed': ('walk', 40, '2026-06-02'),
    'walk_manual_logged': ('walk', 268, '2026-09-25'),
    'gps_denied': ('walk', 40, '2026-06-02'),
    'training_done': ('training', 214, '2026-06-28'),
    'onboarding_premium_offer': ('money', 214, '2026-06-28'),
    'store_rating_blocked': ('feedback', 290, '2026-10-06'),
    'app_error': ('quality', 0, None),
    'experiment_assigned': ('experiments', 344, '2026-11-16'),
    'mode_switched': ('owner', 292, '2026-10-23'),
    'owner_setup_exit': ('owner', 319, '2026-11-06'),
    'owner_dog_choice': ('owner', 318, '2026-11-04'),
    'owner_activated': ('owner', 320, '2026-11-06'),
    'map_opened': ('owner', 292, '2026-10-23'),
    'calendar_event_opened': ('owner', 292, '2026-10-23'),
    'training_logged': ('training', 312, '2026-10-31'),
    'training_stage_confirmed': ('training', 312, '2026-10-31'),
    'training_help_opened': ('training', 312, '2026-10-31'),
    'dog_photo': ('owner', 301, '2026-10-28'),
    'dog_document': ('owner', 304, '2026-10-28'),
    'plan_item': ('owner', 337, '2026-11-15'),
    'diary_entry': ('owner', 337, '2026-11-15'),
    'weight_entry': ('owner', 337, '2026-11-15'),
    'setup_checklist': ('owner', 337, '2026-11-15'),
    'family': ('owner', 345, '2026-11-16'),
    'real_reminder_opened': ('reminders', 337, '2026-11-15'),
    'article_opened': ('learning', 284, '2026-10-06'),
    'article_read': ('learning', 40, '2026-06-02'),
    'myth_answered': ('learning', 284, '2026-10-06'),
    'review_answered': ('learning', 284, '2026-10-06'),
    'lesson_answered': ('learning', 282, '2026-10-05'),
    'challenge_exam_started': ('challenge', 284, '2026-10-06'),
    'challenge_started': ('challenge', 222, '2026-07-09'),
    'challenge_completed': ('challenge', 222, '2026-07-09'),
    'challenge_decision': ('challenge', 287, '2026-10-11'),
    'challenge_result_cta': ('challenge', 289, '2026-10-11'),
    'shelter_opened': ('mission', 40, '2026-06-02'),
    'graduation_reached': ('mission', 40, '2026-06-02'),
    'graduation_shelter_cta': ('mission', 40, '2026-06-02'),
    'graduation_wait_cta': ('mission', 219, '2026-07-04'),
    'achievement_unlocked': ('care', 284, '2026-10-06'),
    'share_initiated': ('social', 216, '2026-07-02'),
    'share_completed': ('social', 284, '2026-10-07'),
    'coop_invite_created': ('social', 284, '2026-10-07'),
    'coop_joined': ('social', 284, '2026-10-07'),
    'paywall_viewed': ('money', 40, '2026-06-02'),
    'purchase_started': ('money', 40, '2026-06-02'),
    'purchase_completed': ('money', 40, '2026-06-02'),
    'purchase_cancelled': ('money', 282, '2026-10-05'),
    'purchase_pending': ('money', 282, '2026-10-05'),
    'purchase_failed': ('money', 40, '2026-06-02'),
    'restore_started': ('money', 343, '2026-11-16'),
    'restore_completed': ('money', 343, '2026-11-16'),
    'restore_none': ('money', 343, '2026-11-16'),
    'restore_failed': ('money', 343, '2026-11-16'),
    'subscription_manage_opened': ('money', 343, '2026-11-16'),
    'purchases_link': ('money', 344, '2026-11-16'),
    'account_signup': ('account', 40, '2026-06-02'),
    'account_signin': ('account', 40, '2026-06-02'),
    'cloud_backup': ('account', 40, '2026-06-02'),
    'account_deleted': ('account', 40, '2026-06-02'),
    'restore_key_created': ('account', 321, '2026-11-04'),
    'restore_key_result': ('account', 321, '2026-11-04'),
    'store_rating_prompt': ('feedback', 274, '2026-10-01'),
    'store_rating_link': ('feedback', 274, '2026-10-01'),
    'support_contact': ('feedback', 285, '2026-10-07'),
    'push_opened': ('start', 280, '2026-10-04'),
    'app_entry': ('start', 342, '2026-11-16'),
    'care_reminder_prompt': ('reminders', 288, '2026-10-13'),
    'notification_permission': ('reminders', 288, '2026-10-13'),
    'care_reminder_opened': ('reminders', 335, '2026-11-14'),
    'care_reminder_done': ('reminders', 335, '2026-11-14'),
    'screen_view': ('navigation', 214, '2026-06-28'),  # režim a trasy pesdoma/* až od 291 / 23. 10. (vlastnost)
}
AUTO = {'app_open', 'app_entry', 'session_end', 'screen_view', 'install_source', 'day_advanced', 'level_up',
        'achievement_unlocked', 'restore_key_result', 'store_rating_blocked', 'experiment_assigned'}
STATUS = {'app_error': 'removed', 'account_signup': 'removed', 'family': 'testers'}

# Měřitelnost (R8) akcí v řádcích Cesty – `sb` podle SPEC D.1 / B3.
SB = {
    'plan_item': 337, 'calendar_event_opened': 292, 'diary_weight': 337, 'dog_document': 304,
    'training_session': 312, 'walk_owner': 338, 'app_entry': 342, 'care_reminder': 335, 'notification_permission': 288,
}

# ───────────────────────── pomocné funkce ─────────────────────────


def num(v):
    """Číslo jako JS `typeof v === 'number' && Number.isFinite(v)` (bool, řetězec, null = není číslo)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return v if math.isfinite(v) else None


def js_round(x):
    """Math.round (polovina nahoru)."""
    return math.floor(x + 0.5)


def dec(x, places):
    """Math.round(x * 10^places) / 10^places – jediné zaokrouhlení desetinných čísel ve výstupu."""
    f = 10 ** places
    r = js_round(x * f) / f
    return int(r) if float(r).is_integer() else r


def key_of(v):
    """Klíč rozpadu z hodnoty dat (JS String()); chybějící / null / '' = NONE_KEY."""
    if v is None or v == '':
        return NONE_KEY
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return v
    # Objekt nebo pole (jen podvržené zápisy): kompaktní JSON se seřazenými klíči jako v jádru adminu
    # (oprava v kroku jádra: dřív s mezerami za ':' a ',', jádro by ho nikdy netrefilo).
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def breakdown(counter):
    """Rozpad = [[klíč, počet], …] sestupně podle počtu, pak vzestupně podle klíče."""
    return [[k, n] for k, n in sorted(counter.items(), key=lambda x: (-x[1], x[0])) if n > 0]


def short_id(i):
    """Zkrácený kód zařízení: znaky 6–10 a poslední čtyři (prvních 10 znaků je časová předpona, texty-7)."""
    s = str(i)
    return s[5:10] + '…' + s[-4:] if len(s) > 12 else s


def frac(k, n):
    return {'k': int(k), 'n': int(n)}


_PDAY = {}


def pday(ms):
    """Pražský kalendářní den jako počet dní od 1970-01-01 (jako `pragueDay` serveru)."""
    h = ms // HOUR
    d = _PDAY.get(h)
    if d is None:
        d = (datetime.datetime.fromtimestamp(h * 3600, PRG).date() - EPOCH).days
        _PDAY[h] = d
    return d


def iso(day):
    return (EPOCH + datetime.timedelta(days=day)).isoformat()


def day_of_iso(s):
    return (datetime.date.fromisoformat(s) - EPOCH).days


def prague_midnight_ms(day):
    d = EPOCH + datetime.timedelta(days=day)
    return int(datetime.datetime(d.year, d.month, d.day, tzinfo=PRG).timestamp() * 1000)


def wilson(k, n, z=Z95):
    if n <= 0:
        return None
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


def two_prop_z(k1, n1, k2, n2):
    if n1 <= 0 or n2 <= 0:
        return 0.0
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0
    return (k1 / n1 - k2 / n2) / se


def compare(a, b):
    """R7: srovnání dvou podílů {k,n} → verdikt + z (zaokrouhlené na 3 místa)."""
    z = two_prop_z(a['k'], a['n'], b['k'], b['n'])
    if min(a['n'], b['n']) < SMALL_N:
        v = 'Málo dat'
    elif a['n'] >= SURE_N and b['n'] >= SURE_N and abs(z) >= Z95:
        v = 'Průkazný rozdíl'
    else:
        v = 'Zatím neprůkazné'
    return {'verdict': v, 'z': dec(z, 3)}


def pct_range(k, n):
    w = wilson(k, n)
    return None if w is None else [js_round(100 * w[0]), js_round(100 * w[1])]


# ───────────────────────── načtení výpisu ─────────────────────────
ap = argparse.ArgumentParser()
ap.add_argument('dump')
ap.add_argument('--campaigns', default=None)
args = ap.parse_args()


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


DUMP = load_json(args.dump)
_now_dt = datetime.datetime.fromisoformat(DUMP['meta']['dumpedAt'].replace('Z', '+00:00'))
_delta = _now_dt - datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
NOW = _delta.days * DAY + _delta.seconds * 1000 + _delta.microseconds // 1000   # jako Date.parse (ms, bez zaokrouhlení)
TODAY = pday(NOW)
INSTALLS = [x for x in (DUMP.get('INSTALLS') or []) if isinstance(x, dict) and isinstance(x.get('id'), str)]
OVERRIDES = {k: v for k, v in (DUMP.get('OVERRIDES') or {}).items() if v is not None}
RC_EVENTS = [x for x in (DUMP.get('RC_EVENTS') or []) if isinstance(x, dict) and x.get('type')]
STORE = [x for x in (DUMP.get('STORE') or []) if isinstance(x, dict) and x.get('date') and x.get('platform') in ('ios', 'android')]
RETENTION = DUMP.get('RETENTION') if isinstance(DUMP.get('RETENTION'), dict) else None
CAMPAIGNS_DOC = None
if args.campaigns:
    CAMPAIGNS_DOC = load_json(args.campaigns)
elif isinstance(DUMP.get('AD_CAMPAIGNS'), dict):
    CAMPAIGNS_DOC = DUMP['AD_CAMPAIGNS']

# ───────────────────────── klasifikace (přepis installClass.js) ─────────────────────────
TESTER_KINDS = {'simulator', 'development', 'ad_hoc', 'enterprise', 'expo_go'}
ROBOT_KINDS = {'emulator', 'test_lab'}


def js_str(v):
    """String(v || '')"""
    if v in (None, '', 0, False):
        return ''
    return v if isinstance(v, str) else key_of(v)


def classify(d, o):
    if isinstance(o, dict):
        k = o.get('kind')
        return 'robot' if k == 'robot' else 'real' if k == 'real' else 'tester'
    a, b = num(d.get('firstMs')), num(d.get('lastMs'))
    span = max(0, js_round((b - a) / MIN)) if a is not None and b is not None else None
    model, kind, osv = js_str(d.get('model')), js_str(d.get('installKind')), js_str(d.get('osVersion'))
    if kind in ROBOT_KINDS or re.match(r'^sdk_gphone', model, re.I):
        return 'robot'
    if model == 'OnePlus8Pro' and (re.match(r'^11(\.|$)', osv) or re.search(r'android\s*11\b', osv, re.I)) and span is not None and span < 60:
        return 'robot'
    if kind in TESTER_KINDS or re.search(r'simulator', model, re.I):
        return 'tester'
    # Kontrolní zařízení Applu při schvalování verze (iPhone99,x / iPad99,x se neprodávají; rozhodnutí 20. 11., cisla-9).
    if model.startswith(('iPhone99,', 'iPad99,')):
        return 'tester'
    return 'real'


CLS = {x['id']: classify(x, OVERRIDES.get(x['id'])) for x in INSTALLS}
LEDGER = {x['id']: x for x in INSTALLS}
REAL = {x['id']: x for x in INSTALLS if x.get('platform') in ('ios', 'android') and CLS[x['id']] == 'real'}

# ───────────────────────── deduplikace (R3) a index ─────────────────────────
seen = set()
DEDUP = []          # všechny záznamy po deduplikaci (pořadí výpisu)
dups_all = 0
raw_real_30 = 0     # záznamy skutečných zařízení za 30 dní před deduplikací
dups_real_all = 0   # z toho zdvojené
dups_all_30 = 0     # zdvojené ze všech zařízení v 30denním okně (T6 se zaškrtávátkem testerů)
W30_FROM, W7_FROM = NOW - 30 * DAY, NOW - 7 * DAY
for e in DUMP.get('RAW') or []:
    if not isinstance(e, dict):
        continue
    props = e.get('props') if isinstance(e.get('props'), dict) else {}
    ts = num(e.get('ts'))
    iid = e.get('installId') if isinstance(e.get('installId'), str) else None
    name = e.get('name') if isinstance(e.get('name'), str) else None   # jiný typ = neplatný záznam
    if iid in REAL and ts is not None and W30_FROM < ts <= NOW:
        raw_real_30 += 1
    # Klíč z už převedeného času (bezpecnost2-4): produkce deduplikuje událost po převodu, neplatný čas = null.
    k = (json.dumps(e.get('installId'), sort_keys=True), json.dumps(e.get('name'), sort_keys=True),
         json.dumps(int(ts) if isinstance(ts, float) and ts.is_integer() else ts), json.dumps(props, sort_keys=True))
    if k in seen:
        dups_all += 1
        dups_real_all += iid in REAL
        if ts is not None and W30_FROM < ts <= NOW:
            dups_all_30 += 1
        continue
    seen.add(k)
    DEDUP.append({'name': name, 'props': props, 'ts': ts, 'installId': iid,
                  'dev': e.get('dev') if isinstance(e.get('dev'), dict) else {}})
RAW_N = sum(1 for _ in DUMP.get('RAW') or [])

EV = defaultdict(list)   # skutečná zařízení: události seřazené podle času (stabilně)
for e in DEDUP:
    if e['installId'] in REAL and e['ts'] is not None:
        EV[e['installId']].append(e)
for v in EV.values():
    v.sort(key=lambda e: e['ts'])
for i in REAL:
    EV.setdefault(i, [])

_WIN = {}


def win(i, days):
    """Události zařízení v intervalu (teď − days × 24 h, teď]."""
    key = (i, days)
    r = _WIN.get(key)
    if r is None:
        lo = NOW - days * DAY
        r = [e for e in EV[i] if lo < e['ts'] <= NOW]
        _WIN[key] = r
    return r


def build_of(e):
    return num(e['dev'].get('appBuild'))


def maxbuild(evs):
    m = 0
    for e in evs:
        b = build_of(e)
        if b is not None and b > m:
            m = b
    return m


_DAYS = {}


def all_days(i):
    r = _DAYS.get(i)
    if r is None:
        r = {pday(e['ts']) for e in EV[i]}
        _DAYS[i] = r
    return r


def P(e):
    return e['props']


def sc(e):
    return js_str(P(e).get('screen')) if e['name'] == 'screen_view' else ''


def has(i, pred, evs=None):
    return any(pred(e) for e in (EV[i] if evs is None else evs))


def first_ms(i):
    return num(REAL[i].get('firstMs'))


def last_ms(i):
    return num(REAL[i].get('lastMs'))


def in_win(ms, days, end_days=0):
    return ms is not None and NOW - days * DAY < ms <= NOW - end_days * DAY


def new_ids(days, end_days=0):
    return sorted(i for i in REAL if in_win(first_ms(i), days, end_days))


def active_ids(days):
    return sorted(i for i in REAL if in_win(last_ms(i), days))


def plat_split(ids):
    c = Counter(REAL[i]['platform'] for i in ids)
    return {'all': len(ids), 'ios': c.get('ios', 0), 'android': c.get('android', 0)}


def feature(base, pred, days=30):
    """Použili (zařízení se shodou v období) a R6: zralí (první shoda aspoň před 7 × 24 h) s aspoň 2 dny."""
    used, mature, rep = set(), set(), set()
    for i in base:
        hits = [e for e in win(i, days) if pred(e)]
        if not hits:
            continue
        used.add(i)
        if hits[0]['ts'] <= NOW - MATURE_DAYS * DAY:
            mature.add(i)
            if len({pday(e['ts']) for e in hits}) >= 2:
                rep.add(i)
    return used, mature, rep


def measurable(base, sb, evs_of):
    """R8: vrátí (základ pro podíl | None = neměříme, x, y)."""
    y = len(base)
    xs = {i for i in base if maxbuild(evs_of(i)) >= sb}
    x = len(xs)
    if x * 100 >= MEASURABLE_PCT * y:
        return set(base), x, y
    if x * 10 < y or x < SMALL_N:
        return None, x, y
    return xs, x, y


def r8_frac(base, sb, pred, evs_of):
    """Zlomek s R8: {k,n,x,y} nebo {state:'unmeasured',x,y}."""
    b, x, y = measurable(base, sb, evs_of)
    if b is None:
        return {'state': 'unmeasured', 'x': x, 'y': y}
    k = sum(1 for i in b if any(pred(e) for e in evs_of(i)))
    return {'k': k, 'n': len(b), 'x': x, 'y': y}


def when_clear(base, entered7, target=SURE_N, since=None, lag=0):
    """„Kdy bude jasno“: tempo = přibylo do základu za 7 dní / 7; dny = ⌈(cíl − základ) / tempo⌉.
    Měření mladší než 7 dní + zralost (since = den začátku, lag = dny do zralosti) → {'state': 'young'}."""
    if base >= target:
        return None
    if since is not None and TODAY - since < MATURE_DAYS + lag:
        return {'state': 'young', 'since': iso(since)}
    if entered7 <= 0:
        return {'state': 'unknown'}
    days = -(-(target - base) * 7 // entered7)
    d = EPOCH + datetime.timedelta(days=TODAY + days)
    part = 'start' if d.day <= 10 else 'mid' if d.day <= 20 else 'end'
    return {'days': days, 'date': d.isoformat(), 'part': part}


def later_clear(items):
    """Ze dvou a více „kdy bude jasno“ ta pozdější (mladé měření, pak neznámá vyhrávají)."""
    items = [x for x in items if x is not None]
    if not items:
        return None
    for x in items:
        if x.get('state') == 'young':
            return x
    if any(x.get('state') == 'unknown' for x in items):
        return {'state': 'unknown'}
    return max(items, key=lambda x: x['days'])


# ───────────────────────── retence (přepis computeRetention) ─────────────────────────
RET_DAYS = (1, 7, 30)
RET_WEEKS = (('w1', 7, 13), ('w4', 28, 34))
RET_SEGMENTS = ('all', 'challenge', 'trial', 'owner', 'notActivated')
_ACT = {}


def activity(i):
    """Dny aktivity a příznaky režimu ze všech událostí zařízení (jako server)."""
    a = _ACT.get(i)
    if a is None:
        a = {'days': all_days(i), 'owner': False, 'challenge': False, 'trial': False}
        for e in EV[i]:
            if e['name'] == 'owner_activated' or (e['name'] == 'mode_switched' and P(e).get('to') == 'owner'):
                a['owner'] = True
            elif e['name'] == 'challenge_started':
                a['challenge'] = True
            elif e['name'] == 'activated':
                a['trial'] = True
        if not EV[i]:
            a = None
        _ACT[i] = a
    return a


def segment_of(a):
    if not a:
        return 'notActivated'
    if a['owner']:
        return 'owner'
    if a['challenge']:
        return 'challenge'
    if a['trial']:
        return 'trial'
    return 'notActivated'


def compute_retention(ids):
    def empty():
        s = {'installs': 0}
        for d in RET_DAYS:
            s[f'd{d}'] = frac(0, 0)
        for w, _, _ in RET_WEEKS:
            s[w] = frac(0, 0)
        return s
    segs = {s: empty() for s in RET_SEGMENTS}
    for i in ids:
        f = first_ms(i)
        if f is None:
            continue
        a = activity(i)
        first = pday(f)
        for seg in ('all', segment_of(a)):
            s = segs[seg]
            s['installs'] += 1
            for d in RET_DAYS:
                if TODAY - first <= d:
                    continue
                s[f'd{d}']['n'] += 1
                if a and (first + d) in a['days']:
                    s[f'd{d}']['k'] += 1
            for w, lo, hi in RET_WEEKS:
                if TODAY - first <= hi:
                    continue
                s[w]['n'] += 1
                if a and any((first + x) in a['days'] for x in range(lo, hi + 1)):
                    s[w]['k'] += 1
    return segs


def d1_of(ids):
    return compute_retention(ids)['all']['d1']


def d1_entered7(ids):
    """Zařízení, která do základu D1 přibyla za posledních 7 dní (den first + 2 ∈ [dnes − 6, dnes])."""
    n = 0
    for i in ids:
        f = first_ms(i)
        if f is not None and TODAY - 6 <= pday(f) + 2 <= TODAY:
            n += 1
    return n


# ───────────────────────── signály (SPEC A1, B1) ─────────────────────────
OWNER_EV = {'owner_activated', 'owner_setup_exit', 'plan_item', 'diary_entry', 'weight_entry', 'setup_checklist',
            'real_reminder_opened', 'training_logged', 'training_stage_confirmed', 'training_help_opened', 'map_opened',
            'calendar_event_opened', 'dog_photo', 'dog_document', 'family'}
TRIAL_EV = {'activated', 'task_done', 'day_advanced', 'training_done', 'event_choice', 'trip_sitter', 'vet_visit_done',
            'challenge_started', 'fail_state'}
TRIAL_SCR = {'feed', 'play', 'brush', 'training', 'walk', 'walk-summary', 'health', '(main)/health', 'achievements',
             'breeddex', 'breed-select', 'timeline', 'challenge-result', 'graduation', 'fail-state'}


def owner_sig(e):
    n = e['name']
    if n == 'screen_view':
        return P(e).get('mode') == 'owner' or sc(e).startswith('pesdoma/')
    if n in OWNER_EV:
        return True
    return n in ('walk_started', 'walk_completed') and P(e).get('mode') == 'owner'


def trial_sig(e):
    n = e['name']
    if n in TRIAL_EV:
        return True
    if n == 'screen_view':
        s = sc(e)
        return s in TRIAL_SCR or (s == '(main)/home' and P(e).get('mode') != 'owner')
    return False


def dog_screen(e):
    return sc(e).startswith('pesdoma/dog/')


def owner_saved(i):
    return has(i, lambda e: e['name'] == 'owner_activated' or dog_screen(e))


def activated(i):
    return has(i, lambda e: e['name'] == 'activated')


def reached(step):
    return lambda e: e['name'] == 'onboarding_step' and P(e).get('step') == step and P(e).get('dir') != 'back'


def last_choice(i):
    c = None
    for e in EV[i]:
        if e['name'] == 'onboarding_step' and P(e).get('choice'):
            c = P(e).get('choice')
    return c


# ═════════════════════════ ZÍSKÁVÁNÍ (C.1) ═════════════════════════
out = {'meta': {}, 'acq': {}, 'jr': {}, 'tech': {}}
acq = out['acq']
AV, AW = {}, {}   # verdikty a „kdy bude jasno“ karet Získávání (z1–z6)
JV, JW = {}, {}   # totéž pro Cestu (a1–a5, b1–b6)
N1, N7, NP7, N30 = new_ids(1), new_ids(7), new_ids(14, 7), new_ids(30)
A30, A7 = active_ids(30), active_ids(7)
acq['new'] = {'h24': plat_split(N1), 'd7': plat_split(N7), 'prev7': plat_split(NP7), 'd30': plat_split(N30)}
diff = len(N7) - len(NP7)
if abs(diff) >= TREND_MIN and abs(diff) * 100 >= TREND_PCT * len(NP7):
    acq['trend'] = 'Roste' if diff > 0 else 'Klesá'
else:
    acq['trend'] = 'Drží'
AV['z1'] = acq['trend']

# --- kampaně (Z3), potřebné i pro Z1 (podbarvení dnů) a Z4 ---
CAMP, UPCOMING = [], []


def iso_day(v):
    """Den 'YYYY-MM-DD' → číslo dne, jinak None (jen řetězec přesně ve tvaru ISO dne)."""
    if not isinstance(v, str) or not ISO_DAY.match(v):
        return None
    try:
        return day_of_iso(v)
    except ValueError:
        return None


def str_or_none(v):
    return v if isinstance(v, str) else None


if isinstance(CAMPAIGNS_DOC, dict) and isinstance(CAMPAIGNS_DOC.get('campaigns'), list):
    for c in CAMPAIGNS_DOC['campaigns']:
        if not isinstance(c, dict) or c.get('platform') not in ('ios', 'android'):
            continue
        fr = iso_day(c.get('from'))
        if fr is None:
            continue
        to = c.get('to')
        to_d = None
        if to is not None and to != '':
            to_d = iso_day(to)
            if to_d is None:
                continue   # neplatné datum konce = neplatný řádek (provoz-8)
        cid = c.get('id')
        sp = num(c.get('spendEur'))
        x = {'raw': c, 'id': cid if isinstance(cid, str) else key_of(cid) if num(cid) is not None else None,
             'platform': c['platform'], 'from': fr, 'to': to_d,
             'name': str_or_none(c.get('name')), 'network': str_or_none(c.get('network')),
             'spendEur': sp if sp is not None and 0 <= sp <= CAMPAIGN_MAX_SPEND else None,
             'spendAt': c.get('spendAt') if iso_day(c.get('spendAt')) is not None else None}
        (UPCOMING if fr > TODAY else CAMP).append(x)


def camp_running(platform, day):
    return any(c['platform'] == platform and c['from'] <= day and (c['to'] is None or day <= c['to']) for c in CAMP)


# --- Z1 po dnech ---
new_by_day = defaultdict(Counter)
for i in REAL:
    f = first_ms(i)
    if f is not None:
        new_by_day[pday(f)][REAL[i]['platform']] += 1
store_last = {}
for p in ('ios', 'android'):
    ds = sorted(x['date'] for x in STORE if x['platform'] == p)
    store_last[p] = ds[-1] if ds else None
store_by = defaultdict(int)
for x in STORE:
    v = num(x.get('firstTime')) if x['platform'] == 'ios' else num(x.get('installs'))
    store_by[(x['platform'], x['date'])] += int(v or 0)
by_day = []
for d in range(TODAY - 29, TODAY + 1):
    c = new_by_day.get(d, Counter())
    ds = iso(d)
    st = {}
    for p in ('ios', 'android'):
        st[p] = store_by.get((p, ds), 0) if store_last[p] is not None and ds <= store_last[p] else None
    by_day.append({'day': ds, 'all': c['ios'] + c['android'], 'ios': c['ios'], 'android': c['android'],
                   'store': st, 'partial': d == TODAY,
                   'campaign': [p for p in ('android', 'ios') if camp_running(p, d)]})
acq['byDay'] = by_day
acq['store'] = {'lastDay': store_last}

# --- Z2 kanály ---
AND30 = [i for i in N30 if REAL[i]['platform'] == 'android']
IOS30 = [i for i in N30 if REAL[i]['platform'] == 'ios']
meas = [i for i in AND30 if REAL[i].get('srcChannel') or maxbuild(win(i, 30)) >= CHANNEL_SB]
ch_count = Counter(key_of(REAL[i].get('srcChannel')) for i in meas)
acq['channel'] = {'measured': len(meas), 'of': len(AND30), 'byChannel': breakdown(ch_count),
                  'unmeasured': len(AND30) - len(meas), 'ios': len(IOS30)}
AV['z2'] = 'Zjištění' if len(meas) >= SMALL_N else 'Málo dat'
SRC_SINCE = day_of_iso(CATALOG['install_source'][2])
AW['z2'] = when_clear(len(meas), sum(1 for i in meas if in_win(first_ms(i), 7)), target=SMALL_N, since=SRC_SINCE, lag=0) if len(meas) < SMALL_N else None


def first_build(i):
    """Verze první události zařízení (0 bez čísla) – zdroj změřený od prvního spuštění (cisla-2)."""
    return (num(EV[i][0]['dev'].get('appBuild')) or 0) if EV[i] else 0


MEAS4 = [i for i in meas if first_build(i) >= CHANNEL_SB]
LATE = [i for i in meas if first_build(i) < CHANNEL_SB]
ch4 = Counter(key_of(REAL[i].get('srcChannel')) for i in MEAS4)

# --- Z4 kvalita ---


def has_dog(i):
    return has(i, lambda e: e['name'] in ('activated', 'owner_activated') or dog_screen(e))


def quality(ids):
    n = len(ids)
    a10 = sum(1 for i in ids if last_ms(i) is not None and first_ms(i) is not None and last_ms(i) - first_ms(i) >= 10 * MIN)
    other = sum(1 for i in ids if last_ms(i) is not None and first_ms(i) is not None and pday(last_ms(i)) > pday(first_ms(i)))
    dog = sum(1 for i in ids if has_dog(i))
    return {'n': n, 'active10': frac(a10, n), 'otherDay': frac(other, n), 'd1': d1_of(ids), 'dog': frac(dog, n)}


q = {'all': quality(N30), 'channel': {}, 'campaign': None, 'comparisons': []}
CH_IDS = {}
for ch, _ in breakdown(ch4):
    ids = [i for i in MEAS4 if key_of(REAL[i].get('srcChannel')) == ch]
    CH_IDS[ch] = ids
    q['channel'][ch] = quality(ids)
    rest = [i for i in N30 if i not in set(ids)]
    cmp_ = compare(q['channel'][ch]['d1'], d1_of(rest))
    q['comparisons'].append({'group': 'channel:' + ch, 'eligible': len(ids) >= SURE_N,
                             'a': q['channel'][ch]['d1'], 'b': d1_of(rest), **cmp_,
                             'aRange': pct_range(q['channel'][ch]['d1']['k'], q['channel'][ch]['d1']['n']),
                             'bRange': pct_range(d1_of(rest)['k'], d1_of(rest)['n']),
                             '_ids': (ids, rest)})
if CAMP:
    q['campaign'] = {}
    for p in sorted({c['platform'] for c in CAMP}):
        ids = [i for i in N30 if REAL[i]['platform'] == p]
        inn = [i for i in ids if camp_running(p, pday(first_ms(i)))]
        outn = [i for i in ids if not camp_running(p, pday(first_ms(i)))]
        q['campaign'][p] = {'in': quality(inn), 'out': quality(outn)}
        # Která skupina ještě může růst (cisla2-1): kampaň na p dnes nebo později běží → přibývají jen dny
        # kampaní; žádná kampaň na p už neběží → přibývají jen dny bez kampaně. Druhá skupina má přírůstek 0.
        still_running = any(c['platform'] == p and (c['to'] is None or c['to'] >= TODAY) for c in CAMP)
        frozen = (not still_running, still_running)
        # Od kdy na p platí dnešní stav (cisla3-1): rostoucí strana se odhaduje až po 7 dnech + zralosti D1
        # jen z tohoto stavu. Běží: první den souvislé řady dnů kampaní končící dneškem (stačí hledat 9 dní zpět).
        # Neběží: den po posledním dni kampaně na p.
        if still_running:
            regime_since = TODAY
            while regime_since > TODAY - MATURE_DAYS - 2 and camp_running(p, regime_since - 1):
                regime_since -= 1
        else:
            regime_since = max(c['to'] for c in CAMP if c['platform'] == p) + 1
        q['comparisons'].append({'group': 'campaign:' + p, 'eligible': True,
                                 'a': q['campaign'][p]['in']['d1'], 'b': q['campaign'][p]['out']['d1'],
                                 **compare(q['campaign'][p]['in']['d1'], q['campaign'][p]['out']['d1']),
                                 'aRange': pct_range(q['campaign'][p]['in']['d1']['k'], q['campaign'][p]['in']['d1']['n']),
                                 'bRange': pct_range(q['campaign'][p]['out']['d1']['k'], q['campaign'][p]['out']['d1']['n']),
                                 '_ids': (inn, outn), '_frozen': frozen,
                                 '_regime': {'platform': p, 'live': still_running, 'since': regime_since}})
elig = [c for c in q['comparisons'] if c['eligible']]
if any(c['verdict'] == 'Průkazný rozdíl' for c in elig):
    AV['z4'] = 'Průkazný rozdíl'
elif any(c['verdict'] == 'Zatím neprůkazné' for c in elig):
    AV['z4'] = 'Zatím neprůkazné'
else:
    AV['z4'] = 'Málo dat'
top = [x for x in breakdown(ch4) if x[0] not in (NONE_KEY, 'none')]
q['topChannel'] = {'key': top[0][0], 'devices': top[0][1]} if top else None
q['lateMeasured'] = quality(LATE)
if AV['z4'] == 'Průkazný rozdíl':
    AW['z4'] = None
elif elig:
    def _z4_side(c, x, side):
        if c['group'].startswith('channel:'):
            return when_clear(c[side]['n'], d1_entered7(c['_ids'][x]), since=SRC_SINCE, lag=2)
        if c['_frozen'][x]:
            return when_clear(c[side]['n'], 0)
        rg = c['_regime']
        w = when_clear(c[side]['n'], d1_entered7(c['_ids'][x]), since=rg['since'], lag=2)
        if w and w.get('state') == 'young':
            w = {'state': 'young', 'since': w['since'], 'campaign': rg['platform'], 'live': rg['live']}
        return w
    AW['z4'] = later_clear([_z4_side(c, x, side) for c in elig for x, side in ((0, 'a'), (1, 'b'))])
elif top:
    AW['z4'] = when_clear(q['channel'][top[0][0]]['d1']['n'], d1_entered7(CH_IDS[top[0][0]]), since=SRC_SINCE, lag=2)
else:
    AW['z4'] = when_clear(0, 0, since=SRC_SINCE, lag=2)
for c in q['comparisons']:
    del c['_ids']
    c.pop('_frozen', None)
    c.pop('_regime', None)
acq['quality'] = q

# --- Z3 kampaně ---
if CAMPAIGNS_DOC is None or not isinstance(CAMPAIGNS_DOC, dict):
    acq['campaigns'] = {'state': 'missing'}
    AV['z3'] = 'Chybí útrata'
else:
    YDAY = TODAY - 1

    def camp_days(c):
        end = YDAY if c['to'] is None else min(c['to'], YDAY)
        return list(range(c['from'], end + 1)) if end >= c['from'] else []

    def new_on(platform, days):
        return sum(new_by_day.get(d, Counter())[platform] for d in days)

    def baseline(platform, start):
        days = [d for d in range(start - BASELINE_DAYS, start) if not camp_running(platform, d)]
        devices = new_on(platform, days)
        if len(days) < BASELINE_MIN_DAYS:
            return {'state': 'missing', 'days': len(days), 'devices': devices}
        return {'days': len(days), 'devices': devices, 'perDay': dec(devices / len(days), 4)}

    def price(newn, ndays, base, spend):
        if base.get('state') == 'missing':
            return None, None
        above = newn - base['devices'] * ndays / base['days']
        cost = (spend / above) if (spend is not None and above > 0) else None
        return dec(above, 2), (dec(cost, 2) if cost is not None else None)

    # překryv: kampaně stejné platformy se společným dnem (rozsah from–to, to=null = běží)
    def overlaps(a, b):
        if a['platform'] != b['platform'] or a is b:
            return False
        a_to = a['to'] if a['to'] is not None else 10 ** 9
        b_to = b['to'] if b['to'] is not None else 10 ** 9
        return a['from'] <= b_to and b['from'] <= a_to
    groups, gid = {}, 0
    for c in CAMP:
        if id(c) in groups:
            continue
        stack = [c]
        groups[id(c)] = gid
        while stack:
            x = stack.pop()
            for y in CAMP:
                if id(y) not in groups and overlaps(x, y):
                    groups[id(y)] = gid
                    stack.append(y)
        gid += 1
    by_group = defaultdict(list)
    for c in CAMP:
        by_group[groups[id(c)]].append(c)
    gname = {g: cs[0]['id'] for g, cs in by_group.items()}   # skupina = id první kampaně skupiny ve vstupu
    rows, joint = [], []
    for c in CAMP:
        raw = c['raw']
        days = camp_days(c)
        spend = c['spendEur']
        newn = new_on(c['platform'], days)
        base = baseline(c['platform'], c['from'])
        above, cost = price(newn, len(days), base, spend)
        shared = len(by_group[groups[id(c)]]) > 1
        if len(days) < CAMPAIGN_MIN_DAYS:
            v = 'Běží krátce'
        elif spend is None:
            v = 'Chybí útrata'
        elif shared:
            v = 'Nelze oddělit'
        elif base.get('state') == 'missing':
            v = 'Málo dat'   # „Nelze určit běžný stav“
        elif above <= 0:
            v = 'Nevyplatí se'
        elif cost <= CAMPAIGN_MAX_EUR:
            v = 'Vyplatí se'
        else:
            v = 'Nevyplatí se'
        tight = v in ('Vyplatí se', 'Nevyplatí se') and cost is not None and CAMPAIGN_TIGHT[0] <= cost <= CAMPAIGN_TIGHT[1]
        rows.append({'id': c['id'], 'name': c['name'], 'network': c['network'], 'platform': c['platform'],
                     'from': iso(c['from']), 'to': iso(c['to']) if c['to'] is not None else None,
                     'days': len(days), 'new': newn, 'baseline': base, 'above': above, 'spendEur': spend,
                     'spendAt': c['spendAt'], 'cost': cost, 'verdict': v,
                     'note': ('nothingExtra' if v == 'Nevyplatí se' and above is not None and above <= 0 else
                              'noBaseline' if v == 'Málo dat' else None),
                     'tight': tight, 'group': gname[groups[id(c)]] if shared else None})
    for g, cs in sorted(by_group.items()):
        if len(cs) < 2:
            continue
        days = sorted({d for c in cs for d in camp_days(c)})
        spends = [c['spendEur'] for c in cs]
        spend = None if any(s is None for s in spends) else dec(sum(spends), 2)
        start = min(c['from'] for c in cs)
        newn = new_on(cs[0]['platform'], days)
        base = baseline(cs[0]['platform'], start)
        above, cost = price(newn, len(days), base, spend)
        joint.append({'group': gname[g], 'ids': [c['id'] for c in cs], 'names': [c['name'] for c in cs], 'platform': cs[0]['platform'], 'days': len(days),
                      'new': newn, 'baseline': base, 'above': above, 'spendEur': spend, 'cost': cost})
    acq['campaigns'] = {'state': 'ok', 'updatedAt': CAMPAIGNS_DOC.get('updatedAt'), 'list': rows, 'joint': joint,
                        'upcoming': [{'id': c['id'], 'name': c['name'], 'network': c['network'], 'platform': c['platform'],
                                      'from': iso(c['from']), 'to': iso(c['to']) if c['to'] is not None else None,
                                      'spendEur': c['spendEur']} for c in UPCOMING]}
    # verdikt karty = verdikt nejnovější kampaně (největší `from`, při shodě pozdější ve vstupu)
    newest = None
    for r in rows:
        if newest is None or r['from'] >= newest['from']:
            newest = r
    AV['z3'] = newest['verdict'] if newest else 'Chybí útrata'

# --- Z5 sdílení ---


def devices_with(ids, pred, days=30):
    return [i for i in ids if any(pred(e) for e in win(i, days))]


share = devices_with(A30, lambda e: e['name'] == 'share_initiated')
kinds = Counter()
for i in share:
    for k in {key_of(P(e).get('kind')) for e in win(i, 30) if e['name'] == 'share_initiated'}:
        kinds[k] += 1
ios_share = [i for i in share if REAL[i]['platform'] == 'ios']
ios_sent = devices_with([i for i in A30 if REAL[i]['platform'] == 'ios'],
                        lambda e: e['name'] == 'share_completed' and P(e).get('action') == 'shared')
acq['share'] = {
    'active': len(A30), 'shared': frac(len(share), len(A30)), 'kind': breakdown(kinds),
    'ios': {'shared': len(ios_share), 'sent': len(ios_sent)},
    'coop': {'invited': len(devices_with(A30, lambda e: e['name'] == 'coop_invite_created')),
             'joined': len(devices_with(A30, lambda e: e['name'] == 'coop_joined'))},
    'link': sum(1 for i in A30 if REAL[i].get('srcChannel') == 'trypup_link'),
    'family': {'state': 'testers'},
}
AV['z5'] = 'Zjištění'
AV['z6'] = 'Zjištění'

# --- Z6 země a jazyky ---


def loc_key(v):
    return NONE_KEY if v in (None, '', 'none', 'unknown') else key_of(v)


acq['region'] = breakdown(Counter(loc_key(REAL[i].get('region')) for i in N30))
acq['locale'] = breakdown(Counter(loc_key(REAL[i].get('locale')) for i in N30))
acq['deviceLocale'] = breakdown(Counter(loc_key(REAL[i].get('deviceLocale')) for i in N30))
store_cc = Counter()
first_store_day = iso(TODAY - 29)
for x in STORE:
    if first_store_day <= x['date'] <= iso(TODAY):
        m = x.get('byTerritory') if x['platform'] == 'ios' else x.get('byCountry')
        for cc, v in (m.items() if isinstance(m, dict) else []):
            if num(v) is not None:
                store_cc[key_of(cc)] += int(v)
acq['storeRegion30'] = breakdown(store_cc)

# ═════════════════════════ CESTA (C.2) ═════════════════════════
jr = out['jr']
K = N30
ONB = [i for i in K if has(i, lambda e: e['name'] == 'onboarding_step')]
FORK = [i for i in ONB if has(i, lambda e: e['name'] == 'onboarding_step' and (P(e).get('step') == 'fork' or P(e).get('choice')))]
jr['cohort'] = len(K)
jr['onb'] = len(ONB)
jr['noOnb'] = len(K) - len(ONB)
jr['fork'] = {'n': len(FORK), 'choice': breakdown(Counter(key_of(last_choice(i)) for i in FORK))}
TRIAL_B = [i for i in ONB if last_choice(i) != 'owner']
OWNER_B = [i for i in ONB if last_choice(i) == 'owner']
tb = {'entered': len(TRIAL_B)}
for st in ('quiz', 'quiz_result', 'name'):
    tb[st] = sum(1 for i in TRIAL_B if has(i, reached(st)))
tb['activated'] = sum(1 for i in TRIAL_B if activated(i))
saved = [i for i in OWNER_B if owner_saved(i)]
saved_ev = [i for i in OWNER_B if has(i, lambda e: e['name'] == 'owner_activated')]
not_saved = [i for i in OWNER_B if i not in set(saved)]
ob = {'entered': len(OWNER_B), 'owner_setup': sum(1 for i in OWNER_B if has(i, reached('owner_setup'))),
      'saved': len(saved), 'savedEvent': len(saved_ev), 'notSaved': len(not_saved),
      'closed': sum(1 for i in not_saved if has(i, lambda e: e['name'] == 'owner_setup_exit'))}
jr['branch'] = {'trial': tb, 'owner': ob}
DOG = [i for i in K if activated(i) or owner_saved(i)]
DOGs = set(DOG)
jr['dogAny'] = frac(len(DOG), len(K))
ONBs = set(ONB)
jr['noOnbDog'] = sum(1 for i in DOG if i not in ONBs)
JV['a1'] = 'Zjištění'
JV['a2'] = 'Zjištění'
JV['a3'] = 'Zjištění'

# --- A2 ---


def last_step(i):
    s = None
    for e in EV[i]:
        if e['name'] == 'onboarding_step':
            s = key_of(P(e).get('step'))
    return s if s is not None else NONE_KEY


jr['noDog'] = breakdown(Counter(last_step(i) for i in K if i not in DOGs))
dw = defaultdict(list)
for i in K:
    for e in EV[i]:
        if e['name'] == 'onboarding_step' and P(e).get('dir') != 'back':
            d = num(P(e).get('dwellMs'))
            fs = P(e).get('fromStep')
            if d is not None and fs:
                dw[key_of(fs)].append(d)
dwell = {}
for k, v in dw.items():
    if len(v) >= SMALL_N:
        m = statistics.median(v)
        dwell[k] = {'n': len(v), 'ms': int(m) if float(m).is_integer() else m, 's': js_round(m / 1000)}
jr['dwell'] = dict(sorted(dwell.items()))
back_dev = [i for i in K if has(i, lambda e: e['name'] == 'onboarding_step' and P(e).get('dir') == 'back')]
trans = Counter()
for i in K:
    for e in EV[i]:
        if e['name'] == 'onboarding_step' and P(e).get('dir') == 'back':
            a, b = P(e).get('fromStep'), P(e).get('step')
            trans[(key_of(a) if a else '?') + '>' + (key_of(b) if b else '?')] += 1
jr['back'] = {'devices': len(back_dev), 'transitions': breakdown(trans)}

# --- A3 první týden ---
MAT = [i for i in K if first_ms(i) <= NOW - MATURE_DAYS * DAY]
WT = [i for i in MAT if i in set(TRIAL_B) and activated(i)]
WO = [i for i in MAT if i in set(OWNER_B) and owner_saved(i)]


def week(i):
    lim = first_ms(i) + MATURE_DAYS * DAY
    return [e for e in EV[i] if e['ts'] <= lim]


def care_days(i):
    return len({pday(e['ts']) for e in week(i) if e['name'] == 'task_done'})


PLAN_SCR = 'pesdoma/dog/[id]/plan'
DIARY_SCR = {'pesdoma/dog/[id]/diary', 'pesdoma/dog/[id]/entry', 'pesdoma/dog/[id]/weight'}
jr['week'] = {
    'mature': len(MAT), 'trial': len(WT), 'owner': len(WO),
    'trialUse': {
        'care': frac(sum(1 for i in WT if care_days(i) >= 1), len(WT)),
        'care2': frac(sum(1 for i in WT if care_days(i) >= 2), len(WT)),
        'care3': frac(sum(1 for i in WT if care_days(i) >= 3), len(WT)),
        'challenge': frac(sum(1 for i in WT if has(i, lambda e: e['name'] == 'challenge_started', week(i))), len(WT)),
        'notif': r8_frac(WT, SB['notification_permission'],
                         lambda e: e['name'] == 'notification_permission' and P(e).get('status') == 'granted', week),
    },
    'ownerUse': {
        'plan': frac(sum(1 for i in WO if has(i, lambda e: sc(e) == PLAN_SCR, week(i))), len(WO)),
        'diary': frac(sum(1 for i in WO if has(i, lambda e: sc(e) in DIARY_SCR, week(i))), len(WO)),
        'returned': frac(sum(1 for i in WO if len({pday(e['ts']) for e in week(i) if sc(e).startswith('pesdoma/')}) >= 2), len(WO)),
        'planItem': r8_frac(WO, SB['plan_item'], lambda e: e['name'] == 'plan_item', week),
    },
}

# --- A4 retence ---
RET = compute_retention(K)
jr['ret'] = RET
d1 = RET['all']['d1']
if d1['n'] < SURE_N:
    v = 'Málo dat'
else:
    lo, hi = wilson(d1['k'], d1['n'])
    v = 'Nad trhem' if lo > MARKET['d1'] else 'Pod trhem' if hi < MARKET['d1'] else 'Na úrovni trhu'
jr['retMarket'] = {'d1Range': pct_range(d1['k'], d1['n'])}
JV['a4'] = v
JW['a4'] = when_clear(d1['n'], d1_entered7(K)) if v == 'Málo dat' else None

# --- A5 A/B první péče ---
AB_FROM = prague_midnight_ms(day_of_iso(AB_START_DAY))
ab_var = {}
for i in REAL:
    for e in EV[i]:
        if e['name'] == 'experiment_assigned' and P(e).get('name') == 'first_care' and AB_FROM <= e['ts'] <= NOW:
            ab_var[i] = key_of(P(e).get('variant'))
            break


# T4 kandidáti (potřebné i pro A5)
def tester_models():
    m = set()
    for iid, o in OVERRIDES.items():
        if isinstance(o, dict) and o.get('kind') not in ('robot', 'real') and iid in LEDGER and LEDGER[iid].get('model'):
            m.add(LEDGER[iid]['model'])
    return m


MATCH_MS = 10 * MIN


def product_key(pid):
    s = str(pid or '').lower()
    if re.search('lifetime', s):
        return 'plan_lifetime'
    if re.search('year|annual', s):
        return 'plan_yearly'
    if re.search('month', s):
        return 'plan_monthly'
    if re.search('bundle', s):
        return 'breed_bundle'
    return re.sub(r'^trypup_', '', s)


def unmatched_app_purchases():
    """Párování nákupů jako `purchaseRows` adminu: RC nákup ↔ purchase_completed se stejným produktem do 10 min."""
    app = [e for e in DEDUP if e['name'] == 'purchase_completed' and P(e).get('product') != 'restore' and e['ts'] is not None]
    used = set()
    for r in RC_EVENTS:
        if not r.get('isPurchase'):
            continue
        key = product_key(r.get('productId'))
        t = r.get('purchasedAtMs') or r.get('eventAtMs') or 0
        if r.get('type') == 'RENEWAL':
            continue
        best, best_d = None, math.inf
        for idx, e in enumerate(app):
            if idx in used or product_key(P(e).get('product')) != key:
                continue
            d = abs(e['ts'] - t)
            if d <= MATCH_MS and d < best_d:
                best, best_d = idx, d
        if best is not None:
            used.add(best)
    return [e for idx, e in enumerate(app) if idx not in used]


NORC = [e for e in unmatched_app_purchases() if e['installId'] in REAL and W30_FROM < e['ts'] <= NOW]
NORC_IDS = {e['installId'] for e in NORC}
TMODELS = tester_models()
REVIEW = {}
for i in A30:
    if i in OVERRIDES:
        continue
    reasons = []
    if REAL[i].get('model') in TMODELS:
        reasons.append('testerModel')
    if i in NORC_IDS:
        reasons.append('purchaseNoRc')
    if reasons:
        REVIEW[i] = reasons

ab = {}
ab_whens = []
for var in sorted(set(ab_var.values())):
    ids = [i for i, v in ab_var.items() if v == var]
    dd = d1_of(ids)
    ab[var] = {'assigned': len(ids), 'd1': dd,
               'tapped': sum(1 for i in ids if has(i, lambda e: e['name'] == 'home_banner' and P(e).get('kind') == 'first_care' and P(e).get('action') == 'tap')),
               'review': sum(1 for i in ids if i in REVIEW), 'd1Range': pct_range(dd['k'], dd['n'])}
    ab_whens.append(when_clear(dd['n'], d1_entered7(ids), since=day_of_iso(AB_START_DAY), lag=2))
vs = list(ab.values())
if len(vs) < 2 or any(x['d1']['n'] < SURE_N for x in vs):
    ab_verdict = 'Málo dat'
    ab_when = later_clear(ab_whens) if len(vs) >= 2 else when_clear(0, 0, since=day_of_iso(AB_START_DAY), lag=2)
else:
    ab_verdict = compare(ab['a']['d1'], ab['b']['d1'])['verdict'] if 'a' in ab and 'b' in ab else 'Málo dat'
    ab_when = None if ab_verdict == 'Průkazný rozdíl' else later_clear(ab_whens)
jr['ab'] = {'variants': ab, 'review': sum(1 for i in ab_var if i in REVIEW)}
JV['a5'] = ab_verdict
JW['a5'] = ab_when

# ─── Sekce B: aktivní za 30 dní ───
T = [i for i in A30 if any(trial_sig(e) for e in win(i, 30))]
O = [i for i in A30 if any(owner_sig(e) for e in win(i, 30))]
Ts, Os = set(T), set(O)
jr['modes'] = {'active': len(A30), 'trial': len(T), 'owner': len(O), 'both': len(Ts & Os),
               'neither': len([i for i in A30 if i not in Ts and i not in Os])}
# „Aspoň 2 různé dny“ (R6). Srovnání režimů, z, verdikt a „kdy bude jasno“ jen u nových za 30 dní
# (rozhodnutí 20. 11., cisla-10): mezi všemi aktivními jsou u Psa na zkoušku i lidé z doby před Psem doma.
# Všichni zralí aktivní jsou v `all` jen jako doplněk.
_new30 = set(N30)
T_new = [i for i in T if i in _new30]
O_new = [i for i in O if i in _new30]
_, tm, tr = feature(T_new, trial_sig)
_, om, orp = feature(O_new, owner_sig)
_, tm_all, tr_all = feature(T, trial_sig)
_, om_all, orp_all = feature(O, owner_sig)
two = {'new': {'trial': frac(len(tr), len(tm)), 'owner': frac(len(orp), len(om))},
       'all': {'trial': frac(len(tr_all), len(tm_all)), 'owner': frac(len(orp_all), len(om_all))}}
cmp = compare(two['new']['trial'], two['new']['owner'])
two['z'] = cmp['z']
two['ranges'] = {side: pct_range(two['new'][side]['k'], two['new'][side]['n']) for side in ('trial', 'owner')}
JV['b1'] = cmp['verdict']


def entered_mature7(base, pred):
    """Do základu R6 přibyli za 7 dní: první shoda v období ∈ (teď − 14 d, teď − 7 d]."""
    n = 0
    for i in base:
        hits = [e for e in win(i, 30) if pred(e)]
        if hits and NOW - 14 * DAY < hits[0]['ts'] <= NOW - 7 * DAY:
            n += 1
    return n


if JV['b1'] in ('Málo dat', 'Zatím neprůkazné'):
    _b1 = {'since': day_of_iso(MODE_SINCE_DAY), 'lag': MATURE_DAYS}
    JW['b1'] = later_clear([when_clear(len(tm), entered_mature7(T_new, trial_sig), **_b1), when_clear(len(om), entered_mature7(O_new, owner_sig), **_b1)])
else:
    JW['b1'] = None
jr['modes']['twoDays'] = two

# --- B2 ---
MODE_OWNER = lambda e: P(e).get('mode') == 'owner'
LEARN = {'article_opened', 'article_read', 'lesson_answered', 'myth_answered', 'review_answered'}
B2_ROWS = [
    ('care', lambda e: e['name'] == 'task_done', True),
    ('training', lambda e: e['name'] == 'training_done', True),
    ('walk', lambda e: (e['name'] == 'walk_started' and not MODE_OWNER(e)) or sc(e) == 'walk', True),
    ('walkGps', lambda e: e['name'] == 'walk_completed' and not MODE_OWNER(e), True),
    ('walkCounted', lambda e: e['name'] == 'walk_completed' and not MODE_OWNER(e) and (num(P(e).get('durationSec')) or 0) >= WALK_MIN_SEC
     and num(P(e).get('durationSec')) is not None and num(P(e).get('distanceM')) is not None and num(P(e).get('distanceM')) >= WALK_MIN_M, True),
    ('learning', lambda e: e['name'] in LEARN and not MODE_OWNER(e), True),
    ('event', lambda e: e['name'] == 'event_choice', True),
    ('challenge', lambda e: e['name'] == 'challenge_started', False),
    ('day7', lambda e: e['name'] == 'day_advanced' and (num(P(e).get('day')) or 0) >= 7, False),
    ('shelter', lambda e: e['name'] == 'fail_state', False),
]
tu = {'base': len(T)}
for key, pred, rep in B2_ROWS:
    used, mat, r = feature(T, pred)
    tu[key] = {'used': frac(len(used), len(T))}
    if rep:
        tu[key]['twoDays'] = frac(len(r), len(mat))
fc = Counter()
for i in T:
    for k in {key_of(P(e).get('choice')) for e in win(i, 30) if e['name'] == 'fail_state_choice'}:
        fc[k] += 1
tu['failChoice'] = breakdown(fc)
JV['b2'] = 'Zjištění'
jr['trialUse'] = tu

# --- B3 ---
PLACES = [
    ('plan', lambda e: sc(e) == 'pesdoma/dog/[id]/plan'),
    ('diary', lambda e: sc(e) in DIARY_SCR),
    ('docs', lambda e: sc(e) in {'pesdoma/dog/[id]/passport', 'pesdoma/dog/[id]/documents', 'pesdoma/dog/[id]/scan', 'pesdoma/dog/[id]/summary'}),
    ('firstaid', lambda e: sc(e) in {'pesdoma/first-aid', 'pesdoma/first-aid/[topic]'}),
    ('training', lambda e: sc(e).startswith('pesdoma/dog/[id]/training') or sc(e).startswith('pesdoma/training/')),
    ('vets', lambda e: sc(e) in {'pesdoma/vets', 'pesdoma/vet/[id]'} or e['name'] == 'map_opened'),
    ('walk', lambda e: sc(e) in {'pesdoma/walk', 'pesdoma/walk-summary'}),
    ('family', lambda e: sc(e) in {'pesdoma/dog/[id]/family', 'pesdoma/family-join'} or e['name'] == 'family'),
]
w30 = lambda i: win(i, 30)
DID = [
    ('planItem', 'plan', SB['plan_item'], lambda e: e['name'] == 'plan_item'),
    ('calendar', 'plan', SB['calendar_event_opened'], lambda e: e['name'] == 'calendar_event_opened'),
    ('entry', 'diary', SB['diary_weight'], lambda e: e['name'] in ('diary_entry', 'weight_entry')),
    ('document', 'docs', SB['dog_document'], lambda e: e['name'] == 'dog_document' and P(e).get('action') in ('added', 'attached')),
    ('trainingSession', 'training', SB['training_session'], lambda e: e['name'] in ('training_logged', 'training_stage_confirmed')),
    ('walkStarted', 'walk', SB['walk_owner'], lambda e: e['name'] == 'walk_started' and MODE_OWNER(e)),
    ('walkCompleted', 'walk', SB['walk_owner'], lambda e: e['name'] == 'walk_completed' and MODE_OWNER(e)),
]
ow = {'base': len(O), 'opened': {}, 'twoDays': {}, 'did': {}}
for key, pred in PLACES:
    used, mat, r = feature(O, pred)
    ow['opened'][key] = frac(len(used), len(O))
    ow['twoDays'][key] = frac(len(r), len(mat))
for key, place, sb, pred in DID:
    ow['did'][key] = {'place': place, 'sb': sb, **r8_frac(O, sb, pred, w30)}
ow['did']['family'] = {'place': 'family', 'state': 'testers'}
JV['b3'] = 'Zjištění'
jr['owner'] = ow

# --- B4 ---
sw = defaultdict(set)
for i in A30:
    for e in win(i, 30):
        if e['name'] == 'mode_switched':
            sw[(key_of(P(e).get('to')), key_of(P(e).get('source')))].add(i)


def union(pred):
    s = set()
    for (to, src), ids in sw.items():
        if pred(to, src):
            s |= ids
    return s


def src_breakdown(to_val):
    c = Counter()
    for (to, src), ids in sw.items():
        if to == to_val and src != 'onboarding':
            c[src] += len(ids)
    return breakdown(c)


jr['switch'] = {
    'total': len(union(lambda t, s: True)),
    'onboarding': {'owner': len(union(lambda t, s: s == 'onboarding' and t == 'owner')),
                   'trial': len(union(lambda t, s: s == 'onboarding' and t == 'trial'))},
    'later': {'owner': len(union(lambda t, s: s != 'onboarding' and t == 'owner')),
              'trial': len(union(lambda t, s: s != 'onboarding' and t == 'trial')),
              'ownerBySource': src_breakdown('owner'), 'trialBySource': src_breakdown('trial')},
}
JV['b4'] = 'Zjištění'

# --- B5 ---
w7 = lambda i: win(i, 7)
eb, ex, ey = measurable(A7, SB['app_entry'], w7)
entry = {'x': ex, 'y': ey}
if eb is None:
    entry['state'] = 'unmeasured'
else:
    dev, cnt = Counter(), Counter()
    users = set()
    for i in eb:
        srcs = set()
        for e in win(i, 7):
            if e['name'] == 'app_entry':
                s = key_of(P(e).get('source'))
                srcs.add(s)
                cnt[s] += 1
                users.add(i)
        for s in srcs:
            dev[s] += 1
    entry.update({'n': len(eb), 'devices': len(users), 'bySource': breakdown(dev), 'countBySource': breakdown(cnt)})
notif_last = {}
for i in A30:
    last = None
    for e in win(i, 30):
        if e['name'] == 'notification_permission':
            last = key_of(P(e).get('status'))
    if last is not None:
        notif_last[i] = last
nl = Counter(notif_last.values())
notif = {'answered': len(notif_last), 'granted': nl.get('granted', 0), 'denied': nl.get('denied', 0), 'byStatus': breakdown(nl)}
cb, cx, cy = measurable(T, SB['care_reminder'], w30)
care = {'x': cx, 'y': cy}
if cb is None:
    care['state'] = 'unmeasured'
    JV['b5'] = 'Zatím neměříme'
    JW['b5'] = None
else:
    opened = [i for i in cb if any(e['name'] == 'care_reminder_opened' for e in win(i, 30))]
    done = [i for i in cb if any(e['name'] == 'care_reminder_done' for e in win(i, 30))]
    by = {'slot': Counter(), 'variant': Counter(), 'timing': Counter()}
    var_rec = Counter()   # splnění (záznamy) podle varianty
    for i in done:
        vals = {'slot': set(), 'variant': set(), 'timing': set()}
        for e in win(i, 30):
            if e['name'] == 'care_reminder_done':
                var_rec[key_of(P(e).get('variant'))] += 1
                for k in vals:
                    vals[k].add(key_of(P(e).get(k)))
        for k in vals:
            for v_ in vals[k]:
                by[k][v_] += 1
    care.update({'n': len(cb), 'opened': len(opened), 'done': len(done),
                 'doneBySlot': breakdown(by['slot']), 'doneByVariant': breakdown(by['variant']),
                 'doneByVariantRecords': breakdown(var_rec), 'doneByTiming': breakdown(by['timing'])})
    # Varianty textu se nesrovnávají (cisla-1): telefon je dostává střídavě a doručení aplikace neposílá.
    JV['b5'] = 'Zjištění'
    JW['b5'] = None
jr['entry'] = entry
jr['notif'] = notif
jr['care'] = care

# --- B6 mise ---


def count_dev(name):
    return len(devices_with(A30, lambda e: e['name'] == name))


dec = Counter()
for i in A30:
    last = None
    for e in win(i, 30):
        if e['name'] == 'challenge_decision':
            last = key_of(P(e).get('choice'))
    if last is not None:
        dec[last] += 1
# Proklik na útulek = jen shelter_opened (cisla2-7): klepnutí na promoci (graduation_shelter_cta) v aplikaci
# jen otevře seznam útulků (graduation.tsx: router.replace('/(main)/adoption')), útulek se pak otevře
# samostatným shelter_opened. Promoce se proto počítá zvlášť jako zařízení (gradShelter).
SHELTER_EV = ('shelter_opened',)
clicks = Counter()
for i in A30:
    for e in win(i, 30):
        if e['name'] in SHELTER_EV:
            clicks[DASH_RE.sub(' – ', key_of(P(e).get('shelter')))] += 1
jr['mission'] = {
    'started': count_dev('challenge_started'), 'graduation': count_dev('graduation_reached'),
    'completed': count_dev('challenge_completed'), 'decided': sum(dec.values()), 'decision': breakdown(dec),
    'wait': count_dev('graduation_wait_cta'),
    'shelter': {'devices': len(devices_with(A30, lambda e: e['name'] in SHELTER_EV)), 'clicks': sum(clicks.values()),
                'byShelter': breakdown(clicks)},
    'gradShelter': count_dev('graduation_shelter_cta'),
}
JV['b6'] = 'Jen počty'   # SPEC B6 / C0 bod 5; ve slovníku verdiktů C.0 chybí

# --- B7 odpovědi v úvodu (poslední záznam za zařízení, 30 dní) ---


def last_rec(name):
    r = {}
    for i in A30:
        for e in win(i, 30):
            if e['name'] == name:
                r[i] = e
    return r


rc = last_rec('readiness_completed')
perq = {}
for qk in ('q1', 'q2', 'q3', 'q4', 'q5', 'q6'):
    c = Counter(P(e).get(qk) for e in rc.values())
    perq[qk] = {'yes': c.get('yes', 0), 'no': c.get('no', 0), 'na': c.get('na', 0)}
qc = last_rec('quiz_completed')
bs = last_rec('breed_selected')
po = defaultdict(set)
for i in A30:
    for e in win(i, 30):
        if e['name'] == 'onboarding_premium_offer':
            po[key_of(P(e).get('action'))].add(i)
jr['answers'] = {
    'readiness': {'n': len(rc), 'tier': breakdown(Counter(key_of(P(e).get('tier')) for e in rc.values())),
                  'phase': breakdown(Counter(key_of(P(e).get('phase')) for e in rc.values())), 'q': perq},
    'quiz': {'n': len(qc), 'hours': breakdown(Counter(key_of(P(e).get('hours')) for e in qc.values())),
             'housing': breakdown(Counter(key_of(P(e).get('housing')) for e in qc.values())),
             'activity': breakdown(Counter(key_of(P(e).get('activity')) for e in qc.values()))},
    'breed': {'n': len(bs), 'matched': sum(1 for e in bs.values() if P(e).get('matchedRecommendation') is True),
              'other': sum(1 for e in bs.values() if P(e).get('matchedRecommendation') is False),
              'breed': breakdown(Counter(key_of(P(e).get('breed')) for e in bs.values()))},
    'premiumOffer': {'shown': len(po.get('shown', ())), 'tapped': len(po.get('tapped', ()))},
}

acq['verdicts'], acq['whenClear'] = dict(sorted(AV.items())), dict(sorted(AW.items()))
jr['verdicts'], jr['whenClear'] = dict(sorted(JV.items())), dict(sorted(JW.items()))

# ═════════════════════════ TECHNIKA (C.3) ═════════════════════════
tech = out['tech']
ev_real30 = sum(len(win(i, 30)) for i in REAL)
dedup_ts = [e['ts'] for e in DEDUP if e['ts'] is not None]
oldest = min(dedup_ts) if dedup_ts else None
tech['loaded'] = {'records': RAW_N, 'kept': len(DEDUP), 'dups': dups_all, 'batches': DUMP['meta'].get('batches'),
                  'oldestDay': iso(pday(oldest)) if oldest is not None else None, 'complete': True}
tech['dups30'] = frac(raw_real_30 - ev_real30, raw_real_30)
tech['dupsAll'] = dups_all
tech['dupsAllReal'] = dups_real_all

# T2 pokrytí verzí (aktivní 7 dní, nejvyšší verze za 7 dní)
# verze z obchodu podle platformy: nejčastější verze první události nových za 14 dní, při shodě vyšší (cisla-5)
def store_build(platform):
    c = Counter()
    for i in new_ids(14):
        if REAL[i]['platform'] == platform and EV[i]:
            b = num(EV[i][0]['dev'].get('appBuild'))
            if b is not None:
                c[b] += 1
    return max(c.items(), key=lambda x: (x[1], x[0]))[0] if c else None


SB_STORE = {'android': store_build('android'), 'ios': store_build('ios')}
on_store = [i for i in A7 if SB_STORE[REAL[i]['platform']] is not None and maxbuild(win(i, 7)) == SB_STORE[REAL[i]['platform']]]
AND7 = [i for i in A7 if REAL[i]['platform'] == 'android']
tech['versions7'] = {'active': len(A7), 'store': {'builds': SB_STORE, 'devices': len(on_store),
                                                  'oneDay': sum(1 for i in on_store if len({pday(e['ts']) for e in win(i, 30)}) == 1)},
                     'atLeast': {str(sb): sum(1 for i in A7 if maxbuild(win(i, 7)) >= sb) for sb in T2_SB},
                     'android': {'active': len(AND7), 'sb': CHANNEL_SB, 'atLeastSb': sum(1 for i in AND7 if maxbuild(win(i, 7)) >= CHANNEL_SB)}}

# T3 sedí data?
rec30_all = [e for e in DEDUP if e['ts'] is not None and W30_FROM < e['ts'] <= NOW]
names30 = Counter(e['name'] for e in rec30_all if isinstance(e['name'], str) and NAME_RE.match(e['name']))
invalid30 = sum(1 for e in rec30_all if not (isinstance(e['name'], str) and NAME_RE.match(e['name'])))
unknown30 = sorted(n for n in names30 if n not in CATALOG)
act_by_events = [i for i in REAL if win(i, 30)]
not_in_ledger = [e for e in rec30_all if e['installId'] not in LEDGER]
srv = None
if RETENTION and isinstance(RETENTION.get('segments'), dict):
    sd1 = (RETENTION['segments'].get('all') or {}).get('d1')
    if isinstance(sd1, dict):
        srv = frac(num(sd1.get('k')) or 0, num(sd1.get('n')) or 0)
d1_admin = d1_of(list(REAL))
tech['check'] = {
    'dups30': {**tech['dups30'], 'state': 'warn' if (raw_real_30 and (raw_real_30 - ev_real30) * 100 > 5 * raw_real_30) else 'ok'},
    'unknown': {'count': len(unknown30), 'names': unknown30[:10], 'state': 'warn' if unknown30 else 'ok'},
    'invalid': {'count': invalid30, 'state': 'warn' if invalid30 else 'ok'},
    'active30': {'events': len(act_by_events), 'ledger': len(A30),
                 'state': 'warn' if abs(len(act_by_events) - len(A30)) > 2 else 'ok'},
    'outsideLedger': {'records': len(not_in_ledger), 'devices': len({e['installId'] for e in not_in_ledger}),
                      'state': 'warn' if not_in_ledger else 'ok'},
    'purchaseNoRc': {'count': len(NORC), 'rows': [
        {'day': iso(pday(e['ts'])), 'platform': REAL[e['installId']]['platform'], 'model': REAL[e['installId']].get('model'),
         'product': P(e).get('product'), 'iid': short_id(e['installId'])} for e in sorted(NORC, key=lambda e: (pday(e['ts']), e['installId']))],
        'state': 'warn' if NORC else 'ok'},
    'd1Server': {'admin': d1_admin, 'server': srv,
                 'state': None if srv is None else ('warn' if abs(d1_admin['k'] - srv['k']) > 2 or abs(d1_admin['n'] - srv['n']) > 2 else 'ok')},
}
tech['unknown'] = len(unknown30)
tech['invalid'] = invalid30
tech['actions30'] = len({e['name'] for i in REAL for e in win(i, 30) if isinstance(e['name'], str) and NAME_RE.match(e['name'])})
tech['purchaseNoRc'] = len(NORC)

# T4 k ověření
rv_models = Counter(key_of(REAL[i].get('model')) for i in REVIEW)
tech['review'] = {'active30': len(REVIEW), 'byModel': breakdown(rv_models),
                  'byReason': breakdown(Counter(r for rs in REVIEW.values() for r in rs)),
                  'rows': sorted([{'id': i, 'iid': short_id(i), 'model': REAL[i].get('model'), 'firstDay': iso(pday(first_ms(i))),
                                   'build': REAL[i].get('appBuild'), 'reasons': REVIEW[i]} for i in REVIEW],
                                 key=lambda r: r['id'])}

# T5 limit Expo
expo = sum(1 for x in INSTALLS if x.get('platform') in ('ios', 'android') and in_win(num(x.get('lastMs')), 30))
tech['expo'] = {'active30': expo, 'limit': 1000, 'level': 'ok' if expo < 800 else 'warn' if expo < 900 else 'plan'}

# T6 akce podle skupin (pevně 7 a 30 dní): výchozí = skuteční; actionsAll = se zaškrtávátkem testerů,
# všechny záznamy po deduplikaci (i testeři, roboti a zařízení mimo evidenci; installId jiného typu = None).
def action_table(d7c, d30c, r30c, invalid, dups):
    actions = {}
    for n in sorted(set(CATALOG) | {x for x in r30c if isinstance(x, str)}):
        if n in CATALOG:
            g, sb, od = CATALOG[n]
        else:
            g, sb, od = 'unknown', None, None
        if not isinstance(n, str) or not NAME_RE.match(n):
            continue
        if n not in CATALOG:
            st = 'unknown'
        elif STATUS.get(n) == 'removed':
            st = 'removed'
        elif STATUS.get(n) == 'testers':
            st = 'testers'
        elif r30c.get(n, 0) == 0:
            # bez záznamu za 30 dní: akce se posílá déle než 30 dní → 'none30', jinak 'noData' (texty-23)
            st = 'none30' if od is not None and day_of_iso(od) <= TODAY - 30 else 'noData'
        elif n in AUTO:
            st = 'auto'
        else:
            st = 'live'
        actions[n] = {'g': g, 'd7': len(d7c.get(n, ())), 'd30': len(d30c.get(n, ())), 'r30': r30c.get(n, 0),
                      'sb': sb, 'od': od, 'state': st}
    return {
        'catalog': len(CATALOG), 'seen30': sum(1 for n in CATALOG if r30c.get(n, 0) > 0),
        'unknown30': sum(1 for n in actions if actions[n]['state'] == 'unknown'),
        'invalid30': invalid, 'dups30': dups,
        'byGroup': [[g, sum(1 for a in actions.values() if a['g'] == g)] for g in GROUP_ORDER if any(a['g'] == g for a in actions.values())],
        'rows': actions,
    }


d7c, d30c, r30c = defaultdict(set), defaultdict(set), Counter()
for i in REAL:
    for e in win(i, 30):
        d30c[e['name']].add(i)
        r30c[e['name']] += 1
        if e['ts'] > W7_FROM:
            d7c[e['name']].add(i)
tech['actions'] = action_table(d7c, d30c, r30c,
                               sum(1 for i in REAL for e in win(i, 30) if not (isinstance(e['name'], str) and NAME_RE.match(e['name']))),
                               tech['dups30']['k'])
a7c, a30c, ar30c = defaultdict(set), defaultdict(set), Counter()
for e in rec30_all:
    if not (isinstance(e['name'], str) and NAME_RE.match(e['name'])):
        continue
    a30c[e['name']].add(e['installId'])
    ar30c[e['name']] += 1
    if e['ts'] > W7_FROM:
        a7c[e['name']].add(e['installId'])
tech['actionsAll'] = action_table(a7c, a30c, ar30c, invalid30, dups_all_30)

# ═════════════════════════ meta ═════════════════════════
out['meta'] = {
    'now': DUMP['meta']['dumpedAt'], 'nowMs': NOW, 'today': iso(TODAY), 'schema': 1,
    'cohortFrom': iso(pday(NOW - 30 * DAY)), 'cohortTo': iso(TODAY),
    'realDevices': len(REAL), 'campaignsDoc': CAMPAIGNS_DOC is not None,
}
labels_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'admin-labels.json')
if os.path.exists(labels_path):
    try:
        L = load_json(labels_path)
        evs = L.get('ev') or {}
        diffs = []
        for n in sorted(set(evs) | set(CATALOG)):
            if n not in evs or n not in CATALOG:
                diffs.append([n, 'missing in ' + ('labels' if n not in evs else 'reference')])
                continue
            g, sb, od = CATALOG[n]
            x = evs[n]
            if x.get('g') != g:
                diffs.append([n, f'g {x.get("g")} != {g}'])
            if sb is not None and x.get('sb') != sb:
                diffs.append([n, f'sb {x.get("sb")} != {sb}'])
            if x.get('od') != od:
                diffs.append([n, f'od {x.get("od")} != {od}'])
            if bool(x.get('auto')) != (n in AUTO):
                diffs.append([n, f'auto {x.get("auto")}'])
            if x.get('st', 'live') != STATUS.get(n, 'live'):
                diffs.append([n, f'st {x.get("st")}'])
        out['meta']['catalogDiff'] = diffs
    except (OSError, ValueError) as err:
        out['meta']['catalogDiff'] = [['_error', str(err)]]
else:
    out['meta']['catalogDiff'] = None

json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write('\n')
