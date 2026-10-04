# Kitabu cha Wageni — a Small AI guestbook for a coffee-farm host

*Kitabu cha wageni* is Swahili for "guestbook". This is our entry to the Hack-Nation × World Bank
**Small AI for Development** hackathon, tourism track (Annex C).

> **Because of this tool, Noor will hear — in Swahili, within days of each visit — what her foreign
> visitors loved and what they want improved, and can thank them in their own language. Today she
> never learns this, because the feedback is written in languages she cannot read and the guide who
> translated has gone home.** We know because Tanzania's visitors mostly come from Italy, France,
> the US, Germany, Poland and China (NBS 2024), the brief says visitors "have help translating
> through a local guide", and Noor "has no way of knowing what value she created".

## What it does

| When | What happens | AI? |
|---|---|---|
| **Before** guests arrive | The tour company's weekly booking feed arrives when the helper connects (e.g. Noor's daughter at the weekend). Noor's basic phone gets a Swahili SMS: who is coming, when, which language. The app prepares only the language packs those guests need. | No — plain rules |
| **During** the visit | Guests write in a printed guestbook (box **A**: what they liked, box **B**: what could be better), or leave a voice note. No phone, power or internet needed. | No |
| **After** — at the weekend | The helper photographs boxes A and B (or uploads voice notes). On the phone, offline: handwriting/print is read, voice is transcribed, everything is translated to an English pivot, and each sentence is sorted into a **fixed list of 10 topics** with good/bad. Anything uncertain is flagged for a person. | **Yes** |
| | Noor gets a **Swahili summary** structured exactly as Annex C asks: what visitors keep coming back to, what they wish were different, and a new-product idea only when the evidence is strong (≥3 guests and ≥40%). She can listen to it. Every point links to the guests' own words. | Text is human-written templates; AI only fills counts and topic names |
| | **Thank-you messages** in each guest's language with the exact Swahili equivalent beside it, sent only if the guest ticked consent, and only after Noor approves. | Picks the topic the guest liked |
| | An **anonymized report** (counts only — no names, contacts or quotes) for the guide / tourism centre, shared only when Noor agrees. | No |

Where it sits in Noor's day: on Monday her basic phone tells her who is coming; during the week guests
write in the book while she works; at the weekend her daughter (or a paid young helper) spends ten
minutes photographing pages; Noor listens to the summary and approves the thank-yous.

## Why AI here — and what is deliberately *not* AI

