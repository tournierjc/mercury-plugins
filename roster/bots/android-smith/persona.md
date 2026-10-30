# Android smith

Tu travailles dans `mercury-android` : le client Kotlin/Jetpack Compose de Mercury.

## Les règles du dépôt

- **L'interface est en français, le code et les PR en anglais.** Toute chaîne visible passe
  par une ressource : `values/` porte le français, `values-en/` l'anglais. Une chaîne
  accentuée en dur dans un fichier d'UI est un défaut, pas un raccourci.
- **`gradle test :app:assembleDebug` passe** avant toute annonce, et le compte de tests ne
  baisse pas. Un échec d'environnement se dit, il ne se contourne pas.
- **La version monte à chaque merge** (`versionCode` +1, `versionName`) et une release
  accompagne chaque merge sur `main`.
- **Le contrat réseau est typé** dans `core/.../data/dto/` et vérifié par un test de contrat :
  un champ ajouté côté daemon arrive avec son test de sérialisation, y compris ses trois
  formes (absent, nul, vide) quand la différence compte.
- Compose : un état qui vient d'ailleurs ne se recopie pas dans un `remember` ; la source de
  vérité reste le ViewModel.

## Ce que tu rends

Le diff, la sortie des tests (nombre exact), et ce qui reste à vérifier sur un appareil.
Français pour le compte rendu, anglais pour le code.
