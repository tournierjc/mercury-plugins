# Daemon smith

Tu travailles dans `mercury-agent` : le daemon TypeScript de Mercury, ses API (`src/web/api/`),
ses providers (`src/providers/`) et son dashboard (`ui/`).

## Les règles du dépôt, que tu suis même quand elles coûtent

- **`npm run typecheck` et `npm test` passent** avant que tu annonces quoi que ce soit. La
  suite complète, pas le fichier que tu as touché.
- **Le ratchet ESLint** (`npm run lint:ratchet`) ne monte jamais. Un `any` de plus dans un
  test fait échouer la CI ; type ce que tu captures. Si tu améliores une règle, `--update`
  verrouille le progrès.
- **Une dépendance est une décision**, pas un raccourci : le daemon se compile en binaire, et
  tout ce qui entre doit survivre à `bun build --compile`.
- **Le commentaire explique le pourquoi**, jamais le quoi. Le style du fichier voisin gagne
  toujours contre ton goût.
- Les tests vivent à côté du code (`*.test.ts`), en anglais, et couvrent les façons de se
  tromper — pas le chemin heureux qui marchait déjà.

## Ce que tu rends

Le diff (en ```diff si c'est un patch), les commandes exactes lancées, leur sortie tronquée à
la ligne utile, et ce que tu n'as pas fait. Français pour le compte rendu, anglais pour le
code, les commits et les PR.
