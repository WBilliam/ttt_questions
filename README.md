# Practice Quiz

Ελληνικό, mobile-first PWA εξάσκησης χωρίς λογαριασμούς ή backend. Η τρέχουσα τράπεζα περιλαμβάνει 666 ερωτήσεις παραγωγής σε 20 κατηγορίες και 6 οπτικές ερωτήσεις.

## Τοπική εκτέλεση

```bash
npm install
npm run content:import
npm run dev
```

Έλεγχοι και production build:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

## Αντικατάσταση ερωτήσεων

1. Αντικαταστήστε το `content/production/questions.xlsx` ή αλλάξτε τη διαδρομή `workbook` στο `content/content.config.json`.
2. Τοποθετήστε τις εικόνες στον φάκελο που δηλώνει το `imagesDir`.
3. Διατηρήστε τις στήλες `category`, `question`, `option_a` έως `option_f`, `correct_option`, `explanation`, `image`, `image_alt`.
4. Αλλάξτε το `contentMode` σε `production` όταν το περιεχόμενο είναι τελικό.
5. Εκτελέστε `npm run content:import` και ελέγξτε αναλυτικά σφάλματα, προειδοποιήσεις και πλήθος ανά κατηγορία.

Οι επιλογές πρέπει να είναι συνεχόμενες και να υπάρχουν τουλάχιστον δύο. Το `correct_option` περιέχει γράμμα `A`–`F`. Η στήλη `image` περιέχει μόνο όνομα αρχείου, όχι διαδρομή. Τα αρχικά Word/PDF δεν αναπτύσσονται στον ιστότοπο.

## Εξαγωγή από τα έγγραφα πηγής

Ο φάκελος `question docs` παραμένει τοπικός και αγνοείται από το Git. Για νέα εξαγωγή απαιτούνται Python 3, `python-docx`, `pdfplumber` και Pillow:

```bash
python -m pip install python-docx==1.2.0 pdfplumber==0.11.8 Pillow==12.1.1
npm run content:test-extractor
npm run content:extract
npm run content:import
```

Η εξαγωγή γράφει το κανονικοποιημένο JSON, το Excel παραγωγής, τις οπτικές επιλογές και το `extraction-report.json` στο `content/production`. Οι ασαφείς ή ασύμβατες εγγραφές καταγράφονται στην αναφορά και δεν εισάγονται με εικασία. Ερωτήσεις με ίδιο κείμενο αλλά διαφορετικές επιλογές ή σωστή απάντηση διατηρούνται ως διακριτές παραλλαγές και καταγράφονται επίσης στην αναφορά· αφαιρούνται μόνο τα πλήρως ίδια αντίγραφα.

## GitHub Pages

Το workflow απορρίπτει ανάπτυξη όταν `contentMode` είναι `demo`. Για εσκεμμένη προσωρινή επίδειξη, τρέξτε χειροκίνητα το workflow και ενεργοποιήστε το `allow_demo`. Για κανονική ανάπτυξη αλλάξτε το περιεχόμενο σε `production` και ενεργοποιήστε το GitHub Pages με πηγή `GitHub Actions`.

Για Cloudflare Pages χρησιμοποιήστε build command `npm run build` και output directory `dist`. Αν η εφαρμογή φιλοξενείται σε υποδιαδρομή, ορίστε `BASE_PATH` με αρχικό και τελικό `/`.

## Offline ενημερώσεις

Το service worker προφορτώνει κώδικα, δεδομένα και εικόνες. Νέα έκδοση ενεργοποιείται μόνο αφού ολοκληρωθεί η νέα cache. Οι συνεδρίες μένουν μόνο στη μνήμη και επανεκκίνηση ή ανανέωση επιστρέφει στην Αρχική.
