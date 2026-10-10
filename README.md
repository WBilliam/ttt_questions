# Practice Quiz

Ελληνικό, mobile-first PWA εξάσκησης χωρίς λογαριασμούς ή backend. Το αποθετήριο περιλαμβάνει 12 ερωτήσεις επίδειξης και pipeline εισαγωγής από Excel.

## Τοπική εκτέλεση

```bash
npm install
npm run content:sample
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

1. Αντικαταστήστε το `content/demo/questions.xlsx` ή αλλάξτε τη διαδρομή `workbook` στο `content/content.config.json`.
2. Τοποθετήστε τις εικόνες στον φάκελο που δηλώνει το `imagesDir`.
3. Διατηρήστε τις στήλες `category`, `question`, `option_a` έως `option_f`, `correct_option`, `explanation`, `image`, `image_alt`.
4. Αλλάξτε το `contentMode` σε `production` όταν το περιεχόμενο είναι τελικό.
5. Εκτελέστε `npm run content:import` και ελέγξτε αναλυτικά σφάλματα, προειδοποιήσεις και πλήθος ανά κατηγορία.

Οι επιλογές πρέπει να είναι συνεχόμενες και να υπάρχουν τουλάχιστον δύο. Το `correct_option` περιέχει γράμμα `A`–`F`. Η στήλη `image` περιέχει μόνο όνομα αρχείου, όχι διαδρομή. Τα αρχικά Word/PDF δεν αναπτύσσονται στον ιστότοπο.

## GitHub Pages

Το workflow απορρίπτει ανάπτυξη όταν `contentMode` είναι `demo`. Για εσκεμμένη προσωρινή επίδειξη, τρέξτε χειροκίνητα το workflow και ενεργοποιήστε το `allow_demo`. Για κανονική ανάπτυξη αλλάξτε το περιεχόμενο σε `production` και ενεργοποιήστε το GitHub Pages με πηγή `GitHub Actions`.

Για Cloudflare Pages χρησιμοποιήστε build command `npm run build` και output directory `dist`. Αν η εφαρμογή φιλοξενείται σε υποδιαδρομή, ορίστε `BASE_PATH` με αρχικό και τελικό `/`.

## Offline ενημερώσεις

Το service worker προφορτώνει κώδικα, δεδομένα και εικόνες. Νέα έκδοση ενεργοποιείται μόνο αφού ολοκληρωθεί η νέα cache. Οι συνεδρίες μένουν μόνο στη μνήμη και επανεκκίνηση ή ανανέωση επιστρέφει στην Αρχική.
