# Petal — a private cycle tracker

Petal is an original, locally hosted period-tracking web app with a soft pink theme. Its Wellness tab includes private mood, food, and journal notes, optional Christian reading prompts, guided self-help exercises, body and hygiene education, and general PCOS day-to-day tips. Period, symptom, wellness, birthday, and theme data are stored in this browser's local storage. Petal does not create an account, collect analytics, or send your notes to a server. Its optional AI chat runs a downloaded model directly in your browser.

## Run locally

You need Node.js 18 or newer.

```sh
cd period-tracker
npm ci
npm start
```

Open the local address printed by Vite (usually [http://localhost:5173](http://localhost:5173)). `npm run build` makes the static site in `dist/`; `npm run preview` serves that production build locally.

### Run the optional AI chat offline

Open **Today → Ask your cycle guide → Load offline model** while online. The first download is about 280 MB. Petal then keeps the model in browser storage, so later chats can run without an internet connection. Leave around 1 GB free for model and browser storage. The website itself is also cached by a service worker after visiting it online.

The model is `Qwen2.5-0.5B-Instruct`, a small model that needs a compatible browser with **WebGPU** and approximately 945 MB of GPU memory. About 280 MB of model files are downloaded from Hugging Face and GitHub the first time you request it. These are model/runtime files only; no questions or health data are sent to those sites. After the files are cached, inference runs locally and works offline. The model is intentionally small, so its answers can be less accurate and detailed than a larger hosted model. Petal cannot make it run on devices that lack WebGPU, memory, or enough storage; period tracking and the rest of the app still work on those devices.

The model answers general questions; it is **not a period specialist, doctor, or medical advice**. By default Petal sends only the question to the model running in the same browser. If you check **Include my saved cycle data with this question**, that reply also uses your period dates, daily flow, symptoms, and cycle estimates. The checkbox starts unchecked. Neither chat history nor cycle data is sent to Hugging Face, Vercel, or GitHub Pages. Chat history clears when you reload the page. Model files use browser storage and can be removed if the browser's site data is cleared or evicted.

**Hosting:** In Vercel, import your repository and set its project root to `period-tracker`; Vercel detects the Vite build script and `dist` output. For GitHub Pages, place the contents of `period-tracker` at the root of a GitHub repository, push to `main`, and enable **Settings → Pages → GitHub Actions**. The included `.github/workflows/deploy-pages.yml` builds and deploys the static app when this project is the repository root. HTTPS hosting is required for WebGPU and offline installation. The included Vite configuration uses relative asset paths for project-page hosting.

## Wellness, faith, and privacy

Open **Wellness** to save mood check-ins, food notes, or a private reflection for a selected date. These records are included in **Settings → Export a JSON copy** and removed by **Delete all tracker data**. They are stored in the same local-only data as period entries; avoid saving sensitive information on a shared device. Removing browser site data also removes your saved records.

The optional Bible reading prompts are for personal reflection, not medical treatment. The guided grounding, emotional-reflection, and breathing exercises are self-help tools, not therapy or crisis care. Educational content about body systems, hygiene, and PCOS is general information, not diagnosis or a treatment plan. Petal does not recommend restrictive diets or calorie tracking.

## Try the prediction logic

Run the automated unit tests:

```sh
npm test
```

For a manual app check, select **Settings → Delete all data** to start with a blank tracker. Open **Calendar → Log period** and enter `2025-01-01` through `2025-01-05`. Add another period from `2025-01-29` through `2025-02-02`, a third from `2025-02-26` through `2025-03-02`, and a fourth from `2025-03-26` through `2025-03-30`. Petal should show an average 28-day cycle and five-day average period. Three period starts provide only two completed cycle lengths, so the estimate is still marked rough. With the fourth start, three cycle lengths are available. The next period estimate is around April 23, with an estimated fertile window around April 4–10. Dates are for demonstrating the calculator, not medical guidance.

To see an irregular-cycle range, use period starts about 24, 40, and 28 days apart. The calendar should show a predicted period window rather than a single predicted day. Real app dates are saved on your device; exported JSON files are your responsibility to store safely.

On the first visit, open **Today → Ask your cycle guide** and load the model while online. Once the model says **Model ready**, test a question; after the page and model have been cached, you can disconnect and ask another question. WebGPU availability and model generation vary by device.

## Important health information

Cycle and fertile-window estimates are uncertain and can be wrong. Petal is not contraception, a pregnancy test, a diagnosis, or a medical device. Pregnancy can occur outside an estimated fertile window. Ask a healthcare professional about cycles shorter than 21 or longer than 35 days, bleeding longer than 7 days, very heavy bleeding, severe pain, or a missed period. Astrology is clearly marked as entertainment and is never used in health calculations.

## Project files

- `index.html` holds the app shell, navigation, and entry forms.
- `styles.css` defines the responsive layout, colors, and dark theme.
- `src/cycle.js` validates dates and calculates cycle estimates.
- `src/moon.js` calculates approximate Moon signs and birth Sun signs.
- `src/app.js` renders screens, handles local storage, and runs an optional in-browser model.
- `src/wellness.js` validates and normalizes local mood, food, and journal records.
- `src/assistant-worker.js` runs the model away from the screen-rendering thread.
- `vite.config.js` builds the Vercel/GitHub Pages site and installs its offline app cache.
- `.github/workflows/deploy-pages.yml` deploys the project when it is the root of a GitHub Pages repository.
- `tests/cycle.test.js` checks date, cycle, prediction, zodiac, and wellness-data validation.