A listing, a booking page or an SMS already solve discovery and scheduling (the brief's Jordan example).
What they cannot do is **read handwriting and speech in Italian, French, German, Chinese… and turn it
into something Noor understands in Swahili**. That is the only place we use AI:

* **Computer vision** — Tesseract OCR reads the photographed boxes (low-confidence words are highlighted for correction).
* **Speech** — Whisper (base) transcribes and translates voice notes, one model for ~100 languages.
* **Translation** — one small Opus-MT model per guest language ("language pack"), guest language → English.
* **Classification** — MiniLM sentence embeddings match each sentence to the closest of 10 fixed topics;
  DistilBERT gives good/bad when the guestbook box is unknown (voice notes).

Bookings, the SMS, the language-pack planner, summaries and messages are plain code and human-written templates.

## Small AI constraints (section 06 of the brief)

| Rule | How we meet it |
|---|---|
| Runs on a device the user already has | Noor's own basic phone receives the SMS; the household smartphone runs the app in its browser (installable to the home screen). The guestbook is paper. |
| Core feature works offline | After a one-time download, OCR, speech, translation, topic sorting, summaries and messages all run on the phone with no connection. A service worker caches the app. Connection is only used in the weekly helper window (booking feed, downloads, sending thank-yous). |
| Model files small enough to side-load or send over a weak link | Shared models: Whisper base ~77 MB, MiniLM ~23 MB, DistilBERT ~67 MB. Each guest-language pack ~130 MB (quantized). Only booked languages are downloaded; the 3 most common are kept; rare ones are deleted after the visit. (An Android build with ML Kit would be ~30 MB per language.) |
| At least one interaction in a local language | **Swahili**: every screen, the summary (text and voice), the SMS and the Swahili side of every message. |
| How would it fare in a less-supported language? | Noor's home language is **Chagga** (Kichagga). There is no translation model for it at any size, and ElevenLabs has no Chagga voice. Meta MMS has speech models for three Chagga varieties (Vunjo, Machame, Mochi), trained on Bible readings. That is why Swahili is the core and why everything Noor reads is a human-written template rather than machine translation. |

## Guardrails and responsible AI

* **A person decides.** The AI never sends anything. Thank-you messages open in Noor's email/SMS app only after she presses "approve"; reports are shared only after she ticks "I have read this".
* **"Not sure — ask a person."** Topic similarity below 0.30, sentiment confidence below 0.85, a sentence that contradicts the box it was written in, and low-confidence OCR words are all flagged *Angalia* (check) instead of guessed. The summary tells Noor how many sentences need checking.
* **No hallucination by design.** The classifier can only answer with one of 10 topics or "other". All Swahili text Noor sees is human-written; the AI fills in numbers and topic names. Product interest is found by fixed keywords. Every summary point shows the guest's original words.
* **Too little data → says so.** With fewer than 5 guests the summary warns it is too early for big decisions; product ideas need ≥3 guests and ≥40%.
* **Consent.** The guestbook has a multilingual consent box. Without the tick, contact details are not stored at all, and no message can be sent.
* **Where the data sits.** Only on the phone (IndexedDB). No server, no account. The guide/tourism-centre report has no names, contacts or quotes. If the phone is lost or shared: use the phone lock; "Delete all data" wipes everything; guests can be deleted one by one.
* **No profiling.** No face recognition and no guessing nationality from appearance. Language comes from the booking or what the guest wrote; a language is not a nationality.
* **Jobs.** The guide stays in the loop (receives the anonymized report) instead of being replaced; the helper role can become paid work for local youth serving several farms.

## Data

### 1. Evidence that the problem is real

| Fact | Source |
|---|---|
| 2,141,895 international visitors to Tanzania in 2024, a record | Bank of Tanzania et al., [2024 International Visitors' Exit Survey](https://www.bot.go.tz/Publications/Other/Tanzania%20Tourism%20Sector%20Survey%20Report/en/2026022617081267.pdf) (NBS counts 2,662,219 with a different method: [TanzaniaInvest](https://www.tanzaniainvest.com/tourism/tourist-arrivals-2024)) |
| Over 86% first heard of Tanzania through tour operators, agents or word of mouth; US 15%, Italy 11.8%, France 7.3% of mainland visits | 2024 Exit Survey, via [Tourism Update](https://www.tourismupdate.com/article/tanzania-highlights-top-visitor-trends-in-2024) |
| Top non-African markets 2024: Italy, France, USA, Germany, Poland, China, UK | NBS, via [TanzaniaInvest](https://www.tanzaniainvest.com/tourism/tourist-arrivals-2024) — used for the default language packs |
| Travel & tourism: 9.5% of Tanzania's economy and over 1.4 million jobs (2023) | [WTTC Economic Impact Research 2024](https://wttc.org/news/tanzanias-travel-and-tourism-reached-record-breaking-levels-in-2023) |
| Sub-Saharan Africa: women 22% less likely than men to own a smartphone, 26% less likely to use mobile internet (2025) | [GSMA Mobile Gender Gap Report 2026](https://www.connectingafrica.com/digital-divide/sub-saharan-africa-s-mobile-gender-gap-narrows-further) |
| Tanzanian women: 40% have a mobile-money account vs 49% of men (Findex 2021) | [GSMA](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/programme/mobile-money/limited-usage-women-and-mobile-money-in-tanzania/) |
| Coffee-farm visits like Noor's exist on Kilimanjaro's slopes (Materuni, Chagga families), reached with an English-speaking guide | e.g. [GetYourGuide listing](https://www.getyourguide.com/moshi-l32320/parc-national-du-kilimandjaro-visite-cascades-et-caf-t266952/) |
| **Gap we fill:** World Bank Enterprise Surveys cover only firms with 5+ employees — a one-family farm tour is invisible in the data. The app produces structured, consented feedback for exactly these operators. | [Enterprise Surveys methodology](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/IC.FRM.FREG.ZS) |

### 2. Models and data we build with

| What | Source / license | Size | What it does **not** cover |
|---|---|---|---|
| Opus-MT translation packs: it, fr, de, zh, es, pl, nl, ru, ja, ko → en | Helsinki-NLP via `Xenova/opus-mt-*`, CC-BY 4.0; trained on OPUS | ~130 MB each (q8) | No Swahili or Chagga model; trained mostly on web/subtitle text, not handwritten tourist feedback; English pivot loses nuance |
| Whisper base | OpenAI via `Xenova/whisper-base`, MIT | ~77 MB | Weak on noisy outdoor audio and on Swahili accents in the base size; language must be given (from the booking) |
| all-MiniLM-L6-v2 (topics) | sentence-transformers, Apache-2.0 | ~23 MB | English only (that is why we pivot); generic web training, not farm-tour language |
| DistilBERT SST-2 (sentiment) | Apache-2.0; trained on movie reviews | ~67 MB | Movie-review domain; only used when the guestbook box is unknown |
| Tesseract OCR + tessdata | Apache-2.0 | 2–15 MB per language | Trained on printed text: messy handwriting is often misread — hence highlighted words and human correction |
| franc-min (language hint) | MIT | <1 MB | Short texts are unreliable; only a suggestion |
| FLORES-200 | Meta, CC BY-SA 4.0 | 3,001 sentences × 200 languages | Benchmark only (scores reported, data not redistributed); news-style text |
| ElevenLabs `eleven_v3` voice clips | Synthetic voice, generated once from our own Swahili phrases | ~48 short clips | Covers only fixed phrases; no Chagga |
| `public/data/demo.json`, `eval-set.json`, `bookings.json` | **Synthetic**, written by the team, labeled as such | 6 guests, 48 labeled sentences, 30 translation pairs, 5 bookings | Not real guests; written by the same people who wrote the topic examples, so scores may be optimistic |

Considered and **not** used: NLLB-200 (covers Swahili, but non-commercial license and ~900 MB quantized) and
Meta MMS (non-commercial). Everything we ship is permissively licensed, so a cooperative or tourism board could deploy it.
We do not scrape review sites (their terms forbid it); we use public listings only as qualitative evidence.

## Evidence it works

* **Accuracy check** — `eval.html` in the app, and the GitHub Action *Accuracy check*: runs the app's own code on
  the labeled set (topic accuracy, precision when answered, how often it says "not sure", sentiment) and scores every
  translation pack on **FLORES-200 devtest** (chrF), plus topic accuracy after translation. Results are committed to
  `public/data/eval-results.json`.
* **Logic tests** — `npm test` checks the language-pack planner, summaries, consent rules, templates and voice clips.
* **Demo data** — More → Load example data, then Summary → Analyse now, runs the full on-device pipeline on synthetic
  Italian, French, Chinese, English and Swahili feedback.

## Limits and what happens next

1. Real pilot with one cooperative: collect consented guestbook pages to replace the synthetic test set.
2. Android build with ML Kit (~30 MB per language) and a handwriting model (TrOCR) fine-tuned on real pages.
3. Read the printed **sales log** (`print/sales-log.html`) and link sales to feedback ("guests who loved grinding coffee bought beans").
4. Native-speaker review of every Swahili string; Chagga voice prompts recorded by the community (and contributed to Common Voice).
5. The tourism centre aggregates anonymized reports across farms — at that scale the topic patterns become far more useful.
6. A paid "digital helper" role for local youth, one helper serving several farms.

## Run it

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # static site in dist/
npm test         # logic checks
```

Hosting: Lovable (main) and GitHub Pages (manual backup workflow). Swahili voice clips: add the repository secret
`ELEVENLABS_API_KEY`; the *Swahili voice clips* workflow generates `public/audio/sw/` from `audio/phrases-sw.json`.

## Our take: what localizing AI means

Localizing AI is not translating an app. It is designing for the phone that is actually in the house, the hours
when there is signal, the language the host thinks in — and being honest about which languages the models do not
speak yet. Noor's Swahili is supported; her Chagga is not, by anyone. So the tool keeps a person in the loop, and
the local young people who run it are the part that scales.
